from __future__ import annotations

import logging
import signal
import time
from collections import defaultdict, deque
from dataclasses import dataclass
from datetime import datetime
from hashlib import sha1
from threading import Event, Lock, Thread
from typing import Any, Iterable, Set

from services.attendance_sender import AttendanceSender
from services.camera import Camera
from services.face_detector import FaceDetector
from services.face_recognizer import FaceRecognizer
from services.live_state import LiveFrameState
from services.stream_server import LiveStreamServer
from utils.config import settings
from utils.time_utils import format_time, get_current_time


LOGGER = logging.getLogger("ai_service")


@dataclass(frozen=True)
class CameraContext:
    camera_key: str
    source: int | str
    camera: Camera
    live_state: LiveFrameState


class AiAttendanceService:
    def __init__(self) -> None:
        self.stop_event = Event()
        self.batch_interval_seconds = max(1, settings.attendance_interval)
        self.pending_student_ids: Set[str] = set()
        self.last_dispatch_time = get_current_time()
        self.sync_thread: Thread | None = None
        self._recognition_observations: dict[str, deque[datetime]] = defaultdict(deque)
        self._confirmed_recently: dict[str, datetime] = {}

        self.detector: FaceDetector | None = None
        self.recognizer: FaceRecognizer | None = None
        self.sender: AttendanceSender | None = None
        self.live_server: LiveStreamServer | None = None

        self._camera_lock = Lock()
        self._camera_sources_by_key: dict[str, int | str] = {}
        self._camera_order: list[str] = []
        self._camera_instances: dict[str, Camera] = {}
        self._camera_states: dict[str, LiveFrameState] = {}
        self._last_camera_init_attempt_at: dict[str, datetime] = {}
        self._camera_cursor = 0
        self._last_model_init_attempt: datetime | None = None
        self._last_no_camera_warning_at: datetime | None = None
        self._apply_camera_sources(settings.camera_ids)

    def run(self) -> None:
        self._register_signals()
        self._initialize_components()
        self._start_sync_thread()

        LOGGER.info(
            "AI attendance service started (cameras=%s, interval=%ss, loopDelay=%sms, backend=%s, stream=http://%s:%s/api/live/stream)",
            ", ".join(self._camera_sources_as_strings()),
            self.batch_interval_seconds,
            settings.processing_loop_delay_ms,
            settings.backend_url,
            settings.stream_host,
            settings.stream_port,
        )

        loop_delay_seconds = max(0.02, float(settings.processing_loop_delay_ms) / 1000.0)
        try:
            while not self.stop_event.is_set():
                loop_time = get_current_time()
                self._process_frame(loop_time)
                self._dispatch_if_due(loop_time)
                time.sleep(loop_delay_seconds)
        finally:
            self._shutdown()

    def _initialize_components(self) -> None:
        self.sender = AttendanceSender(logger=LOGGER)
        if settings.live_stream_enabled:
            self.live_server = LiveStreamServer(
                frame_provider=self._stream_frame_provider,
                faces_provider=self._stream_faces_provider,
                cameras_provider=self._list_cameras_payload,
                camera_update_handler=self._update_cameras_from_api,
                encoding_reload_handler=self.reload_encodings,
                host=settings.stream_host,
                port=settings.stream_port,
                fps=settings.stream_fps,
                allowed_origins=[settings.frontend_origin],
                logger=LOGGER,
            )
            self.live_server.start()
        else:
            LOGGER.info("Live stream server disabled (LIVE_STREAM_ENABLED=false)")
        self._ensure_vision_pipeline()

    def _process_frame(self, captured_at: datetime) -> None:
        if not self._ensure_vision_pipeline():
            return

        context = self._next_camera_context()
        if context is None:
            return

        if self.detector is None or self.recognizer is None:
            return

        try:
            frame = context.camera.get_frame()
        except Exception as ex:
            LOGGER.warning("Camera read failed (camera=%s): %s", context.source, ex)
            self._reset_camera(context.camera_key)
            time.sleep(0.1)
            return

        try:
            face_locations = self.detector.detect_faces(frame)
        except Exception as ex:
            LOGGER.exception("Face detection failed (camera=%s): %s", context.source, ex)
            context.live_state.update(frame, [])
            return

        recognition_results: list[tuple[str, float]] = []
        if face_locations:
            try:
                recognition_results = self.recognizer.recognize_faces(frame, face_locations)
            except Exception as ex:
                # Do not reset camera for recognition errors; continue stream and retry next frame.
                LOGGER.exception("Face recognition failed (camera=%s): %s", context.source, ex)
                recognition_results = []

        overlays = self._build_face_overlays(face_locations, recognition_results)
        context.live_state.update(frame, overlays)

        if not face_locations:
            return

        new_ids = self._extract_recognized_ids(recognition_results)
        confirmed_ids = self._confirm_recognitions(new_ids, captured_at)
        if confirmed_ids:
            self.pending_student_ids.update(confirmed_ids)
            LOGGER.info(
                "Confirmed students at %s (camera=%s): %s",
                format_time(captured_at),
                context.source,
                ", ".join(sorted(confirmed_ids)),
            )

    def _dispatch_if_due(self, now: datetime, force: bool = False) -> None:
        elapsed = (now - self.last_dispatch_time).total_seconds()
        if not force and elapsed < self.batch_interval_seconds:
            return

        self.last_dispatch_time = now
        if not self.pending_student_ids:
            return

        if self.sender is None:
            LOGGER.error("Attendance sender is not initialized")
            return

        batch_ids = sorted(self.pending_student_ids)
        LOGGER.info(
            "Dispatching attendance batch at %s (count=%d)",
            format_time(now),
            len(batch_ids),
        )

        success = self.sender.send_attendance(batch_ids, now)
        if success:
            self.pending_student_ids.clear()
        else:
            LOGGER.warning("Attendance batch failed; pending IDs retained for next retry window")

    def _shutdown(self) -> None:
        shutdown_time = get_current_time()
        LOGGER.info("Shutting down AI attendance service at %s", format_time(shutdown_time))

        try:
            self._dispatch_if_due(shutdown_time, force=True)
        except Exception as ex:
            LOGGER.exception("Failed to flush pending attendance on shutdown: %s", ex)

        if self.live_server is not None:
            self.live_server.stop()

        self._release_all_cameras()
        LOGGER.info("AI attendance service stopped")

    def _register_signals(self) -> None:
        def _handle_signal(signum: int, _frame: object) -> None:
            LOGGER.info("Received signal %s, stopping service...", signum)
            self.stop_event.set()

        signal.signal(signal.SIGINT, _handle_signal)
        signal.signal(signal.SIGTERM, _handle_signal)

    def _extract_recognized_ids(self, results: Iterable[tuple[str, float]]) -> Set[str]:
        recognized: Set[str] = set()
        for student_id, _confidence in results:
            if student_id is None:
                continue
            normalized = str(student_id).strip()
            if not normalized or normalized.upper() == "UNKNOWN":
                continue
            recognized.add(normalized)
        return recognized

    def _confirm_recognitions(self, recognized_ids: Set[str], captured_at: datetime) -> Set[str]:
        window_seconds = max(1, settings.recognition_consensus_window_seconds)
        required_frames = max(1, settings.recognition_consensus_frames)
        confirmed: Set[str] = set()
        stale_before = captured_at.timestamp() - float(window_seconds)

        for student_id in list(self._recognition_observations.keys()):
            observations = self._recognition_observations[student_id]
            while observations and observations[0].timestamp() < stale_before:
                observations.popleft()
            if not observations and student_id not in recognized_ids:
                self._recognition_observations.pop(student_id, None)

        for student_id in recognized_ids:
            observations = self._recognition_observations[student_id]
            observations.append(captured_at)
            while observations and observations[0].timestamp() < stale_before:
                observations.popleft()

            last_confirmed_at = self._confirmed_recently.get(student_id)
            if last_confirmed_at is not None:
                if (captured_at - last_confirmed_at).total_seconds() < self.batch_interval_seconds:
                    continue

            if len(observations) >= required_frames:
                confirmed.add(student_id)
                self._confirmed_recently[student_id] = captured_at
                observations.clear()

        return confirmed

    def _build_face_overlays(
        self,
        face_locations: Iterable[tuple[int, int, int, int]],
        recognition_results: Iterable[tuple[str, float]],
    ) -> list[dict]:
        locations = list(face_locations)
        recognitions = list(recognition_results)
        overlays: list[dict] = []

        for index, location in enumerate(locations):
            top, right, bottom, left = location
            student_id = "UNKNOWN"
            confidence = 0.0

            if index < len(recognitions):
                student_id, confidence = recognitions[index]

            label = "UNKNOWN" if str(student_id).upper() == "UNKNOWN" else f"ID: {student_id}"
            overlays.append(
                {
                    "top": int(top),
                    "right": int(right),
                    "bottom": int(bottom),
                    "left": int(left),
                    "label": label,
                    "confidence": round(float(confidence) * 100.0, 2),
                },
            )

        return overlays

    def _start_sync_thread(self) -> None:
        if self.sender is None:
            return

        def _sync_loop() -> None:
            while not self.stop_event.is_set():
                try:
                    synced = self.sender.sync_offline_records()
                    if synced > 0:
                        LOGGER.info("Offline sync completed for %d records", synced)
                except Exception as ex:
                    LOGGER.exception("Offline sync loop failed: %s", ex)

                try:
                    self._bootstrap_encodings_from_backend(force=True)
                except Exception as ex:
                    LOGGER.debug("Periodic enrollment sync check: %s", ex)

                self.stop_event.wait(min(60, settings.offline_sync_interval))

        self.sync_thread = Thread(target=_sync_loop, name="offline-sync-worker", daemon=True)
        self.sync_thread.start()

    def _ensure_vision_pipeline(self) -> bool:
        if not self._ensure_models():
            return False
        opened_any_camera = self._ensure_cameras()
        if opened_any_camera:
            self._last_no_camera_warning_at = None
            return True

        if not opened_any_camera:
            now = get_current_time()
            if (
                self._last_no_camera_warning_at is None
                or (now - self._last_no_camera_warning_at).total_seconds() >= 10
            ):
                LOGGER.warning("No camera is currently available. Check webcam connection/CAMERA_IDS.")
                self._last_no_camera_warning_at = now
        return False

    def _ensure_models(self) -> bool:
        if self.detector is not None and self.recognizer is not None:
            return True

        now = get_current_time()
        if self._last_model_init_attempt is not None:
            elapsed = (now - self._last_model_init_attempt).total_seconds()
            if elapsed < 3:
                return False

        self._last_model_init_attempt = now
        try:
            self.detector = FaceDetector(
                detector_type=settings.detector_type,
                confidence_threshold=settings.detector_confidence_threshold,
            )
            self.recognizer = FaceRecognizer()
            self._bootstrap_encodings_from_backend()
            LOGGER.info(
                "Vision models ready (detector=%s, encodings=%s, known_students=%d, consensusFrames=%d)",
                settings.detector_type,
                settings.encodings_path,
                self.recognizer.known_students_count(),
                settings.recognition_consensus_frames,
            )
            return True
        except Exception as ex:
            self.detector = None
            self.recognizer = None
            LOGGER.error("Vision model init failed: %s", ex)
            return False

    def _ensure_cameras(self) -> bool:
        now = get_current_time()
        opened_any_camera = False

        with self._camera_lock:
            ordered_keys = list(self._camera_order)

        for camera_key in ordered_keys:
            source = self._camera_source(camera_key)
            if source is None:
                continue

            if self._has_camera_instance(camera_key):
                opened_any_camera = True
                continue

            last_attempt = self._last_camera_init_attempt_at.get(camera_key)
            if last_attempt is not None and (now - last_attempt).total_seconds() < 3:
                continue

            self._last_camera_init_attempt_at[camera_key] = now
            try:
                instance = Camera(source)
            except Exception as ex:
                LOGGER.error("Camera init failed for source '%s': %s", source, ex)
                continue

            with self._camera_lock:
                if camera_key not in self._camera_sources_by_key:
                    try:
                        instance.release()
                    except Exception:
                        LOGGER.debug("Failed to release stale camera instance", exc_info=True)
                    continue
                self._camera_instances[camera_key] = instance
                opened_any_camera = True

            LOGGER.info("Camera source ready (key=%s, source=%s)", camera_key, source)

        return opened_any_camera

    def _next_camera_context(self) -> CameraContext | None:
        with self._camera_lock:
            available_keys = [key for key in self._camera_order if key in self._camera_instances and key in self._camera_states]
            if not available_keys:
                return None

            self._camera_cursor %= len(available_keys)
            selected_key = available_keys[self._camera_cursor]
            self._camera_cursor = (self._camera_cursor + 1) % len(available_keys)

            source = self._camera_sources_by_key.get(selected_key)
            camera = self._camera_instances.get(selected_key)
            state = self._camera_states.get(selected_key)

        if source is None or camera is None or state is None:
            return None
        return CameraContext(
            camera_key=selected_key,
            source=source,
            camera=camera,
            live_state=state,
        )

    def _reset_camera(self, camera_key: str) -> None:
        camera: Camera | None
        with self._camera_lock:
            camera = self._camera_instances.pop(camera_key, None)

        if camera is None:
            return
        try:
            camera.release()
        except Exception:
            LOGGER.debug("Camera release failed during reset (key=%s)", camera_key, exc_info=True)

    def _release_all_cameras(self) -> None:
        with self._camera_lock:
            cameras = list(self._camera_instances.values())
            self._camera_instances.clear()

        for camera in cameras:
            try:
                camera.release()
            except Exception:
                LOGGER.debug("Camera release failed during shutdown", exc_info=True)

    def reload_encodings(self) -> int:
        return self._bootstrap_encodings_from_backend(force=True)

    def _bootstrap_encodings_from_backend(self, force: bool = False) -> int:
        if self.sender is None or self.recognizer is None:
            return 0
        if not force and self.recognizer.known_students_count() > 0:
            return self.recognizer.known_students_count()

        photos_by_student = self.sender.fetch_enrollment_photos()
        if not photos_by_student:
            if not force:
                LOGGER.warning(
                    "No enrollment photos received from backend. "
                    "Capture 5 enrollment photos with front and side angles per student to enable recognition.",
                )
            return 0

        try:
            rebuilt = self.recognizer.rebuild_from_data_urls(photos_by_student, admin_mode=True)
        except Exception as ex:
            LOGGER.error("Failed to rebuild encodings from backend enrollment photos: %s", ex)
            return 0
        if rebuilt <= 0:
            if not force:
                LOGGER.warning(
                    "Enrollment photos were fetched but no face encodings could be generated. "
                    "Retake clear front and side-angle photos.",
                )
            return 0

        LOGGER.info("Rebuilt face encodings from backend enrollment photos for %d students", rebuilt)
        return rebuilt

    def _stream_frame_provider(self, camera_key: str | None) -> bytes | None:
        state = self._resolve_live_state(camera_key)
        if state is None:
            return None
        return state.get_frame_jpeg()

    def _stream_faces_provider(self, camera_key: str | None) -> dict:
        selected_key, state = self._resolve_live_state_with_key(camera_key)
        if state is None:
            return {
                "cameraKey": selected_key,
                "cameraSource": None,
                "frameWidth": 0,
                "frameHeight": 0,
                "faces": [],
                "updatedAt": get_current_time().isoformat(),
            }

        payload = state.get_faces_payload()
        payload["cameraKey"] = selected_key
        payload["cameraSource"] = str(self._camera_source(selected_key)) if selected_key else None
        return payload

    def _list_cameras_payload(self) -> list[dict[str, Any]]:
        with self._camera_lock:
            keys = list(self._camera_order)
            sources = dict(self._camera_sources_by_key)
            online = set(self._camera_instances.keys())
            states = dict(self._camera_states)

        payload: list[dict[str, Any]] = []
        for key in keys:
            state = states.get(key)
            faces_payload = state.get_faces_payload() if state is not None else {}
            payload.append(
                {
                    "cameraKey": key,
                    "source": str(sources.get(key, "")),
                    "online": key in online,
                    "updatedAt": faces_payload.get("updatedAt"),
                    "streamPath": f"/api/live/stream/{key}",
                    "facesPath": f"/api/live/faces/{key}",
                },
            )
        return payload

    def _update_cameras_from_api(self, sources: list[str]) -> dict[str, Any]:
        normalized_sources = self._normalize_camera_sources(sources)
        self._apply_camera_sources(normalized_sources)
        LOGGER.info("Camera sources updated via API: %s", ", ".join(str(value) for value in normalized_sources))
        return {
            "message": "Camera sources updated",
            "cameras": self._list_cameras_payload(),
        }

    def _resolve_live_state(self, camera_key: str | None) -> LiveFrameState | None:
        _resolved_key, state = self._resolve_live_state_with_key(camera_key)
        return state

    def _resolve_live_state_with_key(self, camera_key: str | None) -> tuple[str | None, LiveFrameState | None]:
        with self._camera_lock:
            if camera_key and camera_key in self._camera_states:
                return camera_key, self._camera_states[camera_key]
            for key in self._camera_order:
                state = self._camera_states.get(key)
                if state is not None:
                    return key, state
        return None, None

    def _apply_camera_sources(self, raw_sources: Iterable[int | str]) -> None:
        normalized_sources = self._normalize_camera_sources(raw_sources)
        new_sources_by_key = {self._camera_key(source): source for source in normalized_sources}
        new_order = [self._camera_key(source) for source in normalized_sources]

        cameras_to_release: list[Camera] = []
        with self._camera_lock:
            existing_keys = set(self._camera_sources_by_key.keys())
            incoming_keys = set(new_sources_by_key.keys())

            removed_keys = existing_keys - incoming_keys
            for key in removed_keys:
                stale_camera = self._camera_instances.pop(key, None)
                if stale_camera is not None:
                    cameras_to_release.append(stale_camera)
                self._camera_sources_by_key.pop(key, None)
                self._camera_states.pop(key, None)
                self._last_camera_init_attempt_at.pop(key, None)

            for key, source in new_sources_by_key.items():
                self._camera_sources_by_key[key] = source
                if key not in self._camera_states:
                    self._camera_states[key] = LiveFrameState()
                if key not in self._last_camera_init_attempt_at:
                    self._last_camera_init_attempt_at[key] = datetime.min

            self._camera_order = new_order
            if self._camera_cursor >= len(self._camera_order):
                self._camera_cursor = 0

        for camera in cameras_to_release:
            try:
                camera.release()
            except Exception:
                LOGGER.debug("Failed releasing removed camera source", exc_info=True)

    def _normalize_camera_sources(self, raw_sources: Iterable[int | str]) -> list[int | str]:
        normalized: list[int | str] = []
        seen: set[str] = set()

        for source in raw_sources:
            parsed = self._normalize_camera_source(source)
            if parsed is None:
                continue
            key = str(parsed).strip().lower()
            if key in seen:
                continue
            seen.add(key)
            normalized.append(parsed)

        if not normalized and settings.camera_id is not None:
            normalized.append(settings.camera_id)
        return normalized

    def _normalize_camera_source(self, source: int | str | None) -> int | str | None:
        if source is None:
            return None

        if isinstance(source, int):
            return source

        text = str(source).strip()
        if not text:
            return None
        if text.isdigit():
            return int(text)
        return text

    def _camera_key(self, source: int | str) -> str:
        if isinstance(source, int):
            return f"cam-{source}"

        text = str(source).strip()
        if text.isdigit():
            return f"cam-{int(text)}"

        digest = sha1(text.encode("utf-8")).hexdigest()[:10]
        return f"cam-{digest}"

    def _camera_source(self, camera_key: str | None) -> int | str | None:
        if camera_key is None:
            return None
        with self._camera_lock:
            return self._camera_sources_by_key.get(camera_key)

    def _camera_sources_as_strings(self) -> list[str]:
        with self._camera_lock:
            return [str(self._camera_sources_by_key.get(key, "")) for key in self._camera_order]

    def _has_camera_instance(self, camera_key: str) -> bool:
        with self._camera_lock:
            return camera_key in self._camera_instances


def configure_logging() -> None:
    logging.basicConfig(
        level=logging.INFO,
        format="%(asctime)s [%(levelname)s] %(name)s - %(message)s",
    )


def main() -> None:
    configure_logging()
    service = AiAttendanceService()
    service.run()


if __name__ == "__main__":
    main()
