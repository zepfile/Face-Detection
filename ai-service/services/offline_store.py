from __future__ import annotations

import sqlite3
import threading
from pathlib import Path
from typing import Iterable, List


class OfflineAttendanceStore:
    def __init__(self, db_path: str) -> None:
        self._db_path = Path(db_path)
        self._db_path.parent.mkdir(parents=True, exist_ok=True)
        self._lock = threading.Lock()
        self._initialize()

    def save_records(self, records: Iterable[dict]) -> int:
        payloads = list(records)
        if not payloads:
            return 0

        with self._lock, self._connect() as connection:
            cursor = connection.cursor()
            inserted = 0
            for record in payloads:
                source_event_id = record.get("sourceEventId")
                student_id = record.get("studentId")
                entry_time = self._resolve_entry_time(record)
                marked_by = record.get("markedBy") or "AI"

                if not source_event_id or student_id is None or not entry_time:
                    continue

                cursor.execute(
                    """
                    INSERT OR IGNORE INTO offline_attendance (
                        source_event_id, student_id, entry_time, marked_by, synced_flag
                    ) VALUES (?, ?, ?, ?, 0)
                    """,
                    (source_event_id, student_id, entry_time, marked_by),
                )
                inserted += cursor.rowcount

            connection.commit()
            return inserted

    def fetch_unsynced(self, limit: int = 200) -> List[dict]:
        with self._lock, self._connect() as connection:
            cursor = connection.cursor()
            cursor.execute(
                """
                SELECT source_event_id, student_id, entry_time, marked_by
                FROM offline_attendance
                WHERE synced_flag = 0
                ORDER BY created_at ASC
                LIMIT ?
                """,
                (limit,),
            )
            rows = cursor.fetchall()

        return [self._row_to_payload(row) for row in rows]

    def mark_synced(self, source_event_ids: Iterable[str]) -> int:
        values = [value for value in source_event_ids if value]
        if not values:
            return 0

        with self._lock, self._connect() as connection:
            cursor = connection.cursor()
            cursor.executemany(
                """
                UPDATE offline_attendance
                SET synced_flag = 1,
                    synced_at = CURRENT_TIMESTAMP
                WHERE source_event_id = ?
                """,
                [(value,) for value in values],
            )
            connection.commit()
            return cursor.rowcount

    def count_unsynced(self) -> int:
        with self._lock, self._connect() as connection:
            cursor = connection.cursor()
            cursor.execute("SELECT COUNT(*) FROM offline_attendance WHERE synced_flag = 0")
            row = cursor.fetchone()
        return int(row[0] if row else 0)

    def _initialize(self) -> None:
        with self._lock, self._connect() as connection:
            self._initialize_schema(connection)
            self._migrate_legacy_schema(connection)
            connection.commit()

    def _initialize_schema(self, connection: sqlite3.Connection) -> None:
        connection.execute(
            """
            CREATE TABLE IF NOT EXISTS offline_attendance (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                source_event_id TEXT NOT NULL UNIQUE,
                student_id INTEGER NOT NULL,
                entry_time TEXT,
                marked_by TEXT NOT NULL,
                synced_flag INTEGER NOT NULL DEFAULT 0,
                created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
                synced_at TEXT NULL
            )
            """
        )

    def _migrate_legacy_schema(self, connection: sqlite3.Connection) -> None:
        cursor = connection.cursor()
        cursor.execute("PRAGMA table_info(offline_attendance)")
        columns = {row[1] for row in cursor.fetchall()}

        if "entry_time" not in columns:
            cursor.execute("ALTER TABLE offline_attendance ADD COLUMN entry_time TEXT")
            columns.add("entry_time")

        if "date" in columns and "time" in columns:
            cursor.execute(
                """
                UPDATE offline_attendance
                SET entry_time = COALESCE(entry_time, date || 'T' || time)
                WHERE entry_time IS NULL
                  AND date IS NOT NULL
                  AND time IS NOT NULL
                """
            )

        cursor.execute(
            """
            UPDATE offline_attendance
            SET entry_time = COALESCE(entry_time, datetime('now'))
            WHERE entry_time IS NULL
            """
        )

    def _row_to_payload(self, row: tuple) -> dict:
        source_event_id, student_id, entry_time, marked_by = row
        date_part, time_part = self._split_timestamp(entry_time)
        return {
            "sourceEventId": source_event_id,
            "studentId": student_id,
            "timestamp": entry_time,
            "date": date_part,
            "time": time_part,
            "status": "PRESENT",
            "markedBy": marked_by,
        }

    def _resolve_entry_time(self, record: dict) -> str | None:
        timestamp = record.get("timestamp")
        if isinstance(timestamp, str) and timestamp.strip():
            return timestamp.strip()

        date_part = record.get("date")
        time_part = record.get("time")
        if isinstance(date_part, str) and date_part.strip() and isinstance(time_part, str) and time_part.strip():
            return f"{date_part.strip()}T{time_part.strip()}"

        return None

    def _split_timestamp(self, timestamp: str | None) -> tuple[str, str]:
        if not timestamp:
            return "", ""
        value = timestamp.strip()
        if "T" in value:
            date_part, time_part = value.split("T", 1)
            return date_part, time_part
        if " " in value:
            date_part, time_part = value.split(" ", 1)
            return date_part, time_part
        return value, ""

    def _connect(self) -> sqlite3.Connection:
        return sqlite3.connect(self._db_path.as_posix(), check_same_thread=False)
