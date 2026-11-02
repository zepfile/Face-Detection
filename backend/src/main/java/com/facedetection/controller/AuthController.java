package com.facedetection.controller;

import com.facedetection.config.AppSecurityProperties;
import com.facedetection.model.User;
import com.facedetection.repository.UserRepository;
import com.facedetection.security.JwtUtil;
import com.facedetection.service.RefreshTokenService;
import com.facedetection.service.SecurityAuditService;
import com.facedetection.util.InputSanitizer;
import jakarta.servlet.http.Cookie;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.persistence.EntityNotFoundException;
import jakarta.validation.Valid;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Size;
import java.time.Duration;
import java.time.LocalDateTime;
import java.util.Set;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseCookie;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.security.core.Authentication;
import org.springframework.security.core.GrantedAuthority;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.security.web.csrf.CsrfToken;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.server.ResponseStatusException;

@RestController
@RequestMapping("/api/auth")
public class AuthController {

    private static final String ACCESS_COOKIE_NAME = "fd_access_token";
    private static final String REFRESH_COOKIE_NAME = "fd_refresh_token";
    private static final String INVALID_CREDENTIALS_MESSAGE = "Invalid credentials";
    private static final Set<String> ALLOWED_REGISTER_ROLES = Set.of("ADMIN", "COORDINATOR");

    private final UserRepository userRepository;
    private final PasswordEncoder passwordEncoder;
    private final JwtUtil jwtUtil;
    private final AppSecurityProperties securityProperties;
    private final RefreshTokenService refreshTokenService;
    private final SecurityAuditService auditService;

    public AuthController(
            UserRepository userRepository,
            PasswordEncoder passwordEncoder,
            JwtUtil jwtUtil,
            AppSecurityProperties securityProperties,
            RefreshTokenService refreshTokenService,
            SecurityAuditService auditService) {
        this.userRepository = userRepository;
        this.passwordEncoder = passwordEncoder;
        this.jwtUtil = jwtUtil;
        this.securityProperties = securityProperties;
        this.refreshTokenService = refreshTokenService;
        this.auditService = auditService;
    }

    @GetMapping("/csrf")
    public ResponseEntity<CsrfResponse> csrf(CsrfToken csrfToken) {
        return ResponseEntity.ok(new CsrfResponse(csrfToken.getToken()));
    }

    @PostMapping("/login")
    public ResponseEntity<AuthResponse> login(@Valid @RequestBody LoginRequest request, HttpServletRequest httpRequest) {
        String username = sanitizeUsername(request.username());
        User user = userRepository.findByUsername(username)
                .orElseThrow(() -> unauthorized(httpRequest, username));

        if (isAccountLocked(user)) {
            auditService.accountLocked(username, clientIp(httpRequest));
            throw new ResponseStatusException(HttpStatus.UNAUTHORIZED, INVALID_CREDENTIALS_MESSAGE);
        }

        if (!passwordEncoder.matches(request.password(), user.getPassword())) {
            registerFailedAttempt(user, httpRequest);
            throw new ResponseStatusException(HttpStatus.UNAUTHORIZED, INVALID_CREDENTIALS_MESSAGE);
        }

        clearFailedAttempts(user);
        userRepository.save(user);

        refreshTokenService.revokeAllForUser(user.getId());
        String accessToken = jwtUtil.generateAccessToken(user.getUsername(), user.getRole());
        RefreshTokenService.IssuedRefreshToken refresh = refreshTokenService.issue(user, clientIp(httpRequest));

        HttpHeaders headers = new HttpHeaders();
        headers.add(HttpHeaders.SET_COOKIE, buildAccessCookie(accessToken).toString());
        headers.add(HttpHeaders.SET_COOKIE, buildRefreshCookie(refresh.rawToken()).toString());

        auditService.loginSuccess(user.getUsername(), clientIp(httpRequest));
        AuthResponse response = new AuthResponse(user.getUsername(), user.getRole(), "Login successful");
        return ResponseEntity.ok().headers(headers).body(response);
    }

    @PostMapping("/refresh")
    public ResponseEntity<AuthResponse> refresh(HttpServletRequest request) {
        String refreshToken = cookieValue(request, REFRESH_COOKIE_NAME);
        if (refreshToken == null) {
            throw new ResponseStatusException(HttpStatus.UNAUTHORIZED, INVALID_CREDENTIALS_MESSAGE);
        }

        try {
            User user = refreshTokenService.getUserFromRefreshToken(refreshToken);
            RefreshTokenService.IssuedRefreshToken rotated = refreshTokenService.rotate(refreshToken, clientIp(request));
            String accessToken = jwtUtil.generateAccessToken(user.getUsername(), user.getRole());

            HttpHeaders headers = new HttpHeaders();
            headers.add(HttpHeaders.SET_COOKIE, buildAccessCookie(accessToken).toString());
            headers.add(HttpHeaders.SET_COOKIE, buildRefreshCookie(rotated.rawToken()).toString());

            return ResponseEntity.ok().headers(headers)
                    .body(new AuthResponse(user.getUsername(), user.getRole(), "Token refreshed"));
        } catch (EntityNotFoundException ex) {
            throw new ResponseStatusException(HttpStatus.UNAUTHORIZED, INVALID_CREDENTIALS_MESSAGE);
        }
    }

    @PostMapping("/logout")
    @PreAuthorize("isAuthenticated()")
    public ResponseEntity<MessageResponse> logout(HttpServletRequest request) {
        String refreshToken = cookieValue(request, REFRESH_COOKIE_NAME);
        String actor = currentUsername();
        if (refreshToken != null) {
            try {
                refreshTokenService.revoke(refreshToken, clientIp(request));
            } catch (Exception ignored) {
                // Intentionally silent to keep logout idempotent.
            }
        }

        HttpHeaders headers = new HttpHeaders();
        headers.add(HttpHeaders.SET_COOKIE, clearCookie(ACCESS_COOKIE_NAME, "/").toString());
        headers.add(HttpHeaders.SET_COOKIE, clearCookie(REFRESH_COOKIE_NAME, "/api/auth").toString());

        if (actor != null) {
            auditService.logout(actor, clientIp(request));
        }
        return ResponseEntity.ok().headers(headers).body(new MessageResponse("Logged out"));
    }

    @GetMapping("/me")
    @PreAuthorize("isAuthenticated()")
    public ResponseEntity<UserProfileResponse> me() {
        Authentication auth = SecurityContextHolder.getContext().getAuthentication();
        if (auth == null || auth.getName() == null || "anonymousUser".equals(auth.getName())) {
            throw new ResponseStatusException(HttpStatus.UNAUTHORIZED, "Unauthorized");
        }

        String role = auth.getAuthorities().stream()
                .map(GrantedAuthority::getAuthority)
                .findFirst()
                .map(authority -> authority.replaceFirst("^ROLE_", ""))
                .orElse("USER");

        return ResponseEntity.ok(new UserProfileResponse(auth.getName(), role));
    }

    @PostMapping("/register")
    @PreAuthorize("hasRole('ADMIN')")
    public ResponseEntity<RegisterResponse> register(@Valid @RequestBody RegisterRequest request) {
        String username = sanitizeUsername(request.username());
        if (userRepository.findByUsername(username).isPresent()) {
            throw new ResponseStatusException(HttpStatus.CONFLICT, "Username already exists");
        }

        String role = sanitizeRole(request.role());
        if (!ALLOWED_REGISTER_ROLES.contains(role)) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Unsupported role");
        }

        User user = new User();
        user.setUsername(username);
        user.setPassword(passwordEncoder.encode(request.password()));
        user.setRole(role);
        user.setFailedLoginAttempts(0);
        user.setAccountLockedUntil(null);

        User savedUser = userRepository.save(user);
        auditService.userRegistered(currentUsername() == null ? "system" : currentUsername(), savedUser.getUsername(), savedUser.getRole());
        return ResponseEntity.status(HttpStatus.CREATED)
                .body(new RegisterResponse(savedUser.getId(), savedUser.getUsername(), savedUser.getRole()));
    }

    private ResponseCookie buildAccessCookie(String accessToken) {
        return ResponseCookie.from(ACCESS_COOKIE_NAME, accessToken)
                .httpOnly(true)
                .secure(securityProperties.isSecureCookies())
                .sameSite("Strict")
                .path("/")
                .maxAge(Duration.ofMillis(securityProperties.getAccessTokenTtlMs()))
                .build();
    }

    private ResponseCookie buildRefreshCookie(String refreshToken) {
        return ResponseCookie.from(REFRESH_COOKIE_NAME, refreshToken)
                .httpOnly(true)
                .secure(securityProperties.isSecureCookies())
                .sameSite("Strict")
                .path("/api/auth")
                .maxAge(Duration.ofMillis(securityProperties.getRefreshTokenTtlMs()))
                .build();
    }

    private ResponseCookie clearCookie(String name, String path) {
        return ResponseCookie.from(name, "")
                .httpOnly(true)
                .secure(securityProperties.isSecureCookies())
                .sameSite("Strict")
                .path(path)
                .maxAge(Duration.ZERO)
                .build();
    }

    private String cookieValue(HttpServletRequest request, String name) {
        if (request.getCookies() == null) {
            return null;
        }
        for (Cookie cookie : request.getCookies()) {
            if (cookie != null && name.equals(cookie.getName())) {
                return cookie.getValue();
            }
        }
        return null;
    }

    private boolean isAccountLocked(User user) {
        LocalDateTime lockedUntil = user.getAccountLockedUntil();
        return lockedUntil != null && lockedUntil.isAfter(LocalDateTime.now());
    }

    private void registerFailedAttempt(User user, HttpServletRequest request) {
        int attempts = (user.getFailedLoginAttempts() == null ? 0 : user.getFailedLoginAttempts()) + 1;
        user.setFailedLoginAttempts(attempts);

        if (attempts >= securityProperties.getMaxFailedLoginAttempts()) {
            user.setAccountLockedUntil(LocalDateTime.now().plusMinutes(securityProperties.getLockDurationMinutes()));
            auditService.accountLocked(user.getUsername(), clientIp(request));
        }
        userRepository.save(user);
        auditService.loginFailure(user.getUsername(), clientIp(request));
    }

    private void clearFailedAttempts(User user) {
        user.setFailedLoginAttempts(0);
        user.setAccountLockedUntil(null);
    }

    private ResponseStatusException unauthorized(HttpServletRequest request, String username) {
        auditService.loginFailure(username, clientIp(request));
        return new ResponseStatusException(HttpStatus.UNAUTHORIZED, INVALID_CREDENTIALS_MESSAGE);
    }

    private String sanitizeUsername(String username) {
        String sanitized = InputSanitizer.sanitize(username);
        if (sanitized == null) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "username is required");
        }
        return sanitized;
    }

    private String sanitizeRole(String role) {
        String sanitized = InputSanitizer.sanitize(role);
        if (sanitized == null) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "role is required");
        }
        return sanitized.toUpperCase();
    }

    private String clientIp(HttpServletRequest request) {
        String forwarded = request.getHeader("X-Forwarded-For");
        if (forwarded != null && !forwarded.isBlank()) {
            return forwarded.split(",")[0].trim();
        }
        return request.getRemoteAddr();
    }

    private String currentUsername() {
        Authentication auth = SecurityContextHolder.getContext().getAuthentication();
        if (auth == null || auth.getName() == null || "anonymousUser".equals(auth.getName())) {
            return null;
        }
        return auth.getName();
    }

    public record LoginRequest(
            @NotBlank(message = "username is required")
            @Size(min = 4, max = 80, message = "username must be 4-80 characters")
            String username,
            @NotBlank(message = "password is required")
            String password) {
    }

    public record RegisterRequest(
            @NotBlank(message = "username is required")
            @Size(min = 4, max = 80, message = "username must be 4-80 characters")
            String username,
            @NotBlank(message = "password is required")
            @Pattern(
                    regexp = "^(?=.*[A-Z])(?=.*\\d)(?=.*[!@#$%^&*()_+\\-={}\\[\\]:;\"'<>,.?/]).{10,72}$",
                    message = "Password must include uppercase, number, special char, and be 10+ chars")
            String password,
            @NotBlank(message = "role is required")
            String role) {
    }

    public record AuthResponse(String username, String role, String message) {
    }

    public record RegisterResponse(Long id, String username, String role) {
    }

    public record MessageResponse(String message) {
    }

    public record UserProfileResponse(String username, String role) {
    }

    public record CsrfResponse(String csrfToken) {
    }
}
