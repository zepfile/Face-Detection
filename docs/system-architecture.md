# System Architecture

## Project Title

AI-Based Smart Attendance System using Spring Boot and Python Microservices

## Architecture Overview

The system is split into three practical layers:

- Spring Boot backend: core business system
- Python AI service: face recognition microservice
- React frontend: admin and monitoring interface

The backend and AI layer communicate through REST APIs. This keeps attendance logic, security, and database operations in Java while leaving computer-vision and ML processing in Python.

## 1. Spring Boot Backend

### Main responsibilities

- Authentication and authorization
- Student management
- Enrollment-photo storage
- Attendance persistence
- Reports and analytics
- Admin and coordinator workflows
- AI ingestion and validation

### Important backend endpoints

- `POST /api/auth/login`
- `GET /api/students`
- `POST /api/attendance`
- `POST /api/attendance/ai`
- `GET /api/attendance/summary`
- `GET /api/ai/enrollment-photos`

## 2. Python AI Service

### Main responsibilities

- Read frames from USB, RTSP, or HTTP camera sources
- Detect faces with OpenCV pipeline
- Recognize faces from trained encodings
- Batch recognized student IDs
- Retry failed attendance delivery using offline storage
- Provide live stream and face-overlay endpoints

### Important AI endpoints

- `GET /health`
- `GET /api/live/cameras`
- `POST /api/live/cameras`
- `GET /api/live/stream`
- `GET /api/live/stream/{cameraKey}`
- `GET /api/live/faces/{cameraKey}`

## 3. Frontend

### Main responsibilities

- Admin dashboard
- Live camera monitoring
- Camera source management
- Student enrollment capture
- Attendance reporting

## Communication Flow

### Enrollment flow

1. Admin creates a student in the frontend.
2. Spring Boot stores student data and enrollment photos.
3. Python AI service calls backend sync APIs and rebuilds face encodings.

### Attendance flow

1. Camera stream is configured in the dashboard.
2. Python AI service reads frames from the configured camera.
3. Face detection and recognition run inside the AI service.
4. Recognized student IDs are sent to `POST /api/attendance/ai`.
5. Spring Boot stores attendance and pushes real-time updates to the dashboard.

## Why This Architecture Works Well

- Java handles enterprise APIs, security, and database consistency.
- Python handles AI/ML libraries more naturally.
- REST integration keeps both services loosely coupled.
- Multi-camera support stays isolated from the main business backend.
- The system can scale by upgrading AI service capacity without redesigning the backend.
