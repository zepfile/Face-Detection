@echo off
title Smart Attendance System - Launcher
echo ========================================================
echo        Starting Face Attendance System Services
echo ========================================================

set SCRIPT_DIR=%~dp0
if exist "%SCRIPT_DIR%backend" (
    set BASE_DIR=%SCRIPT_DIR%
) else (
    set BASE_DIR=%SCRIPT_DIR%face-detection
)

echo [1/3] Starting Spring Boot Backend (Port 8080)...
start "Backend - Spring Boot" cmd /k "cd /d "%BASE_DIR%\backend" && .\mvnw.cmd spring-boot:run"

echo Waiting for backend initialization...
timeout /t 6 /nobreak >nul

echo [2/3] Starting Python AI Microservice (Port 5000)...
start "AI Service - Python" cmd /k "cd /d "%BASE_DIR%\ai-service" && .\.venv\Scripts\python.exe main.py"

echo [3/3] Starting React Vite Frontend (Port 5173)...
start "Frontend - React Vite" cmd /k "cd /d "%BASE_DIR%\frontend" && npm run dev"

timeout /t 3 /nobreak >nul

echo.
echo ========================================================
echo  All services started!
echo    - Frontend Dashboard: http://localhost:5173
echo    - Backend API:        http://localhost:8080
echo    - AI Camera Stream:   http://localhost:5000/api/live/stream
echo.
echo  Default Login:
echo    Username: admin
echo    Password: Password123!
echo ========================================================

start http://localhost:5173
pause

