-- Migration: coordinator role scope + student ownership + enrollment photo storage

START TRANSACTION;

UPDATE users
SET role = 'COORDINATOR'
WHERE UPPER(role) = 'TEACHER';

SET @db_name := DATABASE();

SET @add_teacher_id_column := (
    SELECT IF(
        EXISTS (
            SELECT 1
            FROM information_schema.columns
            WHERE table_schema = @db_name
              AND table_name = 'students'
              AND column_name = 'teacher_id'
        ),
        'SELECT 1',
        'ALTER TABLE students ADD COLUMN teacher_id BIGINT NULL AFTER class_group'
    )
);
PREPARE stmt_add_teacher_id_column FROM @add_teacher_id_column;
EXECUTE stmt_add_teacher_id_column;
DEALLOCATE PREPARE stmt_add_teacher_id_column;

SET @add_teacher_id_index := (
    SELECT IF(
        EXISTS (
            SELECT 1
            FROM information_schema.statistics
            WHERE table_schema = @db_name
              AND table_name = 'students'
              AND index_name = 'idx_students_teacher_id'
        ),
        'SELECT 1',
        'CREATE INDEX idx_students_teacher_id ON students (teacher_id)'
    )
);
PREPARE stmt_add_teacher_id_index FROM @add_teacher_id_index;
EXECUTE stmt_add_teacher_id_index;
DEALLOCATE PREPARE stmt_add_teacher_id_index;

SET @add_teacher_fk := (
    SELECT IF(
        EXISTS (
            SELECT 1
            FROM information_schema.table_constraints
            WHERE table_schema = @db_name
              AND table_name = 'students'
              AND constraint_name = 'fk_students_teacher'
              AND constraint_type = 'FOREIGN KEY'
        ),
        'SELECT 1',
        'ALTER TABLE students
            ADD CONSTRAINT fk_students_teacher
            FOREIGN KEY (teacher_id) REFERENCES users(id)
            ON UPDATE CASCADE
            ON DELETE SET NULL'
    )
);
PREPARE stmt_add_teacher_fk FROM @add_teacher_fk;
EXECUTE stmt_add_teacher_fk;
DEALLOCATE PREPARE stmt_add_teacher_fk;

SET @default_coordinator_id := (
    SELECT MIN(id)
    FROM users
    WHERE UPPER(role) = 'COORDINATOR'
);

UPDATE students
SET teacher_id = @default_coordinator_id
WHERE teacher_id IS NULL
  AND @default_coordinator_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS student_enrollment_photos (
    id BIGINT NOT NULL AUTO_INCREMENT,
    student_id BIGINT NOT NULL,
    captured_at DATETIME NOT NULL,
    image_data LONGTEXT NOT NULL,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    CONSTRAINT fk_student_enrollment_photo_student
        FOREIGN KEY (student_id) REFERENCES students (id)
        ON UPDATE CASCADE
        ON DELETE CASCADE,
    INDEX idx_student_enrollment_photo_student (student_id),
    INDEX idx_student_enrollment_photo_captured_at (captured_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

COMMIT;
