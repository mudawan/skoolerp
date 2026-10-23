@echo off
cd /d "%~dp0"

if not exist "logs" mkdir logs

REM COOKIE_SECURE=false is for pure HTTP on the LAN. Switch to true if put HTTPS in front (Cloudflare Tunnel, etc.)
set COOKIE_SECURE=false

set NODE_ENV=production
set POSTGRES_HOST=127.0.0.1
set POSTGRES_PORT=5432
set POSTGRES_USER=postgres
set POSTGRES_PASSWORD=postgrespassword
set POSTGRES_DB=school_db
set DATABASE_URL=postgres://postgres:postgrespassword@127.0.0.1:5432/school_db
set DB_POOL_MAX=15
set DB_POOL_MIN=2
set TRUST_PROXY=false

REM keep one of the following two lines. first for outputs in terminal, second for outputs to server log file
REM node dist\server.cjs
node dist\server.cjs >> logs\server.log 2>&1
