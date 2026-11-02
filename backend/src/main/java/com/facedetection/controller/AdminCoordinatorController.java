package com.facedetection.controller;

import com.facedetection.model.User;
import com.facedetection.repository.UserRepository;
import com.facedetection.service.SecurityAuditService;
import com.facedetection.util.InputSanitizer;
import jakarta.persistence.EntityNotFoundException;
import jakarta.validation.Valid;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Size;
import java.time.LocalDateTime;
import java.util.List;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.security.core.Authentication;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.server.ResponseStatusException;

@RestController
@RequestMapping("/api/admin/coordinators")
@PreAuthorize("hasRole('ADMIN')")
public class AdminCoordinatorController {

    private final UserRepository userRepository;
    private final PasswordEncoder passwordEncoder;
    private final SecurityAuditService auditService;

    public AdminCoordinatorController(
            UserRepository userRepository,
            PasswordEncoder passwordEncoder,
            SecurityAuditService auditService) {
        this.userRepository = userRepository;
        this.passwordEncoder = passwordEncoder;
        this.auditService = auditService;
    }

    @GetMapping
    public ResponseEntity<List<CoordinatorResponse>> listCoordinators() {
        List<CoordinatorResponse> coordinators = userRepository.findByRoleIgnoreCaseOrderByUsernameAsc("COORDINATOR").stream()
                .map(this::toResponse)
                .toList();
        return ResponseEntity.ok(coordinators);
    }

    @PostMapping
    public ResponseEntity<CoordinatorResponse> createCoordinator(@Valid @RequestBody CoordinatorCreateRequest request) {
        String username = sanitizeRequired(request.username(), "username is required");
        if (userRepository.findByUsername(username).isPresent()) {
            throw new ResponseStatusException(HttpStatus.CONFLICT, "Username already exists");
        }

        User coordinator = new User();
        coordinator.setUsername(username);
        coordinator.setPassword(passwordEncoder.encode(request.password()));
        coordinator.setRole("COORDINATOR");
        coordinator.setFailedLoginAttempts(0);
        coordinator.setAccountLockedUntil(null);

        User saved = userRepository.save(coordinator);
        auditService.userRegistered(currentActor(), saved.getUsername(), saved.getRole());
        return ResponseEntity.status(HttpStatus.CREATED).body(toResponse(saved));
    }

    @DeleteMapping("/{id}")
    public ResponseEntity<Void> deleteCoordinator(@PathVariable Long id) {
        User user = userRepository.findById(id)
                .orElseThrow(() -> new EntityNotFoundException("Coordinator not found with id: " + id));
        if (!"COORDINATOR".equalsIgnoreCase(user.getRole())) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "User is not a coordinator");
        }
        userRepository.delete(user);
        return ResponseEntity.noContent().build();
    }

    private CoordinatorResponse toResponse(User user) {
        return new CoordinatorResponse(
                user.getId(),
                user.getUsername(),
                user.getRole(),
                user.getCreatedAt(),
                user.getUpdatedAt());
    }

    private String sanitizeRequired(String value, String message) {
        String normalized = InputSanitizer.sanitize(value);
        if (normalized == null) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, message);
        }
        return normalized;
    }

    private String currentActor() {
        Authentication auth = SecurityContextHolder.getContext().getAuthentication();
        if (auth == null || auth.getName() == null || "anonymousUser".equals(auth.getName())) {
            return "system";
        }
        return auth.getName();
    }

    public record CoordinatorCreateRequest(
            @NotBlank(message = "username is required")
            @Size(min = 4, max = 80, message = "username must be 4-80 characters")
            String username,
            @NotBlank(message = "password is required")
            @Pattern(
                    regexp = "^(?=.*[A-Z])(?=.*\\d)(?=.*[!@#$%^&*()_+\\-={}\\[\\]:;\"'<>,.?/]).{10,72}$",
                    message = "Password must include uppercase, number, special char, and be 10+ chars")
            String password) {
    }

    public record CoordinatorResponse(
            Long id,
            String username,
            String role,
            LocalDateTime createdAt,
            LocalDateTime updatedAt) {
    }
}
