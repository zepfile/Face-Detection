-- Migration: move attendance from status/time model to first-entry timestamp model.
-- Target: one attendance entry per student per day (first recognition only).

START TRANSACTION;

SET @db_name := DATABASE();

-- 1) Add new entry_time column if it does not exist yet.
SET @add_entry_time_column := (
    SELECT IF(
        EXISTS (
            SELECT 1
            FROM information_schema.columns
            WHERE table_schema = @db_name
              AND table_name = 'attendance'
              AND column_name = 'entry_time'
        ),
        'SELECT 1',
        'ALTER TABLE attendance ADD COLUMN entry_time DATETIME NULL AFTER `date`'
    )
);
PREPARE stmt_add_entry_time_column FROM @add_entry_time_column;
EXECUTE stmt_add_entry_time_column;
DEALLOCATE PREPARE stmt_add_entry_time_column;

-- 2) Backfill entry_time from legacy columns for PRESENT rows.
--    If status is NULL (older/custom data), keep the record and backfill as entry.
UPDATE attendance
SET entry_time = COALESCE(
        entry_time,
        TIMESTAMP(`date`, COALESCE(`time`, '00:00:00'))
    )
WHERE entry_time IS NULL
  AND (`status` IS NULL OR UPPER(`status`) = 'PRESENT');

-- 3) Remove rows that do not represent an entry (legacy ABSENT rows).
DELETE FROM attendance
WHERE entry_time IS NULL;

-- 4) Keep date aligned with entry_time date in UTC-based storage.
UPDATE attendance
SET `date` = DATE(entry_time)
WHERE `date` <> DATE(entry_time);

-- 5) Enforce non-null entry_time.
ALTER TABLE attendance
    MODIFY COLUMN entry_time DATETIME NOT NULL;

-- 5b) Legacy columns can break INSERTs if still NOT NULL while app no longer writes them.
SET @make_time_nullable := (
    SELECT IF(
        EXISTS (
            SELECT 1
            FROM information_schema.columns
            WHERE table_schema = @db_name
              AND table_name = 'attendance'
              AND column_name = 'time'
        ),
        'ALTER TABLE attendance MODIFY COLUMN `time` TIME NULL',
        'SELECT 1'
    )
);
PREPARE stmt_make_time_nullable FROM @make_time_nullable;
EXECUTE stmt_make_time_nullable;
DEALLOCATE PREPARE stmt_make_time_nullable;

SET @make_status_nullable := (
    SELECT IF(
        EXISTS (
            SELECT 1
            FROM information_schema.columns
            WHERE table_schema = @db_name
              AND table_name = 'attendance'
              AND column_name = 'status'
        ),
        'ALTER TABLE attendance MODIFY COLUMN status VARCHAR(255) NULL',
        'SELECT 1'
    )
);
PREPARE stmt_make_status_nullable FROM @make_status_nullable;
EXECUTE stmt_make_status_nullable;
DEALLOCATE PREPARE stmt_make_status_nullable;

-- 6) Ensure dedupe rule remains: one row per student per day.
--    Existing schema already has: UNIQUE KEY uk_attendance_student_date (student_id, date)
--    No change required if that key already exists.

COMMIT;

-- Optional cleanup after application rollout is stable:
-- ALTER TABLE attendance DROP COLUMN `time`;
-- ALTER TABLE attendance DROP COLUMN status;
