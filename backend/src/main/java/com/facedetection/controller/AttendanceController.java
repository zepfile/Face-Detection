package com.facedetection.controller;

import com.facedetection.model.Attendance;
import com.facedetection.model.Student;
import com.facedetection.service.AttendanceService;
import jakarta.validation.Valid;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Pattern;
import java.time.Clock;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.time.LocalTime;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import org.springframework.format.annotation.DateTimeFormat;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestHeader;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.server.ResponseStatusException;

@RestController
@RequestMapping("/api/attendance")
public class AttendanceController {

    private static final Clock UTC_CLOCK = Clock.systemUTC();

    private final AttendanceService attendanceService;

    public AttendanceController(AttendanceService attendanceService) {
        this.attendanceService = attendanceService;
    }

    @GetMapping
    @PreAuthorize("hasAnyRole('ADMIN','COORDINATOR')")
    public ResponseEntity<List<AttendanceResponse>> getAttendanceByDate(
            @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate date) {
        LocalDate targetDate = date != null ? date : LocalDate.now(UTC_CLOCK);
        List<AttendanceResponse> response = attendanceService.getAttendanceByDate(targetDate).stream()
                .map(this::toResponse)
                .toList();
        return ResponseEntity.ok(response);
    }

    @GetMapping("/student/{studentId}")
    @PreAuthorize("hasAnyRole('ADMIN','COORDINATOR')")
    public ResponseEntity<List<AttendanceResponse>> getAttendanceByStudent(
            @PathVariable Long studentId,
            @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate from,
            @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate to) {

        LocalDate endDate = to != null ? to : LocalDate.now(UTC_CLOCK);
        LocalDate startDate = from != null ? from : endDate;
        if (startDate.isAfter(endDate)) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "'from' date must be before or equal to 'to' date");
        }

        List<AttendanceResponse> response = attendanceService.getAttendanceByStudent(studentId, startDate, endDate).stream()
                .map(this::toResponse)
                .toList();
        return ResponseEntity.ok(response);
    }

    @PostMapping
    @PreAuthorize("hasAnyRole('ADMIN','COORDINATOR')")
    public ResponseEntity<AttendanceResponse> markManualAttendance(@Valid @RequestBody AttendanceRequest request) {
        Attendance created = attendanceService.markAttendance(toAttendance(request, "MANUAL", true, null));
        return ResponseEntity.status(HttpStatus.CREATED).body(toResponse(created));
    }

    @PostMapping("/ai")
    @PreAuthorize("hasAnyRole('ADMIN','COORDINATOR','AI')")
    public ResponseEntity<Map<String, Object>> processAiAttendance(
            @RequestHeader(value = "X-Idempotency-Key", required = false) String idempotencyKey,
            @RequestBody List<@Valid AttendanceRequest> aiRecords) {

        if (aiRecords == null || aiRecords.isEmpty()) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "AI attendance records must not be empty");
        }

        List<Attendance> records = aiRecords.stream()
                .map(record -> toAttendance(record, "AI", true, resolveSourceEventId(record, idempotencyKey)))
                .toList();

        attendanceService.processAiAttendance(records);

        Map<String, Object> response = new LinkedHashMap<>();
        response.put("message", "AI attendance processed");
        response.put("processedCount", records.size());
        response.put("date", LocalDate.now(UTC_CLOCK));
        return ResponseEntity.status(HttpStatus.ACCEPTED).body(response);
    }

    @GetMapping("/trends/daily")
    @PreAuthorize("hasAnyRole('ADMIN','COORDINATOR')")
    public ResponseEntity<Map<String, Object>> getDailyTrend(
            @RequestParam @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate from,
            @RequestParam @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate to) {
        if (from.isAfter(to)) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "'from' date must be before or equal to 'to' date");
        }
        return ResponseEntity.ok(attendanceService.getDailyTrend(from, to));
    }

    @GetMapping("/trends/student/{studentId}")
    @PreAuthorize("hasAnyRole('ADMIN','COORDINATOR')")
    public ResponseEntity<Map<String, Object>> getStudentTrend(
            @PathVariable Long studentId,
            @RequestParam @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate from,
            @RequestParam @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate to) {
        if (from.isAfter(to)) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "'from' date must be before or equal to 'to' date");
        }
        return ResponseEntity.ok(attendanceService.getStudentTrend(studentId, from, to));
    }

    @GetMapping("/trends/class")
    @PreAuthorize("hasAnyRole('ADMIN','COORDINATOR')")
    public ResponseEntity<Map<String, Object>> getClassComparison(
            @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate date) {
        LocalDate targetDate = date != null ? date : LocalDate.now(UTC_CLOCK);
        return ResponseEntity.ok(attendanceService.getClassComparison(targetDate));
    }

    @GetMapping("/late")
    @PreAuthorize("hasAnyRole('ADMIN','COORDINATOR')")
    public ResponseEntity<List<AttendanceResponse>> getLateArrivals(
            @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate date,
            @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.TIME) LocalTime after) {
        LocalDate targetDate = date != null ? date : LocalDate.now(UTC_CLOCK);
        LocalTime threshold = after != null ? after : LocalTime.of(9, 15);
        List<AttendanceResponse> response = attendanceService.getLateArrivals(targetDate, threshold).stream()
                .map(this::toResponse)
                .toList();
        return ResponseEntity.ok(response);
    }

    @GetMapping("/summary")
    @PreAuthorize("hasAnyRole('ADMIN','COORDINATOR')")
    public ResponseEntity<Map<String, Object>> getSummaryByDate(
            @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate date) {
        LocalDate targetDate = date != null ? date : LocalDate.now(UTC_CLOCK);
        return ResponseEntity.ok(attendanceService.getSummaryByDate(targetDate));
    }

    private Attendance toAttendance(
            AttendanceRequest request,
            String defaultMarkedBy,
            boolean forceDefaultMarkedBy,
            String sourceEventId) {

        Student student = new Student();
        student.setId(request.studentId());

        LocalDateTime entryTime = resolveEntryTime(request);
        String markedBy = forceDefaultMarkedBy ? defaultMarkedBy : sanitize(request.markedBy());
        if (markedBy == null) {
            markedBy = defaultMarkedBy;
        }

        Attendance attendance = new Attendance();
        attendance.setStudent(student);
        attendance.setDate(entryTime.toLocalDate());
        attendance.setEntryTime(entryTime);
        attendance.setMarkedBy(markedBy.trim().toUpperCase());
        attendance.setSourceEventId(sanitize(sourceEventId != null ? sourceEventId : request.sourceEventId()));
        return attendance;
    }

    private LocalDateTime resolveEntryTime(AttendanceRequest request) {
        if (request.entryTime() != null) {
            return request.entryTime().withNano(0);
        }
        if (request.timestamp() != null) {
            return request.timestamp().withNano(0);
        }
        if (request.date() != null && request.time() != null) {
            return LocalDateTime.of(request.date(), request.time()).withNano(0);
        }
        if (request.date() != null) {
            LocalTime nowTime = LocalDateTime.now(UTC_CLOCK).toLocalTime().withNano(0);
            return LocalDateTime.of(request.date(), nowTime).withNano(0);
        }
        return LocalDateTime.now(UTC_CLOCK).withNano(0);
    }

    private String sanitize(String value) {
        if (value == null) {
            return null;
        }
        String normalized = value.trim();
        return normalized.isEmpty() ? null : normalized;
    }

    private String resolveSourceEventId(AttendanceRequest record, String idempotencyKey) {
        if (record.sourceEventId() != null && !record.sourceEventId().isBlank()) {
            return record.sourceEventId().trim();
        }
        if (idempotencyKey == null || idempotencyKey.isBlank()) {
            return null;
        }
        LocalDate entryDate = resolveEntryTime(record).toLocalDate();
        return idempotencyKey.trim() + "-" + record.studentId() + "-" + entryDate;
    }

    private AttendanceResponse toResponse(Attendance attendance) {
        Long studentId = attendance.getStudent() != null ? attendance.getStudent().getId() : null;
        return new AttendanceResponse(
                attendance.getId(),
                studentId,
                attendance.getDate(),
                attendance.getEntryTime(),
                attendance.getMarkedBy(),
                attendance.getSourceEventId(),
                attendance.getCreatedAt());
    }

    public record AttendanceRequest(
            @NotNull(message = "studentId is required")
            Long studentId,
            @DateTimeFormat(iso = DateTimeFormat.ISO.DATE)
            LocalDate date,
            @DateTimeFormat(iso = DateTimeFormat.ISO.TIME)
            LocalTime time,
            @DateTimeFormat(iso = DateTimeFormat.ISO.DATE_TIME)
            LocalDateTime entryTime,
            @DateTimeFormat(iso = DateTimeFormat.ISO.DATE_TIME)
            LocalDateTime timestamp,
            @Pattern(regexp = "^(?i)(AI|MANUAL)$", message = "markedBy must be AI or MANUAL")
            String markedBy,
            String status,
            String sourceEventId) {
    }

    public record AttendanceResponse(
            Long id,
            Long studentId,
            LocalDate date,
            LocalDateTime entryTime,
            String markedBy,
            String sourceEventId,
            LocalDateTime createdAt) {
    }
}
