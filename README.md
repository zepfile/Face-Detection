# AI-Based Smart Attendance System using Spring Boot and Python Microservices

Face-recognition attendance platform with hardened authentication, security controls, analytics, live streaming, and offline AI sync.

## Final Architecture

This project follows a hybrid industry-style architecture:

- **Spring Boot backend** is the main system for APIs, database access, authentication, student management, attendance records, notifications (Email & SMS), and admin workflows.
- **Python AI service** is the ML microservice for camera ingestion, face detection, face recognition, live stream overlays, and offline sync.
- **React frontend** is the admin/coordinator dashboard for reports, students, live monitoring, and camera operations.
- Spring Boot and Python communicate over REST APIs, with the AI service posting recognized attendance back to the backend.

Detailed architecture notes: [docs/system-architecture.md](./docs/system-architecture.md)

## Tech Stack

- **Backend**: Spring Boot 3.3.5, Spring Security, JPA, MySQL 8.0/8.4, JWT, Jakarta Mail, Twilio SMS
- **AI Service**: Python 3.11, OpenCV, face_recognition, Flask (MJPEG/WebSocket), SQLite
- **Frontend**: React 18, TypeScript, Vite, Tailwind CSS, Lucide icons
- **Infra**: Docker Compose, Nginx

## Quick Start (Two Ways)

### Option 1: Native Windows Launch (Recommended for Quick Dev/Testing)
1. Double-click `run-all.bat` to start Backend (port 8080), AI Service (port 5000), and Frontend (port 5173).
2. To enroll new student faces, double-click `enroll-face.bat`.
3. To stop all running services cleanly, double-click `stop-all.bat`.

### Option 2: Docker Compose Launch
1. Ensure Docker Desktop is running.
2. Double-click `docker-start.bat` or run:
```bash
cd docker
docker compose up --build -d
```
3. To stop containers:
```bash
docker compose down
```

### URLs:
- **Frontend Dashboard**: `http://localhost:5173` (Local) / `http://localhost:3000` (Docker)
- **Spring Boot Backend**: `http://localhost:8080`
- **AI Live Camera Stream**: `http://localhost:5000/api/live/stream`

### Default Login:
- **Username**: `admin`
- **Password**: `Password123!`

---

## Folder Layout

```text
├── ai-service/          # Python microservice (OpenCV, face_recognition, Flask)
├── backend/             # Spring Boot 3.3.5 microservice (Security, JWT, JPA, APIs)
├── frontend/            # Vite + React + TypeScript web dashboard
├── database/            # MySQL schema & initial seed data
├── docker/              # Docker Compose configuration and container envs
├── docs/                # Comprehensive architecture and security documentation
├── hardware/            # Hardware integration documentation & configs
├── scripts/             # Python & shell utilities (enrollment, encoding sync)
├── run-all.bat          # 1-Click native runner
├── stop-all.bat         # 1-Click process terminator
├── enroll-face.bat      # Interactive face enrollment tool
├── docker-start.bat     # 1-Click Docker start script
├── docker-stop.bat      # 1-Click Docker stop script
└── README.md
```
