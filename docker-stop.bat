@echo off
echo ========================================================
echo   Stopping Docker Compose Containers
echo ========================================================
echo.

cd /d "%~dp0docker"
docker compose down

echo.
echo All Docker containers stopped and removed.
pause
