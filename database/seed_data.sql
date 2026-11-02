-- Sample seed data for face detection attendance system
-- Admin credentials:
-- username: admin
-- password: Password123!
-- Coordinator credentials:
-- username: coordinator1 (and coordinator2)
-- password: Password123!
-- bcrypt hash generated via bcrypt ($2a$10$...)

START TRANSACTION;

INSERT INTO users (id, username, password, role, failed_login_attempts, account_locked_until, created_at, updated_at)
VALUES
    (1, 'admin', '$2a$10$yxazpyL1iZ7lpLr/c8w4l.Eyii7oI3pRwmyw1gS/euLF4CJEtz6RK', 'ADMIN', 0, NULL, NOW(), NOW()),
    (2, 'coordinator1', '$2a$10$yxazpyL1iZ7lpLr/c8w4l.Eyii7oI3pRwmyw1gS/euLF4CJEtz6RK', 'COORDINATOR', 0, NULL, NOW(), NOW()),
    (3, 'coordinator2', '$2a$10$yxazpyL1iZ7lpLr/c8w4l.Eyii7oI3pRwmyw1gS/euLF4CJEtz6RK', 'COORDINATOR', 0, NULL, NOW(), NOW())
ON DUPLICATE KEY UPDATE
    password = VALUES(password),
    role = VALUES(role),
    failed_login_attempts = VALUES(failed_login_attempts),
    account_locked_until = VALUES(account_locked_until),
    updated_at = NOW();


INSERT INTO students (
    id, first_name, last_name, email, roll_number, class_group, teacher_id, parent_phone, parent_email, face_encoding, created_at, updated_at
)
VALUES
    (1, 'Aarav', 'Sharma', 'aarav.sharma@example.com', '10A001', '10A', 2, '+1555100001', 'parent.aarav@example.com', '[0.12,0.09,0.23,...]', NOW(), NOW()),
    (2, 'Diya', 'Patel', 'diya.patel@example.com', '10A002', '10A', 2, '+1555100002', 'parent.diya@example.com', '[0.08,0.11,0.19,...]', NOW(), NOW()),
    (3, 'Vivaan', 'Singh', 'vivaan.singh@example.com', '10A003', '10A', 2, '+1555100003', 'parent.vivaan@example.com', '[0.21,0.04,0.18,...]', NOW(), NOW()),
    (4, 'Anaya', 'Gupta', 'anaya.gupta@example.com', '10B001', '10B', 3, '+1555100004', 'parent.anaya@example.com', '[0.17,0.07,0.22,...]', NOW(), NOW()),
    (5, 'Ishaan', 'Verma', 'ishaan.verma@example.com', '10B002', '10B', 3, '+1555100005', 'parent.ishaan@example.com', '[0.05,0.16,0.14,...]', NOW(), NOW()),
    (6, 'Meera', 'Nair', 'meera.nair@example.com', '10B003', '10B', 3, '+1555100006', 'parent.meera@example.com', '[0.13,0.10,0.27,...]', NOW(), NOW()),
    (7, 'Kabir', 'Rao', 'kabir.rao@example.com', '10C001', '10C', 3, '+1555100007', 'parent.kabir@example.com', '[0.06,0.15,0.20,...]', NOW(), NOW()),
    (8, 'Sara', 'Iyer', 'sara.iyer@example.com', '10C002', '10C', 3, '+1555100008', 'parent.sara@example.com', '[0.18,0.12,0.09,...]', NOW(), NOW())
ON DUPLICATE KEY UPDATE
    first_name = VALUES(first_name),
    last_name = VALUES(last_name),
    class_group = VALUES(class_group),
    teacher_id = VALUES(teacher_id),
    parent_phone = VALUES(parent_phone),
    parent_email = VALUES(parent_email),
    face_encoding = VALUES(face_encoding),
    updated_at = NOW();


INSERT INTO attendance (student_id, `date`, entry_time, marked_by, source_event_id, created_at)
VALUES
    -- Today
    (1, CURDATE(), TIMESTAMP(CURDATE(), '08:52:00'), 'AI', 'seed-1-today', NOW()),
    (2, CURDATE(), TIMESTAMP(CURDATE(), '08:55:00'), 'AI', 'seed-2-today', NOW()),
    (4, CURDATE(), TIMESTAMP(CURDATE(), '08:58:00'), 'AI', 'seed-4-today', NOW()),
    (5, CURDATE(), TIMESTAMP(CURDATE(), '09:05:00'), 'MANUAL', NULL, NOW()),
    (7, CURDATE(), TIMESTAMP(CURDATE(), '08:59:00'), 'AI', 'seed-7-today', NOW()),
    (8, CURDATE(), TIMESTAMP(CURDATE(), '09:03:00'), 'AI', 'seed-8-today', NOW()),

    -- Yesterday
    (1, CURDATE() - INTERVAL 1 DAY, TIMESTAMP(CURDATE() - INTERVAL 1 DAY, '08:50:00'), 'AI', 'seed-1-yday', NOW()),
    (2, CURDATE() - INTERVAL 1 DAY, TIMESTAMP(CURDATE() - INTERVAL 1 DAY, '08:53:00'), 'AI', 'seed-2-yday', NOW()),
    (3, CURDATE() - INTERVAL 1 DAY, TIMESTAMP(CURDATE() - INTERVAL 1 DAY, '09:00:00'), 'MANUAL', NULL, NOW()),
    (4, CURDATE() - INTERVAL 1 DAY, TIMESTAMP(CURDATE() - INTERVAL 1 DAY, '08:57:00'), 'AI', 'seed-4-yday', NOW()),
    (6, CURDATE() - INTERVAL 1 DAY, TIMESTAMP(CURDATE() - INTERVAL 1 DAY, '09:06:00'), 'AI', 'seed-6-yday', NOW()),
    (7, CURDATE() - INTERVAL 1 DAY, TIMESTAMP(CURDATE() - INTERVAL 1 DAY, '09:01:00'), 'AI', 'seed-7-yday', NOW()),

    -- Two days ago
    (1, CURDATE() - INTERVAL 2 DAY, TIMESTAMP(CURDATE() - INTERVAL 2 DAY, '08:49:00'), 'AI', 'seed-1-2day', NOW()),
    (2, CURDATE() - INTERVAL 2 DAY, TIMESTAMP(CURDATE() - INTERVAL 2 DAY, '08:54:00'), 'AI', 'seed-2-2day', NOW()),
    (3, CURDATE() - INTERVAL 2 DAY, TIMESTAMP(CURDATE() - INTERVAL 2 DAY, '09:02:00'), 'MANUAL', NULL, NOW()),
    (5, CURDATE() - INTERVAL 2 DAY, TIMESTAMP(CURDATE() - INTERVAL 2 DAY, '09:03:00'), 'AI', 'seed-5-2day', NOW()),
    (6, CURDATE() - INTERVAL 2 DAY, TIMESTAMP(CURDATE() - INTERVAL 2 DAY, '09:05:00'), 'AI', 'seed-6-2day', NOW()),
    (7, CURDATE() - INTERVAL 2 DAY, TIMESTAMP(CURDATE() - INTERVAL 2 DAY, '08:58:00'), 'AI', 'seed-7-2day', NOW()),
    (8, CURDATE() - INTERVAL 2 DAY, TIMESTAMP(CURDATE() - INTERVAL 2 DAY, '09:07:00'), 'MANUAL', NULL, NOW())
ON DUPLICATE KEY UPDATE
    entry_time = VALUES(entry_time),
    marked_by = VALUES(marked_by),
    source_event_id = VALUES(source_event_id);

COMMIT;
