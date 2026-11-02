# Data Flow Diagram (DFD) - Level 0 (Context Diagram)

```mermaid
flowchart TD
    Admin["👨‍💼 Admin / Coordinator"] <-->|"Credentials / Student Management / Reports"| System["🌐 Smart Attendance System"]
    Camera["📷 Camera / AI Service"] -->|"Face Detected Attendance Events"| System
    System <-->|"Store & Query Data"| DB[("🗄️ MySQL Database")]
    System -->|"Email / SMS Alerts"| Guardians["👪 Parents / Guardians"]
```
