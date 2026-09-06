#!/bin/sh
# ==============================================================================
# Skooler School Fee Management System - Automated Backup Script
# Supports PostgreSQL (pg_dump) and SQLite databases
# ==============================================================================

set -e

TIMESTAMP=$(date +"%Y%m%d_%H%M%S")
BACKUP_DIR="${BACKUP_DIR:-./backups}"
RETENTION_DAYS="${RETENTION_DAYS:-30}"

mkdir -p "$BACKUP_DIR"

if [ -n "$DATABASE_URL" ] && echo "$DATABASE_URL" | grep -q "^postgres"; then
  echo "[BACKUP] Starting PostgreSQL database backup..."
  BACKUP_FILE="$BACKUP_DIR/postgres_backup_${TIMESTAMP}.sql.gz"
  pg_dump "$DATABASE_URL" | gzip > "$BACKUP_FILE"
  echo "[BACKUP] PostgreSQL backup created successfully at: $BACKUP_FILE"
else
  echo "[BACKUP] Starting SQLite database backup..."
  SQLITE_DB="./data/school_management.db"
  if [ -f "$SQLITE_DB" ]; then
    BACKUP_FILE="$BACKUP_DIR/sqlite_backup_${TIMESTAMP}.db.gz"
    gzip -c "$SQLITE_DB" > "$BACKUP_FILE"
    echo "[BACKUP] SQLite backup created successfully at: $BACKUP_FILE"
  else
    echo "[BACKUP] Warning: SQLite database file not found at $SQLITE_DB"
  fi
fi

# Clean up backups older than RETENTION_DAYS
echo "[BACKUP] Pruning backups older than $RETENTION_DAYS days..."
find "$BACKUP_DIR" -type f -name "*backup_*.gz" -mtime +"$RETENTION_DAYS" -exec rm -f {} \;
echo "[BACKUP] Backup maintenance complete."
