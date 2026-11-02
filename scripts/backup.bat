@echo off
setlocal
cd /d "%~dp0.."

REM Adjust to your PostgreSQL install folder (contains pg_dump.exe)
set PGBIN=C:\Program Files\PostgreSQL\18\bin
set BACKUP_DIR=%~dp0..\backups
set RETENTION_DAYS=30

if not exist "%BACKUP_DIR%" mkdir "%BACKUP_DIR%"

REM Timestamp like 20261102_020000 (independent of regional date format)
for /f %%i in ('powershell -NoProfile -Command "Get-Date -Format yyyyMMdd_HHmmss"') do set TS=%%i

set PGPASSWORD=postgrespassword
"%PGBIN%\pg_dump.exe" -h 127.0.0.1 -p 5432 -U postgres -F c -f "%BACKUP_DIR%\postgres_backup_%TS%.dump" school_db
if errorlevel 1 (
  echo [BACKUP] FAILED >> "%BACKUP_DIR%\backup.log"
  exit /b 1
)
echo [BACKUP] %TS% ok >> "%BACKUP_DIR%\backup.log"

REM Delete backups older than RETENTION_DAYS
forfiles /p "%BACKUP_DIR%" /m "postgres_backup_*.dump" /d -%RETENTION_DAYS% /c "cmd /c del @path" 2>nul
exit /b 0