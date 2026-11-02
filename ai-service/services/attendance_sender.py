from __future__ import annotations

import logging
import time
from datetime import datetime, timezone
from hashlib import sha1
from typing import Dict, Iterable, List

import requests
from requests import RequestException, Response

from services.offline_store import OfflineAttendanceStore
from utils.config import settings


class AttendanceSender:
    def __init__(
        self,
        backend_url: str | None = None,
        endpoint: str = "/api/attendance/ai",
        enrollment_sync_endpoint: str = "/api/ai/enrollment-photos",
        timeout_seconds: int = 10,
        max_retries: int = 3,
        retry_delay_seconds: float = 1.5,
        backoff_multiplier: float = 2.0,
        bearer_token: str | None = None,
        api_key: str | None = None,
        offline_store: OfflineAttendanceStore | None = None,
        logger: logging.Logger | None = None,
    ) -> None:
        self.backend_url = (backend_url or settings.backend_url).rstrip("/")
        self.endpoint = endpoint
        self.enrollment_sync_endpoint = enrollment_sync_endpoint
        self.timeout_seconds = timeout_seconds
        self.max_retries = max_retries
        self.retry_delay_seconds = retry_delay_seconds
        self.backoff_multiplier = backoff_multiplier
        self.bearer_token = bearer_token or settings.backend_token
        self.api_key = api_key or settings.backend_api_key
        self.offline_store = offline_store or OfflineAttendanceStore(settings.offline_db_path)
        self.logger = logger or logging.getLogger(__name__)
        if self.backend_url.startswith("http://"):
            self.logger.warning(
                "Backend URL is not HTTPS (%s). Use HTTPS in production deployments.",
                self.backend_url,
            )

    def send_attendance(
        self,
        student_ids: Iterable[int | str],
        timestamp: datetime,
    ) -> bool:
        records = self._build_records(student_ids, timestamp)
        if not records:
            self.logger.info("No valid recognized student IDs to send")
            return False

        if self._send_records(records):
            return True

        stored = self.offline_store.save_records(records)
        self.logger.warning(
            "Stored %d attendance records offline for retry (unsynced=%d)",
            stored,
            self.offline_store.count_unsynced(),
        )
        # Records are now persisted locally, so caller can clear in-memory batch safely.
        return stored > 0

    def sync_offline_records(self, batch_size: int = 200) -> int:
        unsynced = self.offline_store.fetch_unsynced(limit=batch_size)
        if not unsynced:
            return 0

        if not self._send_records(unsynced):
            return 0

        synced_count = self.offline_store.mark_synced(
            [record.get("sourceEventId") for record in unsynced],
        )
        self.logger.info("Synced %d offline attendance records", synced_count)
        return synced_count

    def get_unsynced_count(self) -> int:
        return self.offline_store.count_unsynced()

    def fetch_enrollment_photos(self) -> Dict[str, List[str]]:
        url = f"{self.backend_url}{self.enrollment_sync_endpoint}"

        try:
            response = requests.get(
                url,
                headers=self._build_headers(),
                timeout=self.timeout_seconds,
                verify=settings.backend_verify_ssl,
            )
        except RequestException as ex:
            self.logger.warning("Failed to fetch enrollment photos: %s", ex)
            return {}

        if not self._is_success(response):
            self.logger.warning(
                "Enrollment photo sync failed: status=%d, body=%s",
                response.status_code,
                self._truncate(response.text),
            )
            return {}

        try:
            payload = response.json()
        except ValueError:
            self.logger.warning("Enrollment photo sync returned invalid JSON payload")
            return {}

        rows = payload.get("students") if isinstance(payload, dict) else None
        if not isinstance(rows, list):
            return {}

        grouped: Dict[str, List[str]] = {}
        for row in rows:
            if not isinstance(row, dict):
                continue

            student_id = row.get("studentId")
            images = row.get("images")
            if student_id is None or not isinstance(images, list):
                continue

            normalized_student_id = str(student_id).strip()
            if not normalized_student_id:
                continue

            valid_images = [str(image) for image in images if isinstance(image, str) and image.strip()]
            if not valid_images:
                continue

            grouped[normalized_student_id] = valid_images

        if grouped:
            self.logger.info("Fetched enrollment photos for %d students", len(grouped))
        return grouped

    def _send_records(self, records: List[dict]) -> bool:
        url = f"{self.backend_url}{self.endpoint}"
        headers = self._build_headers()

        last_error: Exception | None = None
        delay = self.retry_delay_seconds
        idempotency_key = self._batch_idempotency_key(records)

        for attempt in range(1, self.max_retries + 1):
            try:
                response = requests.post(
                    url,
                    json=records,
                    headers={**headers, "X-Idempotency-Key": idempotency_key},
                    timeout=self.timeout_seconds,
                    verify=settings.backend_verify_ssl,
                )
                if self._is_success(response):
                    self.logger.info(
                        "Attendance sent successfully: count=%d, attempt=%d, status=%d",
                        len(records),
                        attempt,
                        response.status_code,
                    )
                    return True

                self.logger.warning(
                    "Attendance send failed: attempt=%d, status=%d, body=%s",
                    attempt,
                    response.status_code,
                    self._truncate(response.text),
                )
            except RequestException as ex:
                last_error = ex
                self.logger.warning(
                    "Attendance send request error: attempt=%d, error=%s",
                    attempt,
                    ex,
                )

            if attempt < self.max_retries:
                time.sleep(delay)
                delay *= self.backoff_multiplier

        if last_error is not None:
            self.logger.error("Attendance send exhausted retries due to request errors: %s", last_error)
        else:
            self.logger.error("Attendance send exhausted retries without success")
        return False

    def _build_records(
        self,
        student_ids: Iterable[int | str],
        timestamp: datetime,
    ) -> List[dict]:
        unique_ids = []
        seen = set()
        for raw_student_id in student_ids:
            normalized = self._normalize_student_id(raw_student_id)
            if normalized is None or normalized in seen:
                continue
            seen.add(normalized)
            unique_ids.append(normalized)

        normalized_timestamp = self._normalize_timestamp(timestamp)
        event_timestamp = normalized_timestamp.strftime("%Y-%m-%dT%H:%M:%S")
        event_time = normalized_timestamp.time().isoformat(timespec="seconds")
        event_date = normalized_timestamp.date().isoformat()

        return [self._build_record(student_id, event_timestamp, event_date, event_time) for student_id in unique_ids]

    def _build_record(self, student_id: int, event_timestamp: str, event_date: str, event_time: str) -> dict:
        source_event_id = self._source_event_id(student_id, event_date, event_time)
        return {
            "studentId": student_id,
            "timestamp": event_timestamp,
            "date": event_date,
            "time": event_time,
            "status": "PRESENT",
            "markedBy": "AI",
            "sourceEventId": source_event_id,
        }

    def _normalize_student_id(self, student_id: int | str) -> int | None:
        if student_id is None:
            return None

        text = str(student_id).strip()
        if not text or text.upper() == "UNKNOWN":
            return None

        try:
            return int(text)
        except ValueError:
            self.logger.warning("Skipping non-numeric student ID from recognizer: %s", student_id)
            return None

    def _is_success(self, response: Response) -> bool:
        return 200 <= response.status_code < 300

    def _truncate(self, value: str, limit: int = 250) -> str:
        if len(value) <= limit:
            return value
        return value[:limit] + "..."

    def _source_event_id(self, student_id: int, event_date: str, event_time: str) -> str:
        raw = f"{student_id}|{event_date}|{event_time}|AI"
        digest = sha1(raw.encode("utf-8")).hexdigest()
        return f"ai-{digest}"

    def _normalize_timestamp(self, timestamp: datetime) -> datetime:
        if timestamp.tzinfo is None:
            # Treat naive timestamps as UTC to keep backend storage consistent.
            return timestamp.replace(microsecond=0)
        return timestamp.astimezone(timezone.utc).replace(tzinfo=None, microsecond=0)

    def _batch_idempotency_key(self, records: List[dict]) -> str:
        source_ids = sorted(
            [str(record.get("sourceEventId", "")) for record in records if record.get("sourceEventId")],
        )
        digest = sha1(",".join(source_ids).encode("utf-8")).hexdigest()
        return f"batch-{digest}"

    def _build_headers(self) -> Dict[str, str]:
        headers: Dict[str, str] = {"Content-Type": "application/json"}
        if self.bearer_token:
            headers["Authorization"] = f"Bearer {self.bearer_token}"
        if self.api_key:
            headers["X-API-Key"] = self.api_key
        return headers
