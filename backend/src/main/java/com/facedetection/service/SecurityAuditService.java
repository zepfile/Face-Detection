package com.facedetection.service;

import java.time.LocalDate;
import java.time.LocalDateTime;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;

@Service
public class SecurityAuditService {

    private static final Logger AUDIT_LOG = LoggerFactory.getLogger("SECURITY_AUDIT");

    public void loginSuccess(String username, String ip) {
        AUDIT_LOG.info("event=LOGIN_SUCCESS user={} ip={}", username, ip);
    }

    public void loginFailure(String username, String ip) {
        AUDIT_LOG.warn("event=LOGIN_FAILURE user={} ip={}", username, ip);
    }

    public void accountLocked(String username, String ip) {
        AUDIT_LOG.warn("event=ACCOUNT_LOCKED user={} ip={}", username, ip);
    }

    public void logout(String username, String ip) {
        AUDIT_LOG.info("event=LOGOUT user={} ip={}", username, ip);
    }

    public void userRegistered(String actor, String username, String role) {
        AUDIT_LOG.info("event=USER_REGISTERED actor={} username={} role={}", actor, username, role);
    }

    public void studentCreated(String actor, Long studentId) {
        AUDIT_LOG.info("event=STUDENT_CREATED actor={} studentId={}", actor, studentId);
    }

    public void studentUpdated(String actor, Long studentId) {
        AUDIT_LOG.info("event=STUDENT_UPDATED actor={} studentId={}", actor, studentId);
    }

    public void studentDeleted(String actor, Long studentId) {
        AUDIT_LOG.info("event=STUDENT_DELETED actor={} studentId={}", actor, studentId);
    }

    public void attendanceEntryRecorded(String actor, Long studentId, LocalDate date, LocalDateTime entryTime, String source) {
        AUDIT_LOG.info(
                "event=ATTENDANCE_ENTRY_RECORDED actor={} studentId={} date={} entryTime={} source={}",
                actor,
                studentId,
                date,
                entryTime,
                source);
    }
}
