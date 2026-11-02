@echo off
title Student Face Enrollment Tool
echo ========================================================
echo        AI Face Attendance - Student Enrollment
echo ========================================================

set SCRIPT_DIR=%~dp0
if exist "%SCRIPT_DIR%ai-service\.venv\Scripts\python.exe" (
    set PY_EXE="%SCRIPT_DIR%ai-service\.venv\Scripts\python.exe"
    set SCRIPT="%SCRIPT_DIR%scripts\enroll_student.py"
) else (
    set PY_EXE="%SCRIPT_DIR%face-detection\ai-service\.venv\Scripts\python.exe"
    set SCRIPT="%SCRIPT_DIR%face-detection\scripts\enroll_student.py"
)

%PY_EXE% %SCRIPT%

echo.
pause

