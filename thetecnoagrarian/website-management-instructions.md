# 02_Website_Management_Instructions

This document defines how to manage **FruitionForestGarden**, **Tecnoagrarian**, and **Blog-Template (demo)** across local and live environments.  
It is intended for both human developers and automated tools (Cursor, CI/CD).

---

## 🔧 Repository Structure

- **fruitionforestgarden/** → repo for FruitionForestGarden.com (GitHub: `fruitionforestgarden`)
- **thetecnoagrarian/** → repo for Tecnoagrarian.com (GitHub: `thetecnoagrarian`)  
- **blog-template/** → canonical open-source template, deployed as `demo.thetecnoagrarian.com` (GitHub: `thetecnoagrarian`)

Each repo has:
- Its own `.env` file  
- Its own SQLite database (never shared)  
- Its own PM2 process on the server  

~/Sites/
fruitionforestgarden/
thetecnoagrarian/
blog-template/

---

## 📂 Local Development Rules

- Run each app on a **different port** (e.g., 3001, 3002, 3003).
- **Never** commit SQLite files, `.env`, or backups.
- `.gitignore` must include:

*.sqlite
.sqlite-shm
.sqlite-wal
/data/
.env
/backups/

- Keep demo seed DB at `blog-template/_seed/demo.seed.sqlite` (git-ignored).

---

## 🚀 Deployment Workflow

**Code path:**  
Local → GitHub → Live server (`git pull --ff-only`)

**GitHub Accounts:**
- `fruitionforestgarden/` → `fruitionforestgarden` GitHub account
- `thetecnoagrarian/` → `thetecnoagrarian` GitHub account  
- `blog-template/` → `thetecnoagrarian` GitHub account

**DB path:**  
- Never overwrite production DB from local.  
- Prod DBs live only on server (`/var/lib/<site>/<site>.sqlite`).  
- Weekly auto-backups protect against loss.

**Nginx sites:**  
- `fruitionforestgarden.com` → `/var/www/fruitionforestgarden/current`  
- `thetecnoagrarian.com` → `/var/www/thetecnoagrarian/current`  
- `demo.thetecnoagrarian.com` → `/var/www/demo-template/current`

**PM2 process names:**  
- `ffg`, `ta`, `demo`

---

## 🌱 Database Strategy

- **FFG:** Use existing live DB. Sync schema only, never overwrite content.  
- **TA:** Start with a **clean DB** (empty schema, no posts).  
- **Demo:** Auto-resets to seed DB daily at 3:11am.  

Environment variable for role enforcement:

APP_ROLE=production | demo

Guardrails:
- `APP_ROLE=production` → destructive admin actions (bulk delete, reset) are blocked.  
- `APP_ROLE=demo` → reset is allowed.

---

## ⏱ Demo Reset Script (server)

`/usr/local/bin/reset-demo.sh`
```bash
#!/usr/bin/env bash
set -euo pipefail

SEED="/var/www/demo-template/_seed/demo.seed.sqlite"
LIVE="/var/lib/demo/demo.sqlite"
APP_NAME="demo"

pm2 stop "$APP_NAME"
ts=$(date +"%Y%m%d-%H%M%S")
mkdir -p /backups/demo
sqlite3 "$LIVE" ".backup '/backups/demo/demo-$ts.sqlite'"

cp -f "$SEED" "$LIVE"
chown <appuser>:<appuser> "$LIVE"

pm2 start "$APP_NAME"

Cron job:

11 3 * * * /usr/local/bin/reset-demo.sh >/var/log/reset-demo.log 2>&1


⸻

💾 Weekly Backup Script

/usr/local/bin/weekly-backup.sh

#!/usr/bin/env bash
set -euo pipefail

NOW=$(date +"%Y%m%d-%H%M%S")
DEST="/backups"
mkdir -p "$DEST"/{ffg,ta,demo}

backup_sqlite () {
  local name="$1" path="$2"
  sqlite3 "$path" ".backup '$DEST/$name/${name}-${NOW}.sqlite'"
}

backup_sqlite "ffg"  "/var/lib/ffg/ffg.sqlite"
backup_sqlite "ta"   "/var/lib/ta/ta.sqlite"
backup_sqlite "demo" "/var/lib/demo/demo.sqlite"

for site in ffg ta demo; do
  ls -1t "$DEST/$site"/*.sqlite | tail -n +9 | xargs -r rm -f
done

Cron job:

7 2 * * 0 /usr/local/bin/weekly-backup.sh >/var/log/weekly-backup.log 2>&1

Optional: sync /backups off-box via rclone.

⸻

⚙️ .env Example

NODE_ENV=production
APP_ROLE=production   # or demo
PORT=300x
DATABASE_URL=/var/lib/<site>/<site>.sqlite
SESSION_SECRET=changeme
BASE_URL=https://<domain>
ADMIN_EMAIL=you@example.com


⸻

📜 Rules Summary
	1.	Code flows via Git.
	2.	Databases never overwritten from local.
	3.	Weekly auto-backups with rotation (keep last 8).
	4.	Demo DB auto-resets nightly.
	5.	Each site isolated by folder, DB, .env, and PM2 process.
	6.	Use APP_ROLE to protect production data.

⸻

🔮 Next Steps
	•	Add GitHub Action to auto-deploy (git pull && pm2 restart).
	•	Add monthly VACUUM maintenance job for SQLite.
	•	Optionally migrate to Docker later for clean isolation.

⸻


---

