package com.facedetection.controller;

import com.facedetection.model.Student;
import com.facedetection.service.NotificationDispatcherService;
import com.facedetection.service.StudentService;
import jakarta.persistence.EntityNotFoundException;
import java.time.Instant;
import java.time.LocalDate;
import java.util.LinkedHashMap;
import java.util.Map;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/notifications")
public class NotificationController {

    private final NotificationDispatcherService notificationDispatcherService;
    private final StudentService studentService;

    public NotificationController(
            NotificationDispatcherService notificationDispatcherService,
            StudentService studentService) {
        this.notificationDispatcherService = notificationDispatcherService;
        this.studentService = studentService;
    }

    @GetMapping("/queue-size")
    @PreAuthorize("hasRole('ADMIN')")
    public ResponseEntity<Map<String, Object>> queueSize() {
        Map<String, Object> response = new LinkedHashMap<>();
        response.put("queueSize", notificationDispatcherService.queueSize());
        response.put("timestamp", Instant.now().toString());
        return ResponseEntity.ok(response);
    }

    @PostMapping("/notify-absent")
    @PreAuthorize("hasAnyRole('ADMIN','COORDINATOR')")
    public ResponseEntity<Map<String, Object>> notifyAbsentStudents(
            @RequestParam(required = false) String date,
            @RequestParam(required = false) String classGroup) {
        LocalDate parsedDate = (date != null && !date.isBlank()) ? LocalDate.parse(date) : LocalDate.now();
        int count = notificationDispatcherService.notifyAbsentStudentsForDate(parsedDate, classGroup);
        Map<String, Object> response = new LinkedHashMap<>();
        response.put("message", "Absent notifications dispatched for " + count + " student(s)");
        response.put("date", parsedDate.toString());
        response.put("count", count);
        response.put("queueSize", notificationDispatcherService.queueSize());
        return ResponseEntity.ok(response);
    }

    @PostMapping("/test-sms")
    @PreAuthorize("hasAnyRole('ADMIN','COORDINATOR')")
    public ResponseEntity<Map<String, Object>> testSms(
            @RequestParam String phone,
            @RequestParam(required = false, defaultValue = "Test Attendance SMS Notification from Face Detection System") String message) {
        boolean sentViaTwilio = notificationDispatcherService.sendSingleSms(phone, message);
        Map<String, Object> response = new LinkedHashMap<>();
        response.put("recipient", phone);
        response.put("sentViaTwilio", sentViaTwilio);
        response.put("status", sentViaTwilio ? "Delivered via Twilio" : "Logged in Dev Console (Simulated)");
        response.put("message", message);
        return ResponseEntity.ok(response);
    }

    @PostMapping("/test-absent/{studentId}")
    @PreAuthorize("hasAnyRole('ADMIN','COORDINATOR')")
    public ResponseEntity<Map<String, Object>> triggerTestAbsentNotification(@PathVariable Long studentId) {
        try {
            Student student = studentService.getStudentById(studentId);
            notificationDispatcherService.enqueueAbsentNotification(student, LocalDate.now());

            Map<String, Object> response = new LinkedHashMap<>();
            response.put("message", "Absent notification queued");
            response.put("studentId", studentId);
            response.put("queueSize", notificationDispatcherService.queueSize());
            return ResponseEntity.accepted().body(response);
        } catch (EntityNotFoundException ex) {
            Map<String, Object> error = new LinkedHashMap<>();
            error.put("status", HttpStatus.NOT_FOUND.value());
            error.put("message", ex.getMessage());
            return ResponseEntity.status(HttpStatus.NOT_FOUND).body(error);
        }
    }
}
