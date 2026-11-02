from __future__ import annotations

import threading
from datetime import datetime, timezone
from typing import List

import cv2
import numpy as np


class LiveFrameState:
    def __init__(self, jpeg_quality: int = 70) -> None:
        self._jpeg_quality = max(40, min(95, jpeg_quality))
        self._lock = threading.Lock()
        self._frame_jpeg: bytes | None = None
        self._frame_width = 0
        self._frame_height = 0
        self._faces: List[dict] = []
        self._updated_at = self._now_iso()
        self._initialize_placeholder_frame()

    def update(self, frame: np.ndarray, faces: List[dict]) -> None:
        if frame is None:
            return

        success, encoded = cv2.imencode(
            ".jpg",
            frame,
            [int(cv2.IMWRITE_JPEG_QUALITY), self._jpeg_quality],
        )
        if not success:
            return

        height, width = frame.shape[:2]
        with self._lock:
            self._frame_jpeg = encoded.tobytes()
            self._frame_width = int(width)
            self._frame_height = int(height)
            self._faces = list(faces or [])
            self._updated_at = self._now_iso()

    def get_frame_jpeg(self) -> bytes | None:
        with self._lock:
            return self._frame_jpeg

    def get_faces_payload(self) -> dict:
        with self._lock:
            return {
                "frameWidth": self._frame_width,
                "frameHeight": self._frame_height,
                "faces": list(self._faces),
                "updatedAt": self._updated_at,
            }

    def _now_iso(self) -> str:
        return datetime.now(timezone.utc).isoformat()

    def _initialize_placeholder_frame(self) -> None:
        # Keep stream endpoint responsive while camera initializes.
        frame = np.zeros((360, 640, 3), dtype=np.uint8)
        frame[:, :] = (39, 24, 17)  # BGR
        cv2.putText(
            frame,
            "Waiting for camera feed",
            (130, 165),
            cv2.FONT_HERSHEY_SIMPLEX,
            0.9,
            (255, 255, 255),
            2,
            cv2.LINE_AA,
        )
        cv2.putText(
            frame,
            "Start ai-service on host with CAMERA_ID/CAMERA_IDS",
            (95, 210),
            cv2.FONT_HERSHEY_SIMPLEX,
            0.55,
            (220, 220, 220),
            1,
            cv2.LINE_AA,
        )
        self.update(frame, [])
