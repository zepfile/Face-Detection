from __future__ import annotations

import os
from typing import Any

import cv2
import numpy as np

from utils.config import settings


class Camera:
    def __init__(self, camera_id: Any | None = None) -> None:
        self.camera_id = settings.camera_id if camera_id is None else camera_id
        self._capture: cv2.VideoCapture | None = None
        self._is_virtual: bool = False
        self._virtual_counter: int = 0
        self._initialize_capture()

    def _initialize_capture(self) -> None:
        capture = self._open_with_fallbacks()
        self._capture = capture

    def _open_with_fallbacks(self) -> cv2.VideoCapture | None:
        attempts: list[tuple[Any, int | None]] = []
        if isinstance(self.camera_id, int):
            if os.name == "nt":
                # Windows webcams frequently require explicit backend selection.
                attempts = [
                    (self.camera_id, cv2.CAP_DSHOW),
                    (self.camera_id, cv2.CAP_MSMF),
                    (self.camera_id, None),
                ]
            else:
                attempts = [(self.camera_id, None)]
        else:
            attempts = [(self.camera_id, None)]

        for source, backend in attempts:
            try:
                capture = cv2.VideoCapture(source, backend) if backend is not None else cv2.VideoCapture(source)
            except Exception:
                continue

            if capture and capture.isOpened():
                # Keep camera I/O lightweight for laptop usage.
                capture.set(cv2.CAP_PROP_FRAME_WIDTH, 640)
                capture.set(cv2.CAP_PROP_FRAME_HEIGHT, 480)
                capture.set(cv2.CAP_PROP_BUFFERSIZE, 1)
                self._is_virtual = False
                return capture

            if capture:
                capture.release()

        # Fallback to virtual standby stream if physical hardware is unavailable
        self._is_virtual = True
        return None

    def get_frame(self) -> np.ndarray:
        if self._is_virtual or self._capture is None or not self._capture.isOpened():
            return self._generate_virtual_frame()

        try:
            success, frame = self._capture.read()
            # If video file reached EOF, loop back to start
            if (not success or frame is None) and isinstance(self.camera_id, str) and not str(self.camera_id).isdigit():
                self._capture.set(cv2.CAP_PROP_POS_FRAMES, 0)
                success, frame = self._capture.read()
        except Exception:
            return self._generate_virtual_frame()

        if not success or frame is None:
            return self._generate_virtual_frame()

        return frame

    def _generate_virtual_frame(self) -> np.ndarray:
        import time
        self._virtual_counter = (self._virtual_counter + 1) % 360
        frame = np.zeros((480, 640, 3), dtype=np.uint8)
        frame[:, :] = (28, 22, 18)

        # Header bar
        cv2.rectangle(frame, (0, 0), (640, 42), (45, 35, 28), -1)
        cv2.putText(frame, "AI SMART ATTENDANCE - CAMERA FEED", (15, 28), cv2.FONT_HERSHEY_SIMPLEX, 0.65, (0, 220, 255), 2)

        # Display box
        cv2.rectangle(frame, (20, 60), (620, 430), (55, 45, 38), 2)
        cv2.putText(frame, "STANDBY - NO WEBCAM DETECTED", (90, 160), cv2.FONT_HERSHEY_SIMPLEX, 0.75, (255, 255, 255), 2)

        src_label = str(self.camera_id) if self.camera_id is not None else "0"
        cv2.putText(frame, f"Source Index/URL: {src_label}", (110, 210), cv2.FONT_HERSHEY_SIMPLEX, 0.55, (180, 180, 180), 1)
        cv2.putText(frame, "How to activate video:", (110, 260), cv2.FONT_HERSHEY_SIMPLEX, 0.55, (0, 215, 255), 1)
        cv2.putText(frame, "1. Connect USB Webcam to laptop/PC (Camera 0)", (130, 295), cv2.FONT_HERSHEY_SIMPLEX, 0.5, (220, 220, 220), 1)
        cv2.putText(frame, "2. Or use Phone as Webcam (DroidCam / IP Webcam)", (130, 325), cv2.FONT_HERSHEY_SIMPLEX, 0.5, (220, 220, 220), 1)
        cv2.putText(frame, "3. Or add RTSP / HTTP URL in Dashboard Camera Manager", (130, 355), cv2.FONT_HERSHEY_SIMPLEX, 0.5, (220, 220, 220), 1)

        # Live animated pulse indicator
        pulse = int(abs(np.sin(self._virtual_counter * 0.1)) * 155) + 100
        cv2.circle(frame, (605, 21), 6, (0, pulse, 0), -1)

        now_str = time.strftime("%Y-%m-%d %H:%M:%S")
        cv2.putText(frame, f"STREAM ONLINE: {now_str}", (390, 460), cv2.FONT_HERSHEY_SIMPLEX, 0.5, (160, 160, 160), 1)
        return frame

    def release(self) -> None:
        if self._capture is None:
            return

        try:
            if self._capture.isOpened():
                self._capture.release()
        except Exception as ex:
            raise RuntimeError(f"Failed to release camera '{self.camera_id}': {ex}") from ex
        finally:
            self._capture = None
