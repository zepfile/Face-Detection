package com.facedetection.service;

import com.facedetection.config.AppSecurityProperties;
import com.facedetection.model.RefreshToken;
import com.facedetection.model.User;
import com.facedetection.repository.RefreshTokenRepository;
import jakarta.persistence.EntityNotFoundException;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.security.SecureRandom;
import java.time.Duration;
import java.time.LocalDateTime;
import java.util.Base64;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
@Transactional
public class RefreshTokenService {

    private final RefreshTokenRepository refreshTokenRepository;
    private final AppSecurityProperties securityProperties;
    private final SecureRandom secureRandom = new SecureRandom();

    public RefreshTokenService(
            RefreshTokenRepository refreshTokenRepository,
            AppSecurityProperties securityProperties) {
        this.refreshTokenRepository = refreshTokenRepository;
        this.securityProperties = securityProperties;
    }

    public IssuedRefreshToken issue(User user, String ipAddress) {
        String rawToken = generateTokenValue();
        String tokenHash = sha256(rawToken);
        LocalDateTime expiresAt = LocalDateTime.now().plus(Duration.ofMillis(securityProperties.getRefreshTokenTtlMs()));

        RefreshToken token = new RefreshToken();
        token.setUser(user);
        token.setTokenHash(tokenHash);
        token.setExpiresAt(expiresAt);
        token.setRevoked(false);
        token.setCreatedAt(LocalDateTime.now());
        token.setCreatedByIp(ipAddress);
        refreshTokenRepository.save(token);

        return new IssuedRefreshToken(rawToken, expiresAt);
    }

    public void revokeAllForUser(Long userId) {
        if (userId == null) {
            return;
        }
        refreshTokenRepository.deleteByUser_Id(userId);
    }

    public IssuedRefreshToken rotate(String currentRawToken, String ipAddress) {
        RefreshToken current = getByRawToken(currentRawToken);
        if (!current.isActive()) {
            throw new EntityNotFoundException("Refresh token is invalid");
        }

        IssuedRefreshToken replacement = issue(current.getUser(), ipAddress);
        current.setRevoked(true);
        current.setRevokedAt(LocalDateTime.now());
        current.setRevokedByIp(ipAddress);
        current.setReplacedByTokenHash(sha256(replacement.rawToken()));
        refreshTokenRepository.save(current);

        return replacement;
    }

    public void revoke(String rawToken, String ipAddress) {
        RefreshToken refreshToken = getByRawToken(rawToken);
        if (refreshToken.isRevoked()) {
            return;
        }
        refreshToken.setRevoked(true);
        refreshToken.setRevokedAt(LocalDateTime.now());
        refreshToken.setRevokedByIp(ipAddress);
        refreshTokenRepository.save(refreshToken);
    }

    @Transactional(readOnly = true)
    public User getUserFromRefreshToken(String rawToken) {
        RefreshToken refreshToken = getByRawToken(rawToken);
        if (!refreshToken.isActive()) {
            throw new EntityNotFoundException("Refresh token is invalid");
        }
        return refreshToken.getUser();
    }

    private RefreshToken getByRawToken(String rawToken) {
        if (rawToken == null || rawToken.isBlank()) {
            throw new EntityNotFoundException("Refresh token is invalid");
        }
        String tokenHash = sha256(rawToken.trim());
        return refreshTokenRepository.findByTokenHash(tokenHash)
                .orElseThrow(() -> new EntityNotFoundException("Refresh token is invalid"));
    }

    private String generateTokenValue() {
        byte[] bytes = new byte[64];
        secureRandom.nextBytes(bytes);
        return Base64.getUrlEncoder().withoutPadding().encodeToString(bytes);
    }

    private String sha256(String value) {
        try {
            byte[] hash = MessageDigest.getInstance("SHA-256").digest(value.getBytes(StandardCharsets.UTF_8));
            StringBuilder builder = new StringBuilder();
            for (byte b : hash) {
                builder.append(String.format("%02x", b));
            }
            return builder.toString();
        } catch (NoSuchAlgorithmException ex) {
            throw new IllegalStateException("SHA-256 algorithm not available", ex);
        }
    }

    public record IssuedRefreshToken(String rawToken, LocalDateTime expiresAt) {
    }
}
