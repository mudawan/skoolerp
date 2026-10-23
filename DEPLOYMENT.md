# Skooler School Fee Management System - Production Deployment Guide

This system is built with a production-grade PostgreSQL database architecture:
- **PostgreSQL 16 (Authoritative Database)**: High-concurrency, ACID-compliant database with managed connection pooling, exponential retry backoff, row-level locking (`FOR UPDATE`), and active db-ping health probes.


---

## Option 1: 1-Click Production Deployment with Docker Compose (Recommended)

Requirements: Docker and Docker Compose installed.

In this setup, `REQUIRE_POSTGRES=true` is enabled by default with PostgreSQL 16 Alpine and an isolated data volume.

1. **Create your environment file and set a database password**:
   ```bash
   cp .env.example .env
   ```
   Edit `.env` and set `POSTGRES_PASSWORD` to a strong, unique value. This is required — `docker compose up` will refuse to start the `app` and `db` services if it's left blank.
2. **Start the application and PostgreSQL database**:
   ```bash
   docker compose up -d
   ```
3. **Verify running containers**:
   ```bash
   docker compose ps
   ```
4. **Verify Database Health & Connection Pool**:
   ```bash
   curl -s http://localhost:3000/api/health | jq .
   ```
   You will receive `"status": "ok"` (or `"degraded"` with HTTP 503 when the database cannot be reached). Detailed figures (latency, connection pool, database size, errors) are in the platform area, see "Platform owner area" below.

5. **Access the application**:
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
# This setup puts Nginx in front of the app (see Step 4 below), so set
# this to true — it tells Express to read the real client IP from the
# X-Forwarded-For header Nginx sets, rather than seeing every request as
# coming from Nginx's own local address. Without it, IP-based rate
# limiting effectively can't distinguish between users. Only set this
# when a reverse proxy you control is actually in front of the app —
# never on a directly internet-facing deployment.
Environment=TRUST_PROXY=true
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

The project includes an automated backup script at `./scripts/backup.sh` supporting PostgreSQL.

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

## First-Time Login / Account Setup

This is a production release with **no seeded demo accounts** — there is no default username/password. On first run:

1. Open `http://localhost:3000` (or your server's address) and choose **Create Institution / Register**.
2. This calls `POST /api/auth/register-institution`, which creates your institution and its first **Admin** account in one step — you set the username and password at that point.
3. Once logged in as Admin, invite additional operators (Accountant, Viewer, etc.) from **Settings → Users & Permissions**. Each invite generates a one-time code that the invited person uses at the **Join Institution** screen to set up their own account.

There is no way to log in before completing step 1 — attempting a login before any institution has been registered will correctly return "User not found."

## Platform owner area (app owner / support staff)

Schools never see server or database settings. Those belong to you, the app owner, and live in a separate area at
`/platform` with its own sign-in, its own sessions and its own accounts. A school account never works there and a
platform account never works on a school screen.

**Create the first platform admin** (on the server, in the app folder; needed once):
```bash
npm run platform:create-admin -- <username> "<Full Name>" owner
```
You are asked for a password (12 to 128 characters; typing is hidden). For scripted installs set `PLATFORM_ADMIN_PASSWORD`
instead. Then open `https://your-domain/platform`. More people can be added from **Platform admins** in that area.

| Role | Can do |
|---|---|
| Owner | Everything, including adding and managing platform admins |
| Support | Dashboards, school list, reset passwords, sign users out, deactivate and reactivate users, suspend and reactivate schools, read the audit log |
| Observer | Dashboards, school list, audit log (view only) |

What is there:
- **Overview, API health, Database, Errors**: dashboards. They keep 14 days of request and database figures, 30 days of error events and 180 days of size snapshots, and clean up after themselves.
- **Schools**: per-school users with *Reset password* (one-time password, shown once, valid 72 hours, must be replaced at next sign-in), *Sign out*, *Deactivate / Reactivate*, and *Suspend / Reactivate school*. A suspended school cannot sign in; nothing is deleted.
- **Audit log**: every platform action. The school's own audit trail also records that "Platform support" did it. Passwords are never recorded.

### Where the database connection is set

The connection is read-only reference information, set only in the server environment and never from a screen:
- Either `DATABASE_URL="postgres://USER:PASSWORD@HOST:5432/school_db"`, or `POSTGRES_HOST`, `POSTGRES_PORT`, `POSTGRES_USER`,
  `POSTGRES_PASSWORD`, `POSTGRES_DB`.
- Put it in the systemd unit (`Environment=...`), the Docker `.env`, or a `.env` file next to the app, then restart the app.
- The platform **Database** page shows host, port, database and user for checking. The password is never shown.

### Backups

Schedule `scripts/backup.sh` as shown in "Automated Daily Backups" above. It is a server-side job, so there is no setting for
it in the app. Schools can still export their own data and restore it from **Settings > Backups** in their own account.

---

## Upgrading an existing database (announced offline deploy)

New installs create the full schema on first start. An older database is brought up to date by running the SQL files in
`db/migrations/` once, in date order. The app does **not** run migrations by itself, and it will refuse to start (with a message naming the file
to run) when its schema is out of date, so a mismatch cannot cause confusing errors later.

Procedure for each upgrade:
1. **Announce** the maintenance window to the schools.
2. **Take the server offline**: `sudo systemctl stop skooler` (or `docker compose stop app`).
3. **Back up**: run `scripts/backup.sh` once more.
4. **Run the SQL** in DBeaver (or `psql`) as a script. Step 1 of each file only previews; step 2 applies the change in one transaction; step 3 checks the result. Every file is safe to run twice.
   - `db/migrations/2026-10-integrity.sql`: row versions, foreign keys, `vouchers.fine_since_payment`.
   - `db/migrations/2026-11-platform.sql`: forced password change, platform-locked accounts and school suspension columns. If a school is already marked `suspended` it will be refused at sign-in afterwards; reactivate it first if that is not intended.
5. **Recompile and deploy**: `npm install && npm run build`, then `sudo systemctl start skooler` (or `docker compose up -d --build`).
6. **Check**: open `/platform`, look at Overview and Database, and sign in to one school.

If a file has already been applied, step 1 shows nothing left to change and step 2 changes nothing.
