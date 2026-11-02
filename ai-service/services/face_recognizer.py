from __future__ import annotations

import base64
import logging
import pickle
from collections.abc import Sequence
from pathlib import Path
from typing import Dict, List, Tuple

import cv2
import face_recognition
import numpy as np

from utils.config import settings


RecognitionResult = Tuple[str, float]  # (student_id, confidence)
FaceLocation = Tuple[int, int, int, int]  # (top, right, bottom, left)
LOGGER = logging.getLogger(__name__)


class FaceRecognizer:
    def __init__(
        self,
        encodings_path: str | None = None,
        confidence_threshold: float | None = None,
    ) -> None:
        self.encodings_path = Path(encodings_path or settings.encodings_path)
        self.confidence_threshold = (
            confidence_threshold
            if confidence_threshold is not None
            else settings.confidence_threshold
        )

        self._encodings_map: Dict[str, List[np.ndarray]] = {}
        self._student_ids: List[str] = []
        self._known_encodings: List[np.ndarray] = []
        self._encoding_owner_ids: List[str] = []
        self.load_encodings()

    def load_encodings(self) -> None:
        self._encodings_map = {}

        if not self.encodings_path.exists():
            self._refresh_cache()
            return

        try:
            with self.encodings_path.open("rb") as file:
                data = pickle.load(file)
        except EOFError:
            LOGGER.warning("Encoding file is empty: %s", self.encodings_path)
            self._refresh_cache()
            return
        except Exception as ex:
            LOGGER.warning("Failed to load encodings from %s: %s", self.encodings_path, ex)
            self._refresh_cache()
            return

        if not isinstance(data, dict):
            LOGGER.warning("Invalid encoding file format at %s; expected dictionary", self.encodings_path)
            self._refresh_cache()
            return

        for student_id, encoding_or_group in data.items():
            normalized_group = self._normalize_encoding_group(encoding_or_group)
            if normalized_group:
                self._encodings_map[str(student_id)] = normalized_group

        self._refresh_cache()

    def recognize_faces(
        self,
        image: np.ndarray,
        face_locations: Sequence[FaceLocation],
    ) -> List[RecognitionResult]:
        if image is None:
            raise ValueError("image must not be None")
        if not face_locations:
            return []

        rgb_image = image[:, :, ::-1]
        try:
            unknown_encodings = face_recognition.face_encodings(
                rgb_image,
                known_face_locations=list(face_locations),
                num_jitters=settings.recognition_jitters,
                model=settings.face_encoding_model,
            )
        except Exception as ex:
            raise RuntimeError(f"Failed to generate face encodings: {ex}") from ex

        results: List[RecognitionResult] = []
        for unknown_encoding in unknown_encodings:
            if not self._known_encodings:
                results.append(("UNKNOWN", 0.0))
                continue

            distances = face_recognition.face_distance(self._known_encodings, unknown_encoding)
            best_index = int(np.argmin(distances))
            best_distance = float(distances[best_index])
            confidence = self._distance_to_confidence(best_distance)
            best_student_id = self._encoding_owner_ids[best_index]

            if best_distance <= self.confidence_threshold:
                student_id = best_student_id
            else:
                student_id = "UNKNOWN"

            results.append((student_id, confidence))

        return results

    def save_new_encoding(
        self,
        student_id: str,
        encoding: Sequence[float] | np.ndarray,
        admin_mode: bool = False,
    ) -> None:
        if not admin_mode:
            raise PermissionError("Saving new face encodings requires admin mode")
        if not student_id or not str(student_id).strip():
            raise ValueError("student_id is required")

        normalized = self._normalize_encoding(encoding)
        self._encodings_map[str(student_id).strip()] = [normalized]
        self._persist_encodings()
        self._refresh_cache()

    def save_encodings(
        self,
        encodings: Dict[str, Sequence[float] | np.ndarray],
        admin_mode: bool = False,
    ) -> None:
        if not admin_mode:
            raise PermissionError("Saving face encodings requires admin mode")
        if not isinstance(encodings, dict):
            raise ValueError("encodings must be a dictionary")

        for student_id, encoding in encodings.items():
            self._encodings_map[str(student_id)] = self._normalize_encoding_group(encoding)

        self._persist_encodings()
        self._refresh_cache()

    def known_students_count(self) -> int:
        return len(self._student_ids)

    def rebuild_from_data_urls(
        self,
        images_by_student: Dict[str, Sequence[str]],
        admin_mode: bool = False,
    ) -> int:
        if not admin_mode:
            raise PermissionError("Rebuilding face encodings requires admin mode")
        if not isinstance(images_by_student, dict):
            raise ValueError("images_by_student must be a dictionary")

        rebuilt: Dict[str, List[np.ndarray]] = {}

        for student_id, images in images_by_student.items():
            if not student_id or not isinstance(images, Sequence):
                continue

            face_vectors: List[np.ndarray] = []
            for image_data_url in images:
                image = self._decode_data_url_image(image_data_url)
                if image is None:
                    continue

                rgb_image = image[:, :, ::-1]
                try:
                    encodings = face_recognition.face_encodings(
                        rgb_image,
                        num_jitters=settings.recognition_jitters,
                        model=settings.face_encoding_model,
                    )
                except Exception:
                    continue

                if not encodings:
                    continue
                face_vectors.append(np.asarray(encodings[0], dtype=np.float64))

            if not face_vectors:
                continue

            rebuilt[str(student_id).strip()] = face_vectors

        if rebuilt:
            self.save_encodings(rebuilt, admin_mode=True)
        return len(rebuilt)

    def _persist_encodings(self) -> None:
        self.encodings_path.parent.mkdir(parents=True, exist_ok=True)
        serializable = {
            student_id: [encoding.tolist() for encoding in encodings]
            for student_id, encodings in self._encodings_map.items()
        }

        try:
            with self.encodings_path.open("wb") as file:
                pickle.dump(serializable, file)
        except Exception as ex:
            raise RuntimeError(f"Failed to save encodings to {self.encodings_path}: {ex}") from ex

    def _refresh_cache(self) -> None:
        self._student_ids = list(self._encodings_map.keys())
        self._known_encodings = []
        self._encoding_owner_ids = []
        for student_id, encodings in self._encodings_map.items():
            for encoding in encodings:
                self._known_encodings.append(encoding)
                self._encoding_owner_ids.append(student_id)

    def _normalize_encoding(self, encoding: Sequence[float] | np.ndarray) -> np.ndarray:
        if encoding is None:
            raise ValueError("encoding must not be None")

        arr = np.asarray(encoding, dtype=np.float64).reshape(-1)
        if arr.size != 128:
            raise ValueError("face encoding must contain exactly 128 values")
        return arr

    def _normalize_encoding_group(
        self,
        encoding_or_group: Sequence[float] | np.ndarray | Sequence[Sequence[float] | np.ndarray],
    ) -> List[np.ndarray]:
        if encoding_or_group is None:
            return []

        if isinstance(encoding_or_group, np.ndarray):
            arr = np.asarray(encoding_or_group, dtype=np.float64)
            if arr.ndim == 1:
                return [self._normalize_encoding(arr)]
            if arr.ndim == 2:
                return [self._normalize_encoding(item) for item in arr]

        try:
            items = list(encoding_or_group)
        except TypeError:
            return []

        if not items:
            return []

        first = items[0]
        if isinstance(first, (list, tuple, np.ndarray)):
            normalized: List[np.ndarray] = []
            for item in items:
                try:
                    normalized.append(self._normalize_encoding(item))
                except ValueError:
                    continue
            return normalized

        try:
            return [self._normalize_encoding(items)]
        except ValueError:
            return []

    def _distance_to_confidence(self, distance: float) -> float:
        confidence = 1.0 - distance
        return float(np.clip(confidence, 0.0, 1.0))

    def _decode_data_url_image(self, value: str) -> np.ndarray | None:
        if not value or not isinstance(value, str):
            return None

        normalized = value.strip()
        if not normalized.startswith("data:image/"):
            return None

        try:
            _meta, encoded = normalized.split(",", 1)
        except ValueError:
            return None

        try:
            raw = base64.b64decode(encoded, validate=True)
        except Exception:
            return None

        buffer = np.frombuffer(raw, dtype=np.uint8)
        if buffer.size == 0:
            return None

        image = cv2.imdecode(buffer, cv2.IMREAD_COLOR)
        return image
