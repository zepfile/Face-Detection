package com.facedetection.config;

import org.springframework.boot.context.properties.ConfigurationProperties;

@ConfigurationProperties(prefix = "app.security")
public class AppSecurityProperties {

    private boolean requireHttps;
    private boolean secureCookies = true;
    private int bcryptStrength = 12;
    private int maxFailedLoginAttempts = 5;
    private int lockDurationMinutes = 15;
    private long refreshTokenTtlMs = 1_209_600_000L;
    private long accessTokenTtlMs = 900_000L;

    public boolean isRequireHttps() {
        return requireHttps;
    }

    public void setRequireHttps(boolean requireHttps) {
        this.requireHttps = requireHttps;
    }

    public boolean isSecureCookies() {
        return secureCookies;
    }

    public void setSecureCookies(boolean secureCookies) {
        this.secureCookies = secureCookies;
    }

    public int getBcryptStrength() {
        return bcryptStrength;
    }

    public void setBcryptStrength(int bcryptStrength) {
        this.bcryptStrength = bcryptStrength;
    }

    public int getMaxFailedLoginAttempts() {
        return maxFailedLoginAttempts;
    }

    public void setMaxFailedLoginAttempts(int maxFailedLoginAttempts) {
        this.maxFailedLoginAttempts = maxFailedLoginAttempts;
    }

    public int getLockDurationMinutes() {
        return lockDurationMinutes;
    }

    public void setLockDurationMinutes(int lockDurationMinutes) {
        this.lockDurationMinutes = lockDurationMinutes;
    }

    public long getRefreshTokenTtlMs() {
        return refreshTokenTtlMs;
    }

    public void setRefreshTokenTtlMs(long refreshTokenTtlMs) {
        this.refreshTokenTtlMs = refreshTokenTtlMs;
    }

    public long getAccessTokenTtlMs() {
        return accessTokenTtlMs;
    }

    public void setAccessTokenTtlMs(long accessTokenTtlMs) {
        this.accessTokenTtlMs = accessTokenTtlMs;
    }
}
