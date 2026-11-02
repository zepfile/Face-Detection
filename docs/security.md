# Security Hardening Guide

This document summarizes the security controls implemented in this project and the operational checklist for production deployments.

## Implemented Controls

## Backend (Spring Boot)

- Cookie-based authentication:
  - Access token in `HttpOnly` cookie (`fd_access_token`)
  - Refresh token in `HttpOnly` cookie (`fd_refresh_token`)
  - `SameSite=Strict`, `Secure` controlled by environment (`APP_SECURITY_SECURE_COOKIES`)
- Refresh token rotation:
  - Refresh tokens are stored server-side in `refresh_tokens`
  - Tokens are stored as SHA-256 hash, not plaintext
  - Rotation invalidates previous refresh token
- Account lockout:
  - Lock after `5` failed attempts (configurable)
  - Lock duration `15` minutes (configurable)
- Password policy:
  - Enforced during registration
  - Minimum length, uppercase, number, special character
- RBAC:
  - Method-level security with `@PreAuthorize`
  - Endpoint-level constraints in `SecurityConfig`
- CSRF protection:
  - Enabled for cookie-authenticated endpoints
  - CSRF token cookie (`XSRF-TOKEN`) + header (`X-XSRF-TOKEN`)
- Security headers:
  - `X-Content-Type-Options: nosniff`
  - `X-Frame-Options: DENY`
  - `X-XSS-Protection: 1; mode=block`
  - CSP
  - HSTS
- Rate limiting:
  - Per-IP auth endpoint throttling via Bucket4j
- Centralized error handling:
  - Generic responses for internal errors
  - No stack traces exposed in responses
- Audit logging:
  - Security/audit events logged to `logs/security-audit.log`
  - Log rotation configured

## Frontend (React)

- No JWT in localStorage/sessionStorage
- Uses secure cookies (`withCredentials: true`)
- CSRF integrated through Axios (`XSRF-TOKEN` / `X-XSRF-TOKEN`)
- Avoids `dangerouslySetInnerHTML`
- CSP and security headers served by Nginx

## AI Service

- Uses API key header (`X-API-Key`) for backend ingestion
- Offline queue uses SQLite for resilience
- Runs as non-root in Docker
- Warns if backend endpoint is non-HTTPS

## Container/Deployment

- Services run with non-root users where applicable
- `no-new-privileges` and `cap_drop: [ALL]`
- `read_only` root filesystem for backend/frontend containers
- Resource limits (CPU/memory)
- `.env` based secret handling with `.gitignore`

## Security Checklist (Operational)

- Set strong values for:
  - `JWT_SECRET`
  - `AI_API_KEY`
  - DB credentials
  - SMTP/Twilio credentials
- Enable TLS in production:
  - `APP_SECURITY_REQUIRE_HTTPS=true`
  - `APP_SECURITY_SECURE_COOKIES=true`
  - Use reverse proxy with valid certificates
- Restrict CORS origins to exact trusted hosts
- Disable debug logging in production
- Rotate secrets on a schedule
- Keep dependencies and base images updated

## Recommended Security Testing

- Dependency scanning:
  - Java: `mvn org.owasp:dependency-check-maven:check`
  - Python: `pip-audit`
  - Frontend: `npm audit --production`
- Container scanning:
  - `trivy image <image-name>`
- Dynamic testing:
  - OWASP ZAP baseline scan against staging
- Penetration test scope:
  - Auth/session flow
  - CSRF and XSS checks
  - IDOR checks on student/attendance endpoints
  - Brute-force and rate-limit validation
