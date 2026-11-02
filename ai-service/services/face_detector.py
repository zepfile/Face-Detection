from __future__ import annotations

from pathlib import Path
from typing import List, Tuple

import cv2
import face_recognition
import numpy as np

from utils.config import settings


FaceLocation = Tuple[int, int, int, int]  # (top, right, bottom, left)


class FaceDetector:
    def __init__(
        self,
        detector_type: str = "hybrid",
        confidence_threshold: float = 0.5,
        dnn_prototxt: str | None = None,
        dnn_model: str | None = None,
    ) -> None:
        self.detector_type = detector_type.strip().lower()
        self.confidence_threshold = confidence_threshold
        self._haar_detector: cv2.CascadeClassifier | None = None
        self._profile_haar_detector: cv2.CascadeClassifier | None = None
        self._dnn_net: cv2.dnn.Net | None = None

        if self.detector_type in {"haar", "hybrid"}:
            self._init_haar()
        elif self.detector_type == "dnn":
            self._init_dnn(dnn_prototxt, dnn_model)
        elif self.detector_type == "hog":
            return
        else:
            raise ValueError("detector_type must be 'hybrid', 'haar', 'hog' or 'dnn'")

    def detect_faces(self, image: np.ndarray) -> List[FaceLocation]:
        if image is None:
            raise ValueError("image must not be None")

        if self.detector_type == "hybrid":
            return self._detect_hybrid(image)
        if self.detector_type == "haar":
            return self._detect_with_haar(image)
        if self.detector_type == "hog":
            return self._detect_with_hog(image)

        return self._detect_with_dnn(image)

    def _init_haar(self) -> None:
        frontal_path = Path(cv2.data.haarcascades) / "haarcascade_frontalface_default.xml"
        profile_path = Path(cv2.data.haarcascades) / "haarcascade_profileface.xml"

        frontal = cv2.CascadeClassifier(str(frontal_path))
        if frontal.empty():
            raise RuntimeError(f"Failed to load Haar cascade: {frontal_path}")

        profile = cv2.CascadeClassifier(str(profile_path))
        if profile.empty():
            raise RuntimeError(f"Failed to load Haar cascade: {profile_path}")

        self._haar_detector = frontal
        self._profile_haar_detector = profile

    def _init_dnn(self, prototxt_path: str | None, model_path: str | None) -> None:
        if not prototxt_path or not model_path:
            raise ValueError("dnn_prototxt and dnn_model are required for detector_type='dnn'")

        prototxt = Path(prototxt_path)
        model = Path(model_path)
        if not prototxt.exists():
            raise FileNotFoundError(f"DNN prototxt not found: {prototxt}")
        if not model.exists():
            raise FileNotFoundError(f"DNN model not found: {model}")

        self._dnn_net = cv2.dnn.readNetFromCaffe(str(prototxt), str(model))

    def _detect_with_haar(self, image: np.ndarray) -> List[FaceLocation]:
        if self._haar_detector is None:
            raise RuntimeError("Haar detector is not initialized")
        if self._profile_haar_detector is None:
            raise RuntimeError("Profile Haar detector is not initialized")

        gray = cv2.cvtColor(image, cv2.COLOR_BGR2GRAY)
        frontal = self._haar_detector.detectMultiScale(
            gray,
            scaleFactor=1.1,
            minNeighbors=5,
            minSize=(30, 30),
        )
        profile = self._detect_profile_faces(gray)
        locations = [self._xywh_to_location(x, y, w, h) for (x, y, w, h) in frontal]
        locations.extend(profile)
        return self._deduplicate_locations(locations)

    def _detect_with_hog(self, image: np.ndarray) -> List[FaceLocation]:
        rgb_image = image[:, :, ::-1]
        try:
            return list(face_recognition.face_locations(rgb_image, model="hog"))
        except Exception as ex:
            raise RuntimeError(f"HOG face detection failed: {ex}") from ex

    def _detect_hybrid(self, image: np.ndarray) -> List[FaceLocation]:
        locations: List[FaceLocation] = []

        try:
            locations.extend(self._detect_with_hog(image))
        except Exception:
            pass

        try:
            locations.extend(self._detect_with_haar(image))
        except Exception:
            pass

        return self._deduplicate_locations(locations)

    def _detect_with_dnn(self, image: np.ndarray) -> List[FaceLocation]:
        if self._dnn_net is None:
            raise RuntimeError("DNN detector is not initialized")

        height, width = image.shape[:2]
        blob = cv2.dnn.blobFromImage(
            cv2.resize(image, (300, 300)),
            1.0,
            (300, 300),
            (104.0, 177.0, 123.0),
        )
        self._dnn_net.setInput(blob)
        detections = self._dnn_net.forward()

        locations: List[FaceLocation] = []
        for i in range(detections.shape[2]):
            confidence = float(detections[0, 0, i, 2])
            if confidence < self.confidence_threshold:
                continue

            box = detections[0, 0, i, 3:7] * np.array([width, height, width, height])
            start_x, start_y, end_x, end_y = box.astype("int")

            start_x = max(0, start_x)
            start_y = max(0, start_y)
            end_x = min(width, end_x)
            end_y = min(height, end_y)

            locations.append((start_y, end_x, end_y, start_x))

        return locations

    def _detect_profile_faces(self, gray: np.ndarray) -> List[FaceLocation]:
        if self._profile_haar_detector is None:
            return []

        detections = self._profile_haar_detector.detectMultiScale(
            gray,
            scaleFactor=1.1,
            minNeighbors=4,
            minSize=(30, 30),
        )

        flipped = cv2.flip(gray, 1)
        mirrored_detections = self._profile_haar_detector.detectMultiScale(
            flipped,
            scaleFactor=1.1,
            minNeighbors=4,
            minSize=(30, 30),
        )

        width = gray.shape[1]
        locations = [self._xywh_to_location(x, y, w, h) for (x, y, w, h) in detections]
        for (x, y, w, h) in mirrored_detections:
            mirrored_left = max(0, width - x - w)
            locations.append(self._xywh_to_location(mirrored_left, y, w, h))
        return locations

    def _deduplicate_locations(self, locations: List[FaceLocation]) -> List[FaceLocation]:
        deduplicated: List[FaceLocation] = []
        for candidate in sorted(locations, key=self._location_area, reverse=True):
            if self._location_area(candidate) <= 0:
                continue
            if any(self._iou(candidate, existing) >= settings.detector_confidence_threshold for existing in deduplicated):
                continue
            deduplicated.append(candidate)
        return deduplicated

    def _location_area(self, location: FaceLocation) -> int:
        top, right, bottom, left = location
        return max(0, bottom - top) * max(0, right - left)

    def _iou(self, first: FaceLocation, second: FaceLocation) -> float:
        top = max(first[0], second[0])
        right = min(first[1], second[1])
        bottom = min(first[2], second[2])
        left = max(first[3], second[3])

        intersection = max(0, bottom - top) * max(0, right - left)
        if intersection <= 0:
            return 0.0

        union = self._location_area(first) + self._location_area(second) - intersection
        if union <= 0:
            return 0.0
        return intersection / float(union)

    def _xywh_to_location(self, x: int, y: int, w: int, h: int) -> FaceLocation:
        top = y
        left = x
        bottom = y + h
        right = x + w
        return (top, right, bottom, left)
