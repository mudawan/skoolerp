# Skooler School Fee Management System - Production Deployment Guide

This system is built with a production-grade database architecture:
1. **PostgreSQL 16 (Production Default & Enforced)**: High-concurrency, ACID-compliant database with managed connection pooling, exponential retry backoff, and active db-ping health probes. When `REQUIRE_POSTGRES=true`, the app strictly enforces PostgreSQL and fails loudly if unreachable.
2. **Embedded SQLite (Local Dev Fallback)**: Zero-setup, single-file relational database strictly intended for development when `REQUIRE_POSTGRES=false` and `DATABASE_URL` is omitted.

---

## Option 1: 1-Click Production Deployment with Docker Compose (Recommended)

Requirements: Docker and Docker Compose installed.

In this setup, `REQUIRE_POSTGRES=true` is enabled by default with PostgreSQL 16 Alpine and an isolated data volume.

1. **Start the application and PostgreSQL database**:
   ```bash
   docker compose up -d
   ```
2. **Verify running containers**:
   ```bash
   docker compose ps
   ```
3. **Verify Database Health & Connection Pool**:
   ```bash
   curl -s http://localhost:3000/api/health | jq .
   ```
   You will receive the PostgreSQL engine confirmation, latency probe (`database.latencyMs`), and connection pool metrics (`database.pool`).

4. **Access the application**:
   Open `http://localhost:3000` (or `http://YOUR_SERVER_IP:3000`).

### Docker Management Commands:
- View live application logs:
  ```bash
  docker compose logs -f app
  ```
- Restart services:
  ```bash
  docker compose restart
  ```
- Stop services:
  ```bash
  docker compose down
  ```
- Database data is preserved permanently in the Docker volume named `postgres_data`.

---

## Option 2: Production VPS Deployment (Ubuntu / Debian + Nginx + Free SSL)

### Step 1: Install Node.js & Nginx
```bash
sudo apt update && sudo apt upgrade -y
curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash -
sudo apt install -y nodejs nginx git
```

### Step 2: Deploy Application Code
```bash
git clone <YOUR_REPOSITORY_URL> /var/www/skooler
cd /var/www/skooler
npm install
npm run build
```

### Step 3: Run as a Background System Service (systemd)
Create a systemd service file:
```bash
sudo nano /etc/systemd/system/skooler.service
```
Paste the following:
```ini
[Unit]
Description=Skooler School Fee Management Application
After=network.target

[Service]
Type=simple
User=root
WorkingDirectory=/var/www/skooler
ExecStart=/usr/bin/npm start
Restart=on-failure
Environment=PORT=3000
Environment=NODE_ENV=production
# Uncomment if using external PostgreSQL:
# Environment=DATABASE_URL="postgres://postgres:password@localhost:5432/school_db"

[Install]
WantedBy=multi-user.target
```
Enable and start the service:
```bash
sudo systemctl daemon-reload
sudo systemctl enable skooler
sudo systemctl start skooler
```

### Step 4: Configure Nginx & SSL Certificate
1. Copy the provided `nginx.conf`:
   ```bash
   sudo cp /var/www/skooler/nginx.conf /etc/nginx/sites-available/skooler
   sudo ln -s /etc/nginx/sites-available/skooler /etc/nginx/sites-enabled/
   sudo rm -f /etc/nginx/sites-enabled/default
   sudo nginx -t && sudo systemctl reload nginx
   ```
2. Secure with free SSL certificate via Let's Encrypt:
   ```bash
   sudo apt install -y certbot python3-certbot-nginx
   sudo certbot --nginx -d school.yourdomain.com
   ```

---

## Automated Daily Backups

The project includes an automated backup script at `./scripts/backup.sh` supporting both PostgreSQL and SQLite.

To schedule a daily backup at 2:00 AM:
```bash
crontab -e
```
Add the following line:
```cron
0 2 * * * /var/www/skooler/scripts/backup.sh >> /var/log/skooler_backup.log 2>&1
```
Backups are saved to `./backups/` with automated 30-day rotation.

---

## Default Login Credentials

- **Role**: Accountant / Fee Collection Officer
- **Username**: `accountant`
- **Password**: `admin123`
