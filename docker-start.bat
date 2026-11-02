@echo off
echo ========================================================
echo   Starting College Face Attendance via Docker Compose
echo ========================================================
echo.

docker info >nul 2>&1
if %ERRORLEVEL% neq 0 (
    echo [ERROR] Docker Desktop is not running!
    echo Please launch Docker Desktop, wait until it starts, and run this script again.
    echo.
    pause
    exit /b 1
)

cd /d "%~dp0docker"
echo Building and starting containers (mysql, backend, ai-service, frontend)...
docker compose up --build -d

echo.
echo ========================================================
echo   All Docker containers are running!
echo   - Web App (Frontend) : http://localhost:3000
echo   - Spring Boot Backend: http://localhost:8080
echo   - AI Live Stream     : http://localhost:5000
echo ========================================================
echo.
pause
