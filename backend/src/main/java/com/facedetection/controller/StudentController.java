package com.facedetection.controller;

import com.facedetection.model.Student;
import com.facedetection.model.User;
import com.facedetection.service.StudentService;
import com.facedetection.util.InputSanitizer;
import jakarta.persistence.EntityNotFoundException;
import jakarta.validation.Valid;
import jakarta.validation.constraints.Email;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Size;
import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.server.ResponseStatusException;

@RestController
@RequestMapping("/api/students")
@PreAuthorize("hasAnyRole('ADMIN','COORDINATOR')")
public class StudentController {

    private final StudentService studentService;

    public StudentController(StudentService studentService) {
        this.studentService = studentService;
    }

    @GetMapping
    public ResponseEntity<List<StudentResponse>> getStudents(
            @RequestParam(required = false) String rollNumber,
            @RequestParam(required = false) String email,
            @RequestParam(required = false) String classGroup) {
        String normalizedRollNumber = sanitizeFilter(rollNumber);
        String normalizedEmail = sanitizeFilter(email);
        String normalizedClassGroup = sanitizeFilter(classGroup);

        int providedFilterCount = countProvidedFilters(normalizedRollNumber, normalizedEmail, normalizedClassGroup);

        if (providedFilterCount == 0) {
            return ResponseEntity.ok(toResponseList(studentService.getAllStudents()));
        }

        if (providedFilterCount == 1) {
            if (normalizedRollNumber != null) {
                return ResponseEntity.ok(studentService.findOptionalByRollNumber(normalizedRollNumber)
                        .map(this::toResponse)
                        .map(List::of)
                        .orElse(List.of()));
            }
            if (normalizedEmail != null) {
                return ResponseEntity.ok(studentService.findOptionalByEmail(normalizedEmail)
                        .map(this::toResponse)
                        .map(List::of)
                        .orElse(List.of()));
            }
            return ResponseEntity.ok(toResponseList(studentService.findByClassGroup(normalizedClassGroup)));
        }

        List<StudentResponse> filtered = new ArrayList<>(toResponseList(studentService.getAllStudents()));
        if (normalizedRollNumber != null) {
            filtered = filtered.stream()
                    .filter(student -> normalizedRollNumber.equalsIgnoreCase(student.rollNumber()))
                    .toList();
        }
        if (normalizedEmail != null) {
            filtered = filtered.stream()
                    .filter(student -> normalizedEmail.equalsIgnoreCase(student.email()))
                    .toList();
        }
        if (normalizedClassGroup != null) {
            filtered = filtered.stream()
                    .filter(student -> normalizedClassGroup.equalsIgnoreCase(student.classGroup()))
                    .toList();
        }
        return ResponseEntity.ok(filtered);
    }

    @GetMapping("/{id}")
    public ResponseEntity<StudentResponse> getStudentById(@PathVariable Long id) {
        return ResponseEntity.ok(toResponse(studentService.getStudentById(id)));
    }

    @PostMapping
    @PreAuthorize("hasAnyRole('ADMIN','COORDINATOR')")
    public ResponseEntity<StudentResponse> addStudent(@Valid @RequestBody StudentRequest request) {
        try {
            Student created = studentService.addStudent(toStudent(request));
            return ResponseEntity.status(HttpStatus.CREATED).body(toResponse(created));
        } catch (DataIntegrityViolationException ex) {
            throw new ResponseStatusException(HttpStatus.CONFLICT, "Student with same email or roll number already exists");
        }
    }

    @PostMapping("/bulk")
    @PreAuthorize("hasAnyRole('ADMIN','COORDINATOR')")
    public ResponseEntity<List<StudentResponse>> addStudentsBulk(@RequestBody List<@Valid StudentRequest> requests) {
        if (requests == null || requests.isEmpty()) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "At least one student payload is required");
        }
        if (requests.size() > 200) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Bulk upload limit is 200 students per request");
        }

        try {
            List<Student> created = studentService.addStudentsBulk(requests.stream().map(this::toStudent).toList());
            return ResponseEntity.status(HttpStatus.CREATED).body(toResponseList(created));
        } catch (DataIntegrityViolationException ex) {
            throw new ResponseStatusException(HttpStatus.CONFLICT, "One or more students conflict with existing email/roll number");
        }
    }

    @PutMapping("/{id}")
    @PreAuthorize("hasAnyRole('ADMIN','COORDINATOR')")
    public ResponseEntity<StudentResponse> updateStudent(@PathVariable Long id, @Valid @RequestBody StudentRequest request) {
        try {
            Student updated = studentService.updateStudent(id, toStudent(request));
            return ResponseEntity.ok(toResponse(updated));
        } catch (EntityNotFoundException ex) {
            throw new ResponseStatusException(HttpStatus.NOT_FOUND, ex.getMessage());
        } catch (DataIntegrityViolationException ex) {
            throw new ResponseStatusException(HttpStatus.CONFLICT, "Student with same email or roll number already exists");
        }
    }

    @DeleteMapping("/{id}")
    @PreAuthorize("hasRole('ADMIN')")
    public ResponseEntity<Void> deleteStudent(@PathVariable Long id) {
        studentService.deleteStudent(id);
        return ResponseEntity.noContent().build();
    }

    @PostMapping("/{id}/enrollment-photos")
    @PreAuthorize("hasAnyRole('ADMIN','COORDINATOR')")
    public ResponseEntity<Map<String, Object>> uploadEnrollmentPhotos(
            @PathVariable Long id,
            @Valid @RequestBody EnrollmentPhotosRequest request) {
        int savedCount = studentService.saveEnrollmentPhotos(id, request.images());
        Map<String, Object> response = new LinkedHashMap<>();
        response.put("studentId", id);
        response.put("savedPhotos", savedCount);
        response.put("message", "Enrollment photos updated");
        return ResponseEntity.ok(response);
    }

    @GetMapping("/{id}/enrollment-photos/count")
    @PreAuthorize("hasAnyRole('ADMIN','COORDINATOR')")
    public ResponseEntity<Map<String, Object>> getEnrollmentPhotoCount(@PathVariable Long id) {
        studentService.getStudentById(id);
        long count = studentService.getEnrollmentPhotoCount(id);
        Map<String, Object> response = new LinkedHashMap<>();
        response.put("studentId", id);
        response.put("photoCount", count);
        return ResponseEntity.ok(response);
    }

    private Student toStudent(StudentRequest request) {
        Student student = new Student();
        student.setFirstName(InputSanitizer.sanitizePreserveCase(request.firstName(), 100));
        student.setLastName(InputSanitizer.sanitizePreserveCase(request.lastName(), 100));
        student.setEmail(InputSanitizer.sanitize(request.email()));
        student.setRollNumber(InputSanitizer.sanitizePreserveCase(request.rollNumber(), 100));
        student.setClassGroup(InputSanitizer.sanitizePreserveCase(request.classGroup(), 50));
        student.setParentPhone(InputSanitizer.sanitize(request.parentPhone()));
        student.setParentEmail(InputSanitizer.sanitize(request.parentEmail()));
        student.setFaceEncoding(request.faceEncoding());
        if (request.teacherId() != null) {
            User teacher = new User();
            teacher.setId(request.teacherId());
            student.setTeacher(teacher);
        }
        return student;
    }

    private StudentResponse toResponse(Student student) {
        Long teacherId = student.getTeacher() != null ? student.getTeacher().getId() : null;
        return new StudentResponse(
                student.getId(),
                student.getFirstName(),
                student.getLastName(),
                student.getEmail(),
                student.getRollNumber(),
                student.getClassGroup(),
                student.getParentPhone(),
                student.getParentEmail(),
                student.getFaceEncoding(),
                teacherId,
                studentService.getEnrollmentPhotoCount(student.getId()),
                student.getCreatedAt(),
                student.getUpdatedAt());
    }

    private List<StudentResponse> toResponseList(List<Student> students) {
        return students.stream().map(this::toResponse).toList();
    }

    private String sanitizeFilter(String value) {
        return InputSanitizer.sanitize(value);
    }

    private int countProvidedFilters(String rollNumber, String email, String classGroup) {
        int count = 0;
        if (rollNumber != null) {
            count++;
        }
        if (email != null) {
            count++;
        }
        if (classGroup != null) {
            count++;
        }
        return count;
    }

    public record StudentRequest(
            @NotBlank(message = "firstName is required")
            @Size(max = 100)
            String firstName,
            @NotBlank(message = "lastName is required")
            @Size(max = 100)
            String lastName,
            @NotBlank(message = "email is required")
            @Email(message = "email must be valid")
            @Size(max = 150)
            String email,
            @NotBlank(message = "rollNumber is required")
            @Size(max = 100)
            String rollNumber,
            @NotBlank(message = "classGroup is required")
            @Size(max = 50)
            String classGroup,
            @Pattern(regexp = "^$|^[+0-9\\- ]{8,30}$", message = "parentPhone format is invalid")
            String parentPhone,
            @Pattern(regexp = "^$|^[^@\\s]+@[^@\\s]+\\.[^@\\s]+$", message = "parentEmail must be valid")
            String parentEmail,
            String faceEncoding,
            Long teacherId) {
    }

    public record StudentResponse(
            Long id,
            String firstName,
            String lastName,
            String email,
            String rollNumber,
            String classGroup,
            String parentPhone,
            String parentEmail,
            String faceEncoding,
            Long teacherId,
            Long enrollmentPhotoCount,
            LocalDateTime createdAt,
            LocalDateTime updatedAt) {
    }

    public record EnrollmentPhotosRequest(
            @NotNull(message = "images is required")
            @Size(min = 5, max = 5, message = "exactly 5 photos are required")
            List<@NotBlank(message = "image data is required") String> images) {
    }
}
