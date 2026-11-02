package com.facedetection.service;

import com.facedetection.model.Attendance;
import com.facedetection.model.Student;
import com.facedetection.repository.AttendanceRepository;
import com.facedetection.repository.ClassAttendanceProjection;
import com.facedetection.repository.ClassStudentCountProjection;
import com.facedetection.repository.DailyAttendanceProjection;
import com.facedetection.repository.StudentRepository;
import com.facedetection.repository.UserRepository;
import com.facedetection.websocket.AttendanceEventMessage;
import jakarta.persistence.EntityNotFoundException;
import java.time.Clock;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.time.LocalTime;
import java.time.format.DateTimeFormatter;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.TreeSet;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.messaging.simp.SimpMessagingTemplate;
import org.springframework.security.access.AccessDeniedException;
import org.springframework.security.core.Authentication;
import org.springframework.security.core.GrantedAuthority;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
@Transactional
public class AttendanceService {

    private static final Clock UTC_CLOCK = Clock.systemUTC();
    private static final Logger LOGGER = LoggerFactory.getLogger(AttendanceService.class);
    private static final DateTimeFormatter TIME_FORMATTER = DateTimeFormatter.ofPattern("hh:mm a", Locale.ENGLISH);

    private final AttendanceRepository attendanceRepository;
    private final StudentRepository studentRepository;
    private final UserRepository userRepository;
    private final SecurityAuditService securityAuditService;
    private final SimpMessagingTemplate messagingTemplate;

    public AttendanceService(
            AttendanceRepository attendanceRepository,
            StudentRepository studentRepository,
            UserRepository userRepository,
            SecurityAuditService securityAuditService,
            SimpMessagingTemplate messagingTemplate) {
        this.attendanceRepository = attendanceRepository;
        this.studentRepository = studentRepository;
        this.userRepository = userRepository;
        this.securityAuditService = securityAuditService;
        this.messagingTemplate = messagingTemplate;
    }

    @Transactional(readOnly = true)
    public List<Attendance> getAttendanceByDate(LocalDate date) {
        Long coordinatorId = currentCoordinatorIdOrNull();
        if (coordinatorId != null) {
            return attendanceRepository.findByDateAndStudentTeacherIdOrderByEntryTimeDesc(date, coordinatorId);
        }
        return attendanceRepository.findByDateOrderByEntryTimeDesc(date);
    }

    @Transactional(readOnly = true)
    public List<Attendance> getAttendanceByStudent(Long studentId, LocalDate start, LocalDate end) {
        Long coordinatorId = currentCoordinatorIdOrNull();
        if (coordinatorId != null) {
            assertStudentOwnedByCoordinator(studentId, coordinatorId);
            return attendanceRepository.findByStudentIdAndStudentTeacherIdAndDateBetweenOrderByEntryTimeDesc(
                    studentId,
                    coordinatorId,
                    start,
                    end);
        }
        return attendanceRepository.findByStudentIdAndDateBetweenOrderByEntryTimeDesc(studentId, start, end);
    }

    @Transactional(readOnly = true)
    public List<Attendance> getLateArrivals(LocalDate date, LocalTime afterTime) {
        LocalTime threshold = afterTime != null ? afterTime : LocalTime.of(9, 15);
        LocalDateTime cutoff = LocalDateTime.of(date, threshold);
        Long coordinatorId = currentCoordinatorIdOrNull();
        if (coordinatorId != null) {
            return attendanceRepository.findByDateAndStudentTeacherIdAndEntryTimeAfterOrderByEntryTimeAsc(
                    date,
                    coordinatorId,
                    cutoff);
        }
        return attendanceRepository.findByDateAndEntryTimeAfterOrderByEntryTimeAsc(date, cutoff);
    }

    public Attendance markEntry(Long studentId) {
        return markEntry(studentId, LocalDateTime.now(UTC_CLOCK), "AI", null);
    }

    public Attendance markEntry(Long studentId, LocalDateTime requestedEntryTime, String markedBy, String sourceEventId) {
        if (studentId == null) {
            throw new IllegalArgumentException("Student id is required to mark attendance");
        }
        if (markedBy == null || markedBy.isBlank()) {
            throw new IllegalArgumentException("markedBy is required");
        }

        Student student = studentRepository.findById(studentId)
                .orElseThrow(() -> new EntityNotFoundException("Student not found with id: " + studentId));

        Long coordinatorId = currentCoordinatorIdOrNull();
        if (coordinatorId != null) {
            assertStudentOwnedByCoordinator(studentId, coordinatorId);
        }

        LocalDateTime normalizedEntryTime = normalizeEntryTime(requestedEntryTime);
        LocalDate attendanceDate = normalizedEntryTime.toLocalDate();
        String normalizedMarkedBy = markedBy.trim().toUpperCase();
        String normalizedSourceEventId = normalizeSourceEventId(sourceEventId);

        if (normalizedSourceEventId != null) {
            Attendance existingByEvent = attendanceRepository.findBySourceEventId(normalizedSourceEventId)
                    .orElse(null);
            if (existingByEvent != null) {
                return existingByEvent;
            }
        }

        Attendance existingByDate = attendanceRepository.findByStudentIdAndDate(studentId, attendanceDate)
                .orElse(null);
        if (existingByDate != null) {
            return existingByDate;
        }

        Attendance target = new Attendance();
        target.setStudent(student);
        target.setDate(attendanceDate);
        target.setEntryTime(normalizedEntryTime);
        target.setMarkedBy(normalizedMarkedBy);
        target.setSourceEventId(normalizedSourceEventId);

        Attendance saved = attendanceRepository.save(target);
        securityAuditService.attendanceEntryRecorded(
                currentActor(),
                student.getId(),
                attendanceDate,
                normalizedEntryTime,
                normalizedMarkedBy);
        broadcastAttendanceEvent(saved);
        return saved;
    }

    public Attendance markAttendance(Attendance attendance) {
        if (attendance == null) {
            throw new IllegalArgumentException("Attendance must not be null");
        }
        if (attendance.getStudent() == null || attendance.getStudent().getId() == null) {
            throw new IllegalArgumentException("Student id is required to mark attendance");
        }
        LocalDateTime resolvedEntryTime = attendance.getEntryTime();
        if (resolvedEntryTime == null && attendance.getDate() != null) {
            resolvedEntryTime = attendance.getDate().atTime(LocalDateTime.now(UTC_CLOCK).toLocalTime());
        }
        return markEntry(
                attendance.getStudent().getId(),
                resolvedEntryTime,
                attendance.getMarkedBy(),
                attendance.getSourceEventId());
    }

    @Transactional(readOnly = true)
    public Map<String, Object> getSummaryByDate(LocalDate date) {
        Long coordinatorId = currentCoordinatorIdOrNull();
        long presentCount = coordinatorId != null
                ? attendanceRepository.countByDateAndStudentTeacherId(date, coordinatorId)
                : attendanceRepository.countByDate(date);
        long totalStudents = coordinatorId != null
                ? studentRepository.countByTeacherId(coordinatorId)
                : studentRepository.count();
        long absentCount = Math.max(totalStudents - presentCount, 0);

        Map<String, Object> summary = new LinkedHashMap<>();
        summary.put("date", date);
        summary.put("present", presentCount);
        summary.put("absent", absentCount);
        summary.put("total", totalStudents);
        summary.put("attendancePercentage", calculatePercentage(presentCount, totalStudents));
        return summary;
    }

    public void processAiAttendance(List<Attendance> aiRecords) {
        if (aiRecords == null || aiRecords.isEmpty()) {
            return;
        }

        for (Attendance record : aiRecords) {
            if (record == null) {
                continue;
            }
            markEntry(
                    record.getStudent() != null ? record.getStudent().getId() : null,
                    record.getEntryTime(),
                    record.getMarkedBy(),
                    record.getSourceEventId());
        }
    }

    @Transactional(readOnly = true)
    public Map<String, Object> getDailyTrend(LocalDate fromDate, LocalDate toDate) {
        Long coordinatorId = currentCoordinatorIdOrNull();
        List<DailyAttendanceProjection> rows = coordinatorId != null
                ? attendanceRepository.aggregateDailyAttendanceForTeacher(coordinatorId, fromDate, toDate)
                : attendanceRepository.aggregateDailyAttendance(fromDate, toDate);
        Map<LocalDate, Long> entriesByDate = new HashMap<>();
        for (DailyAttendanceProjection row : rows) {
            entriesByDate.put(row.getDate(), valueOrZero(row.getEntryCount()));
        }

        long totalStudents = coordinatorId != null
                ? studentRepository.countByTeacherId(coordinatorId)
                : studentRepository.count();
        List<Map<String, Object>> data = new ArrayList<>();

        for (LocalDate date = fromDate; !date.isAfter(toDate); date = date.plusDays(1)) {
            long present = entriesByDate.getOrDefault(date, 0L);
            long total = totalStudents;
            long absent = Math.max(total - present, 0);

            Map<String, Object> item = new LinkedHashMap<>();
            item.put("date", date);
            item.put("present", present);
            item.put("absent", absent);
            item.put("total", total);
            item.put("attendancePercentage", calculatePercentage(present, total));
            data.add(item);
        }

        Map<String, Object> response = new LinkedHashMap<>();
        response.put("from", fromDate);
        response.put("to", toDate);
        response.put("data", data);
        return response;
    }

    @Transactional(readOnly = true)
    public Map<String, Object> getStudentTrend(Long studentId, LocalDate fromDate, LocalDate toDate) {
        Long coordinatorId = currentCoordinatorIdOrNull();
        boolean studentExists = coordinatorId != null
                ? studentRepository.existsByIdAndTeacherId(studentId, coordinatorId)
                : studentRepository.existsById(studentId);
        if (!studentExists) {
            throw new EntityNotFoundException("Student not found with id: " + studentId);
        }

        List<DailyAttendanceProjection> rows = coordinatorId != null
                ? attendanceRepository.aggregateStudentTrendForTeacher(studentId, coordinatorId, fromDate, toDate)
                : attendanceRepository.aggregateStudentTrend(studentId, fromDate, toDate);
        Map<LocalDate, Long> entriesByDate = new HashMap<>();
        for (DailyAttendanceProjection row : rows) {
            entriesByDate.put(row.getDate(), valueOrZero(row.getEntryCount()));
        }

        List<Map<String, Object>> data = new ArrayList<>();

        for (LocalDate date = fromDate; !date.isAfter(toDate); date = date.plusDays(1)) {
            long present = entriesByDate.getOrDefault(date, 0L) > 0 ? 1L : 0L;
            long total = 1L;
            long absent = total - present;

            Map<String, Object> item = new LinkedHashMap<>();
            item.put("date", date);
            item.put("present", present);
            item.put("absent", absent);
            item.put("total", total);
            item.put("attendancePercentage", calculatePercentage(present, total));
            data.add(item);
        }

        Map<String, Object> response = new LinkedHashMap<>();
        response.put("studentId", studentId);
        response.put("from", fromDate);
        response.put("to", toDate);
        response.put("data", data);
        return response;
    }

    @Transactional(readOnly = true)
    public Map<String, Object> getClassComparison(LocalDate date) {
        Long coordinatorId = currentCoordinatorIdOrNull();
        List<ClassAttendanceProjection> rows = coordinatorId != null
                ? attendanceRepository.aggregateClassWiseByDateAndTeacherId(date, coordinatorId)
                : attendanceRepository.aggregateClassWiseByDate(date);
        List<ClassStudentCountProjection> classCounts = coordinatorId != null
                ? studentRepository.countStudentsByClassGroupAndTeacherId(coordinatorId)
                : studentRepository.countStudentsByClassGroup();

        Map<String, Long> totalByClass = new HashMap<>();
        for (ClassStudentCountProjection row : classCounts) {
            totalByClass.put(row.getClassGroup(), valueOrZero(row.getStudentCount()));
        }

        Map<String, Long> presentByClass = new HashMap<>();
        for (ClassAttendanceProjection row : rows) {
            presentByClass.put(row.getClassGroup(), valueOrZero(row.getEntryCount()));
        }

        List<Map<String, Object>> data = new ArrayList<>();
        TreeSet<String> orderedClasses = new TreeSet<>(totalByClass.keySet());
        orderedClasses.addAll(presentByClass.keySet());

        for (String classGroup : orderedClasses) {
            long total = totalByClass.getOrDefault(classGroup, 0L);
            long present = presentByClass.getOrDefault(classGroup, 0L);
            long absent = Math.max(total - present, 0);

            Map<String, Object> item = new LinkedHashMap<>();
            item.put("classGroup", classGroup);
            item.put("present", present);
            item.put("absent", absent);
            item.put("total", total);
            item.put("attendancePercentage", calculatePercentage(present, total));
            data.add(item);
        }

        Map<String, Object> response = new LinkedHashMap<>();
        response.put("date", date);
        response.put("data", data);
        return response;
    }

    private void assertStudentOwnedByCoordinator(Long studentId, Long coordinatorId) {
        if (!studentRepository.existsByIdAndTeacherId(studentId, coordinatorId)) {
            throw new AccessDeniedException("Coordinator can access only assigned students");
        }
    }

    private Long currentCoordinatorIdOrNull() {
        Authentication authentication = SecurityContextHolder.getContext().getAuthentication();
        if (authentication == null) {
            return null;
        }
        if (hasRole(authentication, "ADMIN") || hasRole(authentication, "AI")) {
            return null;
        }
        if (!hasRole(authentication, "COORDINATOR") && !hasRole(authentication, "TEACHER")) {
            return null;
        }

        String username = authentication.getName();
        if (username == null || username.isBlank() || "anonymousUser".equals(username)) {
            throw new AccessDeniedException("Authentication required");
        }
        return userRepository.findByUsername(username)
                .orElseThrow(() -> new AccessDeniedException("User context not found"))
                .getId();
    }

    private boolean hasRole(Authentication authentication, String role) {
        String authority = "ROLE_" + role;
        for (GrantedAuthority grantedAuthority : authentication.getAuthorities()) {
            if (authority.equals(grantedAuthority.getAuthority())) {
                return true;
            }
        }
        return false;
    }

    private long valueOrZero(Long value) {
        return value == null ? 0L : value;
    }

    private double calculatePercentage(long numerator, long denominator) {
        if (denominator <= 0) {
            return 0.0;
        }
        return Math.round(((double) numerator / (double) denominator) * 10000.0) / 100.0;
    }

    private String normalizeSourceEventId(String sourceEventId) {
        if (sourceEventId == null) {
            return null;
        }
        String normalized = sourceEventId.trim();
        return normalized.isEmpty() ? null : normalized;
    }

    private LocalDateTime normalizeEntryTime(LocalDateTime requestedEntryTime) {
        LocalDateTime entryTime = requestedEntryTime != null ? requestedEntryTime : LocalDateTime.now(UTC_CLOCK);
        return entryTime.withNano(0);
    }

    private String currentActor() {
        Authentication authentication = SecurityContextHolder.getContext().getAuthentication();
        if (authentication == null || authentication.getName() == null || "anonymousUser".equals(authentication.getName())) {
            return "system";
        }
        return authentication.getName();
    }

    private void broadcastAttendanceEvent(Attendance attendance) {
        if (attendance == null || attendance.getEntryTime() == null || attendance.getStudent() == null) {
            return;
        }
        if (!"AI".equalsIgnoreCase(attendance.getMarkedBy())) {
            return;
        }

        Student student = attendance.getStudent();
        AttendanceEventMessage message = new AttendanceEventMessage(
                student.getId(),
                buildStudentName(student),
                attendance.getEntryTime(),
                attendance.getEntryTime().format(TIME_FORMATTER));
        try {
            messagingTemplate.convertAndSend("/topic/attendance", message);
        } catch (RuntimeException ex) {
            LOGGER.warn("Failed to broadcast attendance event for student {}", student.getId(), ex);
        }
    }

    private String buildStudentName(Student student) {
        String firstName = student.getFirstName() != null ? student.getFirstName().trim() : "";
        String lastName = student.getLastName() != null ? student.getLastName().trim() : "";
        String fullName = (firstName + " " + lastName).trim();
        if (!fullName.isEmpty()) {
            return fullName;
        }
        return student.getId() != null ? "Student " + student.getId() : "Unknown Student";
    }
}
