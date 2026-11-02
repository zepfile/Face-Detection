@echo off
title Smart Attendance System - Stopper
echo Stopping all Face Attendance System services...

powershell -NoProfile -ExecutionPolicy Bypass -Command ^
  "$ports = @(8080, 5000, 5173); foreach ($port in $ports) { $c = Get-NetTCPConnection -LocalPort $port -ErrorAction SilentlyContinue; if ($c) { $pids = $c.OwningProcess | Select-Object -Unique; foreach ($p in $pids) { try { Stop-Process -Id $p -Force -ErrorAction SilentlyContinue; Write-Host ('Killed port ' + $port + ' (PID: ' + $p + ')') } catch {} } } }"

echo.
echo All services have been stopped.
pause

