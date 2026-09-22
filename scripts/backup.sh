#!/bin/sh
# ==============================================================================
# Skooler School Fee Management System - Automated Backup Script
# Supports PostgreSQL (pg_dump)
# ==============================================================================

set -e

TIMESTAMP=$(date +"%Y%m%d_%H%M%S")
BACKUP_DIR="${BACKUP_DIR:-./backups}"
RETENTION_DAYS="${RETENTION_DAYS:-30}"

mkdir -p "$BACKUP_DIR"

DB_CONN="${DATABASE_URL:-postgres://${POSTGRES_USER:-postgres}:${POSTGRES_PASSWORD}@${POSTGRES_HOST:-127.0.0.1}:${POSTGRES_PORT:-5432}/${POSTGRES_DB:-school_db}}"

echo "[BACKUP] Starting PostgreSQL database backup..."
BACKUP_FILE="$BACKUP_DIR/postgres_backup_${TIMESTAMP}.sql.gz"
pg_dump "$DB_CONN" | gzip > "$BACKUP_FILE"
echo "[BACKUP] PostgreSQL backup created successfully at: $BACKUP_FILE"

# Clean up backups older than RETENTION_DAYS
echo "[BACKUP] Pruning backups older than $RETENTION_DAYS days..."
find "$BACKUP_DIR" -type f -name "*backup_*.gz" -mtime +"$RETENTION_DAYS" -exec rm -f {} \;
echo "[BACKUP] Backup maintenance complete."
