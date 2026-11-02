# System Architecture Diagram

```mermaid
flowchart TD
    Camera["📷 Camera Layer\n(Webcam / RTSP / Video)"] -->|"Video Frames"| AI["🧠 Python AI Service\n(OpenCV + face_recognition + Flask)"]
    AI -->|"POST /api/attendance/ai\n(Recognized Attendances)"| Backend["⚙️ Spring Boot Backend\n(REST API + Security + JPA)"]
    Backend <-->|"Read/Write"| DB[("🗄️ MySQL Database\n(Users, Students, Attendance)")]
    Backend <-->|"REST API / WebSocket"| Frontend["💻 React Frontend Dashboard\n(Vite + TypeScript + Tailwind)"]
    AI -->|"Live MJPEG Stream\n(/api/live/stream)"| Frontend
```

### Component Details
1. **Camera Layer**: Ingests video from local webcam, IP camera (RTSP), or test video files.
2. **AI Service (Python 3.11)**: Detects human faces using HOG/Haar, extracts 128-d encodings, matches against enrolled student database, buffers offline events if disconnected.
3. **Backend API (Spring Boot 3.3.5)**: Handles authentication (JWT cookies), student enrollment photos, attendance persistence, rate limiting, and guardian notifications (Email & SMS).
4. **Database (MySQL 8)**: Persistent storage for users, roles, students, and timestamps.
5. **Frontend (React 18)**: Coordinator and Admin dashboard for real-time monitoring and reporting.
