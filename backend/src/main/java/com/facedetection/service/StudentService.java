package com.facedetection.service;

import com.facedetection.model.StudentEnrollmentPhoto;
import com.facedetection.model.Student;
import com.facedetection.model.User;
import com.facedetection.repository.StudentEnrollmentPhotoRepository;
import com.facedetection.repository.StudentRepository;
import com.facedetection.repository.UserRepository;
import com.facedetection.util.InputSanitizer;
import jakarta.persistence.EntityNotFoundException;
import java.time.Clock;
import java.time.LocalDateTime;
import java.util.List;
import java.util.Optional;
import org.springframework.security.access.AccessDeniedException;
import org.springframework.security.core.Authentication;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
@Transactional
public class StudentService {

    private static final Clock UTC_CLOCK = Clock.systemUTC();
    private static final int ENROLLMENT_PHOTO_COUNT = 5;

    private final StudentRepository studentRepository;
    private final UserRepository userRepository;
    private final StudentEnrollmentPhotoRepository enrollmentPhotoRepository;
    private final SecurityAuditService auditService;

    public StudentService(
            StudentRepository studentRepository,
            UserRepository userRepository,
            StudentEnrollmentPhotoRepository enrollmentPhotoRepository,
            SecurityAuditService auditService) {
        this.studentRepository = studentRepository;
        this.userRepository = userRepository;
        this.enrollmentPhotoRepository = enrollmentPhotoRepository;
        this.auditService = auditService;
    }

    @Transactional(readOnly = true)
    public List<Student> getAllStudents() {
        User actor = requireCurrentUser();
        if (isAdmin(actor)) {
            return studentRepository.findAll();
        }
        if (isCoordinator(actor)) {
            return studentRepository.findByTeacherIdOrderByRollNumberAsc(actor.getId());
        }
        throw new AccessDeniedException("Access denied");
    }

    @Transactional(readOnly = true)
    public Student getStudentById(Long id) {
        User actor = requireCurrentUser();
        if (isAdmin(actor)) {
            return studentRepository.findById(id)
                    .orElseThrow(() -> new EntityNotFoundException("Student not found with id: " + id));
        }
        if (isCoordinator(actor)) {
            return studentRepository.findByIdAndTeacherId(id, actor.getId())
                    .orElseThrow(() -> new EntityNotFoundException("Student not found with id: " + id));
        }
        throw new AccessDeniedException("Access denied");
    }

    public Student addStudent(Student student) {
        if (student == null) {
            throw new IllegalArgumentException("Student must not be null");
        }

        User actor = requireCurrentUser();
        student.setId(null);
        sanitizeStudent(student);
        student.setFaceEncoding(normalizeFaceEncoding(student.getFaceEncoding()));
        student.setParentPhone(normalizeOptional(student.getParentPhone()));
        student.setParentEmail(normalizeOptional(student.getParentEmail()));
        student.setTeacher(resolveTeacherForWrite(actor, student.getTeacher()));
        Student saved = studentRepository.save(student);
        auditService.studentCreated(currentActor(), saved.getId());
        return saved;
    }

    public List<Student> addStudentsBulk(List<Student> students) {
        if (students == null || students.isEmpty()) {
            throw new IllegalArgumentException("At least one student is required");
        }

        List<Student> created = students.stream()
                .map(this::addStudent)
                .toList();
        return created;
    }

    public Student updateStudent(Long id, Student student) {
        User actor = requireCurrentUser();
        Student existingStudent = getStudentById(id);

        existingStudent.setFirstName(student.getFirstName());
        existingStudent.setLastName(student.getLastName());
        existingStudent.setEmail(student.getEmail());
        existingStudent.setRollNumber(student.getRollNumber());
        existingStudent.setClassGroup(student.getClassGroup());
        existingStudent.setParentPhone(normalizeOptional(student.getParentPhone()));
        existingStudent.setParentEmail(normalizeOptional(student.getParentEmail()));
        sanitizeStudent(existingStudent);

        String normalizedFaceEncoding = normalizeFaceEncoding(student.getFaceEncoding());
        if (normalizedFaceEncoding != null) {
            existingStudent.setFaceEncoding(normalizedFaceEncoding);
        }

        if (isAdmin(actor) && student.getTeacher() != null && student.getTeacher().getId() != null) {
            existingStudent.setTeacher(resolveTeacherForWrite(actor, student.getTeacher()));
        }
        if (isCoordinator(actor)) {
            existingStudent.setTeacher(actor);
        }

        Student saved = studentRepository.save(existingStudent);
        auditService.studentUpdated(currentActor(), saved.getId());
        return saved;
    }

    public void deleteStudent(Long id) {
        User actor = requireCurrentUser();
        if (!isAdmin(actor)) {
            throw new AccessDeniedException("Only admin can delete students");
        }
        Student student = getStudentById(id);
        studentRepository.delete(student);
        auditService.studentDeleted(currentActor(), id);
    }

    @Transactional(readOnly = true)
    public Student findByRollNumber(String rollNumber) {
        return studentRepository.findByRollNumber(rollNumber)
                .orElseThrow(() -> new EntityNotFoundException(
                        "Student not found with roll number: " + rollNumber));
    }

    @Transactional(readOnly = true)
    public Optional<Student> findOptionalByRollNumber(String rollNumber) {
        User actor = requireCurrentUser();
        if (isAdmin(actor)) {
            return studentRepository.findByRollNumber(rollNumber);
        }
        if (isCoordinator(actor)) {
            return studentRepository.findByRollNumberAndTeacherId(rollNumber, actor.getId());
        }
        throw new AccessDeniedException("Access denied");
    }

    @Transactional(readOnly = true)
    public Optional<Student> findOptionalByEmail(String email) {
        User actor = requireCurrentUser();
        if (isAdmin(actor)) {
            return studentRepository.findByEmail(email);
        }
        if (isCoordinator(actor)) {
            return studentRepository.findByEmailAndTeacherId(email, actor.getId());
        }
        throw new AccessDeniedException("Access denied");
    }

    @Transactional(readOnly = true)
    public List<Student> findByClassGroup(String classGroup) {
        User actor = requireCurrentUser();
        if (isAdmin(actor)) {
            return studentRepository.findByClassGroup(classGroup);
        }
        if (isCoordinator(actor)) {
            return studentRepository.findByClassGroupAndTeacherId(classGroup, actor.getId());
        }
        throw new AccessDeniedException("Access denied");
    }

    public int saveEnrollmentPhotos(Long studentId, List<String> images) {
        Student student = getStudentById(studentId);
        if (images == null || images.size() != ENROLLMENT_PHOTO_COUNT) {
            throw new IllegalArgumentException("Exactly 5 enrollment photos are required");
        }

        enrollmentPhotoRepository.deleteByStudentId(studentId);
        LocalDateTime baseTime = LocalDateTime.now(UTC_CLOCK).withNano(0);
        for (int index = 0; index < images.size(); index++) {
            String image = normalizeEnrollmentImage(images.get(index));
            StudentEnrollmentPhoto photo = new StudentEnrollmentPhoto();
            photo.setStudent(student);
            photo.setCapturedAt(baseTime.plusSeconds(index));
            photo.setImageData(image);
            enrollmentPhotoRepository.save(photo);
        }
        auditService.studentUpdated(currentActor(), studentId);
        return ENROLLMENT_PHOTO_COUNT;
    }

    @Transactional(readOnly = true)
    public long getEnrollmentPhotoCount(Long studentId) {
        return enrollmentPhotoRepository.countByStudentId(studentId);
    }

    private String normalizeFaceEncoding(String faceEncoding) {
        if (faceEncoding == null) {
            return null;
        }

        String normalized = faceEncoding.trim();
        return normalized.isEmpty() ? null : normalized;
    }

    private String normalizeOptional(String value) {
        if (value == null) {
            return null;
        }
        String normalized = value.trim();
        return normalized.isEmpty() ? null : normalized;
    }

    private void sanitizeStudent(Student student) {
        student.setFirstName(InputSanitizer.sanitizePreserveCase(student.getFirstName(), 100));
        student.setLastName(InputSanitizer.sanitizePreserveCase(student.getLastName(), 100));
        student.setClassGroup(InputSanitizer.sanitizePreserveCase(student.getClassGroup(), 50));
        student.setRollNumber(InputSanitizer.sanitizePreserveCase(student.getRollNumber(), 100));
        student.setEmail(normalizeOptional(student.getEmail()));
    }

    private String normalizeEnrollmentImage(String image) {
        if (image == null) {
            throw new IllegalArgumentException("Enrollment photo data is missing");
        }
        String normalized = image.trim();
        if (normalized.isEmpty()) {
            throw new IllegalArgumentException("Enrollment photo data is empty");
        }
        if (!normalized.startsWith("data:image/")) {
            throw new IllegalArgumentException("Enrollment photo must be a data URL image");
        }
        return normalized;
    }

    private User resolveTeacherForWrite(User actor, User requestedTeacher) {
        if (isCoordinator(actor)) {
            return actor;
        }
        if (!isAdmin(actor)) {
            throw new AccessDeniedException("Access denied");
        }

        if (requestedTeacher == null || requestedTeacher.getId() == null) {
            return null;
        }
        User teacher = userRepository.findById(requestedTeacher.getId())
                .orElseThrow(() -> new EntityNotFoundException("Coordinator not found with id: " + requestedTeacher.getId()));
        if (!isCoordinator(teacher)) {
            throw new IllegalArgumentException("Assigned teacher must have COORDINATOR role");
        }
        return teacher;
    }

    private User requireCurrentUser() {
        String actor = currentActor();
        return userRepository.findByUsername(actor)
                .orElseThrow(() -> new AccessDeniedException("User context not found"));
    }

    private boolean isAdmin(User user) {
        return user != null && "ADMIN".equalsIgnoreCase(user.getRole());
    }

    private boolean isCoordinator(User user) {
        if (user == null || user.getRole() == null) {
            return false;
        }
        String role = user.getRole().trim().toUpperCase();
        return "COORDINATOR".equals(role) || "TEACHER".equals(role);
    }

    private String currentActor() {
        Authentication authentication = SecurityContextHolder.getContext().getAuthentication();
        if (authentication == null || authentication.getName() == null || "anonymousUser".equals(authentication.getName())) {
            throw new AccessDeniedException("Authentication required");
        }
        return authentication.getName();
    }
}
