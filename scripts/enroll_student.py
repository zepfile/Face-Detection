"""
Enroll a student's face for AI Face Recognition Attendance System.
Can capture from live webcam or load from an image file.
"""
from __future__ import annotations

import argparse
import base64
import os
import sys
import time
from pathlib import Path

import cv2
import face_recognition
import numpy as np
import requests

# Locate directories
SCRIPT_DIR = Path(__file__).resolve().parent
PROJECT_DIR = SCRIPT_DIR.parent
AI_DIR = PROJECT_DIR / "ai-service"
MODELS_DIR = AI_DIR / "models"
ENCODINGS_FILE = MODELS_DIR / "encodings.pkl"

sys.path.insert(0, str(AI_DIR))
from services.face_recognizer import FaceRecognizer


def image_to_base64_data_url(image_bgr: np.ndarray) -> str:
    success, buffer = cv2.imencode(".jpg", image_bgr, [int(cv2.IMWRITE_JPEG_QUALITY), 92])
    if not success:
        raise ValueError("Failed to encode image to JPEG")
    b64 = base64.b64encode(buffer).decode("utf-8")
    return f"data:image/jpeg;base64,{b64}"


def capture_from_webcam(num_photos: int = 5) -> list[np.ndarray]:
    print("\n[+] Opening webcam (Camera 0)...")
    print("    - Look directly at camera for front view.")
    print("    - Slightly turn left/right for angle views.")
    print("    - Press SPACEBAR to capture each photo, or wait for auto-capture.")
    print("    - Press 'q' or ESC to cancel.\n")

    capture = cv2.VideoCapture(0, cv2.CAP_DSHOW if os.name == "nt" else cv2.CAP_ANY)
    if not capture.isOpened():
        capture = cv2.VideoCapture(0)
    if not capture.isOpened():
        raise RuntimeError("Unable to open webcam (Camera index 0). Please check your camera connection.")

    capture.set(cv2.CAP_PROP_FRAME_WIDTH, 640)
    capture.set(cv2.CAP_PROP_FRAME_HEIGHT, 480)

    # Face detector for helper preview
    cascade_path = cv2.data.haarcascades + "haarcascade_frontalface_default.xml"
    face_cascade = cv2.CascadeClassifier(cascade_path)

    captured_frames: list[np.ndarray] = []
    last_auto_capture_time = time.time()

    instructions = [
        "1/5: Look straight into camera",
        "2/5: Turn slightly LEFT (~30 deg)",
        "3/5: Turn slightly RIGHT (~30 deg)",
        "4/5: Chin slightly UP",
        "5/5: Chin slightly DOWN",
    ]

    try:
        while len(captured_frames) < num_photos:
            success, frame = capture.read()
            if not success or frame is None:
                time.sleep(0.05)
                continue

            display_frame = frame.copy()
            gray = cv2.cvtColor(frame, cv2.COLOR_BGR2GRAY)
            faces = face_cascade.detectMultiScale(gray, scaleFactor=1.15, minNeighbors=5, minSize=(80, 80))

            current_idx = len(captured_frames)
            prompt = instructions[current_idx] if current_idx < len(instructions) else f"Photo {current_idx + 1}/5"

            # Draw boxes around detected faces
            face_detected = len(faces) > 0
            for (x, y, w, h) in faces:
                cv2.rectangle(display_frame, (x, y), (x + w, y + h), (0, 255, 0), 2)

            # UI overlays
            cv2.rectangle(display_frame, (0, 0), (display_frame.shape[1], 45), (30, 30, 30), -1)
            cv2.putText(
                display_frame,
                f"[{prompt}] - Press SPACE to capture ({len(captured_frames)}/{num_photos})",
                (10, 28),
                cv2.FONT_HERSHEY_SIMPLEX,
                0.6,
                (0, 255, 255) if face_detected else (0, 165, 255),
                2,
            )

            cv2.imshow("Student Face Enrollment - Webcam", display_frame)
            key = cv2.waitKey(20) & 0xFF

            if key in (27, ord('q'), ord('Q')):
                print("[!] Enrollment cancelled by user.")
                return []

            # Capture on SPACE or automatically every 2.5 seconds if face is clear
            space_pressed = (key == 32)
            auto_ready = face_detected and (time.time() - last_auto_capture_time > 2.5)

            if space_pressed or auto_ready:
                captured_frames.append(frame.copy())
                last_auto_capture_time = time.time()
                print(f"  [x] Captured photo {len(captured_frames)}/{num_photos}!")

                # Quick visual feedback flash
                cv2.rectangle(display_frame, (0, 0), (display_frame.shape[1], display_frame.shape[0]), (255, 255, 255), 15)
                cv2.imshow("Student Face Enrollment - Webcam", display_frame)
                cv2.waitKey(100)
    finally:
        capture.release()
        cv2.destroyAllWindows()

    return captured_frames


def load_from_image_path(path_str: str) -> list[np.ndarray]:
    p = Path(path_str)
    if not p.exists():
        raise FileNotFoundError(f"Image not found at: {path_str}")

    img = cv2.imread(str(p))
    if img is None:
        raise ValueError(f"Could not decode image: {path_str}")

    # Return multiple crops or the single image
    return [img]


def enroll_student(student_id: int | str, frames: list[np.ndarray]) -> bool:
    student_id_str = str(student_id).strip()
    if not frames:
        print("[-] No frames captured. Enrollment aborted.")
        return False

    print(f"\n[+] Processing {len(frames)} photos for Student ID: {student_id_str}...")

    # Extract 128D face encodings
    valid_encodings = []
    base64_images = []

    for idx, frame in enumerate(frames):
        rgb = cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)
        locations = face_recognition.face_locations(rgb, model="hog")
        if not locations:
            # Fallback to Haar cascade location
            cascade = cv2.CascadeClassifier(cv2.data.haarcascades + "haarcascade_frontalface_default.xml")
            gray = cv2.cvtColor(frame, cv2.COLOR_BGR2GRAY)
            detected = cascade.detectMultiScale(gray, 1.15, 5, minSize=(60, 60))
            if len(detected) > 0:
                x, y, w, h = detected[0]
                locations = [(y, x + w, y + h, x)]

        if not locations:
            print(f"    [-] Photo {idx + 1}: No face detected, skipping.")
            continue

        encs = face_recognition.face_encodings(rgb, known_face_locations=locations, num_jitters=2, model="large")
        if encs:
            valid_encodings.append(encs[0])
            base64_images.append(image_to_base64_data_url(frame))
            print(f"    [+] Photo {idx + 1}: Generated 128D face vector successfully.")

    if not valid_encodings:
        print("[-] Could not generate face vectors from the photos. Please ensure good lighting and face visibility.")
        return False

    # 1. Save directly into ai-service models/encodings.pkl
    recognizer = FaceRecognizer(encodings_path=str(ENCODINGS_FILE))
    recognizer.save_encodings({student_id_str: valid_encodings}, admin_mode=True)
    print(f"\n[OK] Saved {len(valid_encodings)} face vector(s) for Student #{student_id_str} into '{ENCODINGS_FILE.name}'!")
    print(f"     Total enrolled students in AI model: {recognizer.known_students_count()}")

    # 2. Upload to Spring Boot Backend if running
    backend_url = os.getenv("BACKEND_URL", "http://localhost:8080")
    try:
        # First check backend health
        resp = requests.post(
            f"{backend_url}/api/students/{student_id_str}/enrollment-photos",
            json={"images": base64_images},
            headers={"Content-Type": "application/json", "X-API-Key": "change-this-to-a-long-random-ai-api-key"},
            timeout=5,
        )
        if resp.status_code in (200, 201):
            print(f"[OK] Synced {len(base64_images)} photos with Spring Boot backend database!")
        else:
            print(f"[i] Backend responded with status {resp.status_code} (Database sync optional).")
    except Exception as ex:
        print(f"[i] Backend not running on {backend_url} (Local model updated, ready to use).")

    # 3. Notify AI service live reload if running
    ai_stream_url = os.getenv("VITE_AI_STREAM_BASE_URL", "http://localhost:5000")
    try:
        requests.post(f"{ai_stream_url}/api/live/reload-encodings", timeout=3)
        print("[OK] Live AI microservice reloaded! Face recognition is NOW ACTIVE in real-time.")
    except Exception:
        pass

    return True


def main() -> None:
    print("=" * 60)
    print("   AI Face Attendance System - Student Face Enrollment")
    print("=" * 60)

    # Show existing students
    print("\nPre-configured Demo Students:")
    print("  1: Aarav Sharma   (10A001)")
    print("  2: Diya Patel      (10A002)")
    print("  3: Vivaan Singh    (10A003)")
    print("  4: Anaya Gupta     (10B001)")
    print("  5: Ishaan Verma    (10B002)")
    print("  6: Meera Nair      (10B003)")
    print("  7: Kabir Rao       (10C001)")
    print("  8: Sara Iyer       (10C002)")

    student_id_input = input("\nEnter Student ID to enroll [1-8 or any custom ID, default=1]: ").strip()
    student_id = student_id_input if student_id_input else "1"

    print("\nChoose Enrollment Mode:")
    print("  1. Live Webcam (Capture 5 photos with face angles)")
    print("  2. Image File (JPG/PNG from your computer)")
    mode = input("Select mode [1 or 2, default=1]: ").strip() or "1"

    if mode == "2":
        path_input = input("Enter path to image file: ").strip().strip('"')
        try:
            frames = load_from_image_path(path_input)
        except Exception as e:
            print(f"[-] Error loading image: {e}")
            return
    else:
        try:
            frames = capture_from_webcam(num_photos=5)
        except Exception as e:
            print(f"[-] Webcam error: {e}")
            return

    if not frames:
        return

    success = enroll_student(student_id, frames)
    if success:
        print("\n" + "=" * 60)
        print(f" SUCCESS! Student #{student_id} is now enrolled in Face Recognition!")
        print(" Whenever this person appears in the camera:")
        print(f"   -> AI will recognize them as ID: {student_id}")
        print("   -> Mark their attendance automatically in MySQL!")
        print("=" * 60)


if __name__ == "__main__":
    main()

