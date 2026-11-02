from __future__ import annotations

import os
from dataclasses import dataclass
from pathlib import Path
from typing import List, Union

from dotenv import load_dotenv


BASE_DIR = Path(__file__).resolve().parents[1]
# Support loading environment variables from project root (.env) and local ai-service (.env)
if (BASE_DIR.parent / ".env").is_file():
    load_dotenv(BASE_DIR.parent / ".env")
if (BASE_DIR / ".env").is_file():
    load_dotenv(BASE_DIR / ".env")


def _as_int(value: str | None, default: int) -> int:
    if value is None or not value.strip():
        return default
    try:
        return int(value)
    except ValueError:
        return default


def _as_float(value: str | None, default: float) -> float:
    if value is None or not value.strip():
        return default
    try:
        return float(value)
    except ValueError:
        return default


def _as_str(value: str | None, default: str) -> str:
    if value is None:
        return default
    normalized = value.strip()
    return normalized if normalized else default


def _as_bool(value: str | None, default: bool) -> bool:
    if value is None:
        return default
    normalized = value.strip().lower()
    if normalized in {"1", "true", "yes", "on"}:
        return True
    if normalized in {"0", "false", "no", "off"}:
        return False
    return default


def _camera_id(value: str | None, default: Union[int, str, None] = 0) -> Union[int, str, None]:
    if value is None or not value.strip():
        return default

    candidate = value.strip()
    if candidate.isdigit():
        return int(candidate)
    return candidate


def _camera_ids(value: str | None, fallback: Union[int, str, None]) -> List[Union[int, str]]:
    if value is None or not value.strip():
        return [fallback] if fallback is not None else []

    parsed: List[Union[int, str]] = []
    seen: set[str] = set()
    for item in value.split(","):
        candidate = item.strip()
        if not candidate:
            continue
        key = candidate.lower()
        if key in seen:
            continue
        seen.add(key)
        parsed_value = _camera_id(candidate, None)
        if parsed_value is None:
            continue
        parsed.append(parsed_value)

    if not parsed:
        return [fallback] if fallback is not None else []
    return parsed


@dataclass(frozen=True)
class Settings:
    backend_url: str
    backend_token: str
    backend_api_key: str
    backend_verify_ssl: bool
    camera_id: Union[int, str, None]
    camera_ids: List[Union[int, str]]
    encodings_path: str
    attendance_interval: int
    confidence_threshold: float
    detector_type: str
    detector_confidence_threshold: float
    face_encoding_model: str
    recognition_jitters: int
    recognition_consensus_frames: int
    recognition_consensus_window_seconds: int
    stream_host: str
    stream_port: int
    stream_fps: int
    processing_loop_delay_ms: int
    live_stream_enabled: bool
    frontend_origin: str
    offline_db_path: str
    offline_sync_interval: int


settings = Settings(
    backend_url=os.getenv("BACKEND_URL", "http://localhost:8080"),
    backend_token=_as_str(os.getenv("BACKEND_TOKEN"), ""),
    backend_api_key=_as_str(os.getenv("BACKEND_API_KEY") or os.getenv("AI_API_KEY"), "change-this-ai-api-key"),
    backend_verify_ssl=_as_bool(os.getenv("BACKEND_VERIFY_SSL"), False),
    camera_id=_camera_id(os.getenv("CAMERA_ID"), 0),
    camera_ids=_camera_ids(os.getenv("CAMERA_IDS"), _camera_id(os.getenv("CAMERA_ID"), 0)),
    encodings_path=os.getenv("ENCODINGS_PATH", str(BASE_DIR / "models" / "encodings.pkl")),
    attendance_interval=_as_int(os.getenv("ATTENDANCE_INTERVAL"), 10),
    confidence_threshold=_as_float(os.getenv("CONFIDENCE_THRESHOLD"), 0.6),
    detector_type=_as_str(os.getenv("DETECTOR_TYPE"), "hybrid").lower(),
    detector_confidence_threshold=_as_float(os.getenv("DETECTOR_CONFIDENCE_THRESHOLD"), 0.45),
    face_encoding_model=_as_str(os.getenv("FACE_ENCODING_MODEL"), "large").lower(),
    recognition_jitters=max(1, _as_int(os.getenv("RECOGNITION_JITTERS"), 2)),
    recognition_consensus_frames=max(1, _as_int(os.getenv("RECOGNITION_CONSENSUS_FRAMES"), 3)),
    recognition_consensus_window_seconds=max(1, _as_int(os.getenv("RECOGNITION_CONSENSUS_WINDOW_SECONDS"), 8)),
    stream_host=_as_str(os.getenv("STREAM_HOST"), "0.0.0.0"),
    stream_port=_as_int(os.getenv("STREAM_PORT"), 5000),
    stream_fps=max(1, _as_int(os.getenv("STREAM_FPS"), 8)),
    processing_loop_delay_ms=max(20, _as_int(os.getenv("PROCESSING_LOOP_DELAY_MS"), 80)),
    live_stream_enabled=_as_bool(os.getenv("LIVE_STREAM_ENABLED"), True),
    frontend_origin=_as_str(os.getenv("FRONTEND_ORIGIN"), "*"),
    offline_db_path=_as_str(os.getenv("OFFLINE_DB_PATH"), str(BASE_DIR / "data" / "offline_attendance.db")),
    offline_sync_interval=max(30, _as_int(os.getenv("OFFLINE_SYNC_INTERVAL"), 120)),
)
