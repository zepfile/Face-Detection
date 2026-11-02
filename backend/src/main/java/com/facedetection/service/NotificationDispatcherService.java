package com.facedetection.service;

import com.facedetection.config.NotificationProperties;
import com.facedetection.model.Student;
import com.twilio.Twilio;
import com.twilio.rest.api.v2010.account.Message;
import com.twilio.type.PhoneNumber;
import jakarta.annotation.PostConstruct;
import jakarta.annotation.PreDestroy;
import java.time.LocalDate;
import java.util.Objects;
import java.util.concurrent.BlockingQueue;
import java.util.concurrent.LinkedBlockingQueue;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicBoolean;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.mail.SimpleMailMessage;
import org.springframework.mail.javamail.JavaMailSender;
import com.facedetection.model.Attendance;
import com.facedetection.repository.AttendanceRepository;
import com.facedetection.repository.StudentRepository;
import java.util.List;
import java.util.Set;
import java.util.stream.Collectors;
import org.springframework.stereotype.Service;

@Service
public class NotificationDispatcherService {

    private static final Logger LOGGER = LoggerFactory.getLogger(NotificationDispatcherService.class);

    private final NotificationProperties notificationProperties;
    private final JavaMailSender mailSender;
    private final StudentRepository studentRepository;
    private final AttendanceRepository attendanceRepository;

    private final BlockingQueue<NotificationJob> notificationQueue = new LinkedBlockingQueue<>(5000);
    private final AtomicBoolean running = new AtomicBoolean(true);
    private final AtomicBoolean twilioInitialized = new AtomicBoolean(false);
    private Thread workerThread;

    public NotificationDispatcherService(
            NotificationProperties notificationProperties,
            JavaMailSender mailSender,
            StudentRepository studentRepository,
            AttendanceRepository attendanceRepository) {
        this.notificationProperties = notificationProperties;
        this.mailSender = mailSender;
        this.studentRepository = studentRepository;
        this.attendanceRepository = attendanceRepository;
    }

    @PostConstruct
    public void startWorker() {
        workerThread = new Thread(this::processQueue, "notification-dispatch-worker");
        workerThread.setDaemon(true);
        workerThread.start();
    }

    @PreDestroy
    public void shutdownWorker() {
        running.set(false);
        if (workerThread != null) {
            workerThread.interrupt();
        }
    }

    public void enqueueAbsentNotification(Student student, LocalDate attendanceDate) {
        if (!notificationProperties.isEnabled()) {
            return;
        }
        if (student == null || student.getId() == null) {
            return;
        }

        NotificationJob job = new NotificationJob(
                student.getId(),
                student.getFirstName(),
                student.getLastName(),
                sanitize(student.getParentEmail()),
                sanitize(student.getParentPhone()),
                attendanceDate);

        if (!hasAnyContact(job)) {
            LOGGER.debug("Skipping notification for student {} due to missing guardian contact", student.getId());
            return;
        }

        boolean accepted = notificationQueue.offer(job);
        if (!accepted) {
            LOGGER.warn("Notification queue is full; dropping alert for student {}", student.getId());
        }
    }

    public int notifyAbsentStudentsForDate(LocalDate date, String classGroup) {
        if (!notificationProperties.isEnabled()) {
            return 0;
        }
        LocalDate targetDate = date != null ? date : LocalDate.now();

        List<Student> students;
        if (classGroup != null && !classGroup.isBlank()) {
            students = studentRepository.findByClassGroup(classGroup.trim());
        } else {
            students = studentRepository.findAll();
        }

        List<Attendance> attendances = attendanceRepository.findByDateOrderByEntryTimeDesc(targetDate);
        Set<Long> presentStudentIds = attendances.stream()
                .filter(a -> a.getStudent() != null && a.getStudent().getId() != null)
                .map(a -> a.getStudent().getId())
                .collect(Collectors.toSet());

        int enqueuedCount = 0;
        for (Student student : students) {
            if (!presentStudentIds.contains(student.getId())) {
                enqueueAbsentNotification(student, targetDate);
                enqueuedCount++;
            }
        }
        LOGGER.info("Enqueued absent notifications for {} student(s) on date {}", enqueuedCount, targetDate);
        return enqueuedCount;
    }

    public int queueSize() {
        return notificationQueue.size();
    }

    private void processQueue() {
        while (running.get() || !notificationQueue.isEmpty()) {
            try {
                NotificationJob job = notificationQueue.poll(1, TimeUnit.SECONDS);
                if (job == null) {
                    continue;
                }
                dispatch(job);
            } catch (InterruptedException ex) {
                Thread.currentThread().interrupt();
            } catch (Exception ex) {
                LOGGER.error("Notification worker failed while processing queue", ex);
            }
        }
    }

    private void dispatch(NotificationJob job) {
        if (notificationProperties.getEmail().isEnabled() && job.parentEmail() != null) {
            sendEmail(job);
        }
        if (notificationProperties.getSms().isEnabled() && job.parentPhone() != null) {
            sendSms(job);
        }
    }

    private void sendEmail(NotificationJob job) {
        String from = sanitize(notificationProperties.getEmail().getFrom());
        if (from == null) {
            from = "no-reply@face-detection.local";
        }

        SimpleMailMessage message = new SimpleMailMessage();
        message.setFrom(from);
        message.setTo(job.parentEmail());
        message.setSubject("Attendance Alert: Student Marked Absent");
        message.setText(buildMessage(job));

        boolean sentViaSmtp = false;
        try {
            if (mailSender != null) {
                mailSender.send(message);
                sentViaSmtp = true;
                LOGGER.info("Absent email notification sent via SMTP for student {} to {}", job.studentId(), job.parentEmail());
            }
        } catch (Exception ex) {
            LOGGER.debug("SMTP mail delivery skipped or unconfigured ({}). Using simulated console log.", ex.getMessage());
        }

        if (!sentViaSmtp) {
            LOGGER.info("[SIMULATED EMAIL SENT] To: {} | From: {} | Subject: Attendance Alert: Student Marked Absent | Content: {}",
                    job.parentEmail(), from, buildMessage(job));
        }
    }

    private void sendSms(NotificationJob job) {
        boolean sentViaTwilio = false;
        try {
            initializeTwilioIfNeeded();
            String fromNumber = sanitize(notificationProperties.getTwilio().getFromNumber());
            if (fromNumber != null) {
                Message.creator(
                        new PhoneNumber(job.parentPhone()),
                        new PhoneNumber(fromNumber),
                        buildMessage(job))
                        .create();
                sentViaTwilio = true;
                LOGGER.info("Absent SMS notification sent via Twilio for student {}", job.studentId());
            }
        } catch (Exception ex) {
            LOGGER.debug("Twilio SMS delivery skipped or unconfigured ({}). Using simulated console log.", ex.getMessage());
        }

        if (!sentViaTwilio) {
            LOGGER.info("[SIMULATED SMS SENT] To: {} | Message: {}", job.parentPhone(), buildMessage(job));
        }
    }

    public boolean sendSingleSms(String phone, String text) {
        String cleanPhone = sanitize(phone);
        if (cleanPhone == null) {
            return false;
        }
        boolean sentViaTwilio = false;
        try {
            initializeTwilioIfNeeded();
            String fromNumber = sanitize(notificationProperties.getTwilio().getFromNumber());
            if (fromNumber != null) {
                Message.creator(
                        new PhoneNumber(cleanPhone),
                        new PhoneNumber(fromNumber),
                        text)
                        .create();
                sentViaTwilio = true;
                LOGGER.info("SMS sent via Twilio to {}", cleanPhone);
            }
        } catch (Exception ex) {
            LOGGER.debug("Twilio SMS delivery unconfigured or skipped: {}", ex.getMessage());
        }

        if (!sentViaTwilio) {
            LOGGER.info("[SIMULATED SMS SENT] To: {} | Message: {}", cleanPhone, text);
        }
        return sentViaTwilio;
    }

    private void initializeTwilioIfNeeded() {
        if (twilioInitialized.get()) {
            return;
        }

        String accountSid = sanitize(notificationProperties.getTwilio().getAccountSid());
        String authToken = sanitize(notificationProperties.getTwilio().getAuthToken());
        if (accountSid == null || authToken == null) {
            throw new IllegalStateException("Twilio credentials are missing");
        }

        synchronized (twilioInitialized) {
            if (!twilioInitialized.get()) {
                Twilio.init(accountSid, authToken);
                twilioInitialized.set(true);
            }
        }
    }

    private String buildMessage(NotificationJob job) {
        return "Attendance Alert: " + job.firstName() + " " + job.lastName()
                + " was marked ABSENT on " + job.attendanceDate() + ".";
    }

    private boolean hasAnyContact(NotificationJob job) {
        return job.parentEmail() != null || job.parentPhone() != null;
    }

    private String sanitize(String value) {
        if (value == null) {
            return null;
        }
        String normalized = value.trim();
        return normalized.isEmpty() ? null : normalized;
    }

    private record NotificationJob(
            Long studentId,
            String firstName,
            String lastName,
            String parentEmail,
            String parentPhone,
            LocalDate attendanceDate) {
        private NotificationJob {
            Objects.requireNonNull(studentId);
            Objects.requireNonNull(attendanceDate);
        }
    }
}
