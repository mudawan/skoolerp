@echo off
cd /d "%~dp0"
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
node dist\server.cjs