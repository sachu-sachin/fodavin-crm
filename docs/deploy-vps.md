# Running on the VPS

Since 2026-10-11 the CRM runs on a Hostinger VPS (Ubuntu 24.04) and its
database is the Supabase project in **Mumbai (`ap-south-1`)**, about 11 ms
away. Vercel is no longer used. The server only runs the Next.js app; all
data (accounts, clients, projects, uploaded files) lives in Supabase.

> **The VPS is shared** with other live sites (their own Nginx sites, pm2
> apps and MySQL). Only touch the `fodavin-crm` pieces listed here.

| Piece | Where |
|---|---|
| App user | `fodavin` (system user, no login shell) |
| Live code | `/srv/fodavin-crm/app` |
| Previous release (for rollback) | `/srv/fodavin-crm/app.prev` |
| Secrets | `/srv/fodavin-crm/app/.env.local`, mode 600, owner `fodavin` |
| Service | `fodavin-crm` (systemd), listens on `127.0.0.1:3010` only |
| Public entry | Nginx site `fodavin-crm`, port **8090** → `http://<server-ip>:8090` |
| Database backups taken before changes | `/root/fodavin-backups/` (root only) |

## 1. Server basics (one time)

- Node.js **20.9 or newer** (Next.js 16's minimum). The server's system Node
  is shared with the other apps, so don't upgrade it globally without
  checking them; if you need a newer one, point the service at a separate
  Node install.
- `nginx`, `ufw` and the PostgreSQL 17 client (for backups):
  ```bash
  sudo apt install -y postgresql-common
  sudo /usr/share/postgresql-common/pgdg/apt.postgresql.org.sh -y
  sudo apt install -y postgresql-client-17
  ```
- Firewall: allow the app's public port on the server **and** in Hostinger's
  panel if a firewall configuration is active there.
  ```bash
  sudo ufw allow 8090/tcp comment 'fodavin-crm'
  ```
  > **Hostinger panel firewall:** activating a configuration blocks every port
  > that isn't listed in it. Before activating one, make sure it allows
  > **22, 80, 443 and 8090** (and anything else the other apps use), or all the
  > other sites and SSH go down at once.

## 2. Secrets

`/srv/fodavin-crm/app/.env.local` holds the production values (copy over SSH,
never email or chat). Two things differ from a local setup:

- `APP_URL` is the public address, e.g. `http://<server-ip>:8090`, no trailing
  slash.
- `DATABASE_URL` uses the **session pooler** (port 5432, same host as
  `DIRECT_URL`) with `?connection_limit=5` appended. The transaction pooler
  (6543, `pgbouncer=true`) is meant for serverless hosts that open a new
  connection per request; on a long-running server it costs several extra
  round trips per query (measured ~5x slower).

Every `npm run db:*` script loads `.env.local`, so on the server (and on any
machine whose `.env.local` holds production values) **each of them writes to
the live database**.

## 3. The service

`/etc/systemd/system/fodavin-crm.service`:

```ini
[Unit]
Description=Fodavin CRM (Next.js)
After=network.target

[Service]
Type=simple
User=fodavin
Group=fodavin
WorkingDirectory=/srv/fodavin-crm/app
Environment=NODE_ENV=production
Environment=NEXT_TELEMETRY_DISABLED=1
ExecStart=/usr/bin/node node_modules/next/dist/bin/next start -H 127.0.0.1 -p 3010
Restart=on-failure
RestartSec=5
NoNewPrivileges=true
PrivateTmp=true
ProtectSystem=full
ProtectHome=true

[Install]
WantedBy=multi-user.target
```

```bash
sudo systemctl daemon-reload
sudo systemctl enable --now fodavin-crm
journalctl -u fodavin-crm -f        # logs
```

## 4. Nginx

`/etc/nginx/sites-available/fodavin-crm` (linked into `sites-enabled`):

```nginx
# Only send "Connection: upgrade" when the client actually asks for one.
map $http_upgrade $fodavin_connection_upgrade {
    default upgrade;
    ''      close;
}

server {
    listen 8090;
    listen [::]:8090;
    server_name _;

    # Document uploads go up to 10 MB; Nginx's default is 1 MB.
    client_max_body_size 12m;

    location / {
        proxy_pass http://127.0.0.1:3010;
        proxy_http_version 1.1;
        # REQUIRED: Next.js rejects form submissions (Server Actions) whose
        # Origin doesn't match the host. $http_host keeps the ":8090" port;
        # $host would drop it and every save would fail.
        proxy_set_header Host $http_host;
        proxy_set_header X-Forwarded-Host $http_host;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection $fodavin_connection_upgrade;
        proxy_read_timeout 120s;
    }
}
```

Always check before reloading, since the other sites share this Nginx:

```bash
sudo nginx -t && sudo systemctl reload nginx
```

## 5. Deploying an update

Build the new version **beside** the live one and switch over, so the site
keeps running during the build (building in place would break the running
server while `.next` and `node_modules` are replaced) and the old version is
one move away.

1. **Back up the database** (keeps accounts and app data; leaves out session
   tokens):
   ```bash
   sudo install -d -m 700 /root/fodavin-backups
   pg_dump "$DIRECT_URL" --format=custom --no-owner --no-privileges \
     --schema=public --schema=auth \
     --exclude-table-data='auth.sessions' --exclude-table-data='auth.refresh_tokens' \
     --exclude-table-data='auth.mfa_amr_claims' --exclude-table-data='auth.one_time_tokens' \
     --exclude-table-data='auth.flow_state' --exclude-table-data='auth.audit_log_entries' \
     --exclude-table-data='auth.schema_migrations' \
     -f /root/fodavin-backups/pre-deploy-$(date -u +%Y%m%dT%H%MZ).dump
   ```
2. **Build in `/srv/fodavin-crm/next`**: unpack the release there (e.g. a
   `git archive` of the branch), copy `.env.local` from `app/`, then as
   `fodavin`: `npm ci` and `npm run build`. The build doesn't touch the
   database.
3. **Schema changes, if any**, from the new folder: `npx dotenv -e .env.local
   -- npx prisma db push --skip-generate`, then re-run `supabase/setup.sql`
   (`psql "$DIRECT_URL" -v ON_ERROR_STOP=1 -f supabase/setup.sql`). Only
   additive changes — new tables, new nullable columns — so the running
   version keeps working. `db push` stops by itself if a change would lose
   data.
4. **New permissions, if any**: add them to the template roles with a script
   that only adds. **Don't run `db:seed` here** — it overwrites the template
   roles' permissions and undoes changes made on the Roles page.
5. **Switch** (a few seconds of downtime):
   ```bash
   sudo systemctl stop fodavin-crm
   sudo rm -rf /srv/fodavin-crm/app.prev
   sudo mv /srv/fodavin-crm/app /srv/fodavin-crm/app.prev
   sudo mv /srv/fodavin-crm/next /srv/fodavin-crm/app
   sudo systemctl start fodavin-crm
   curl -s -o /dev/null -w '%{http_code}\n' http://127.0.0.1:8090/login   # expect 200
   ```
   **Rollback:** stop the service, move `app` back to `next` and `app.prev`
   back to `app`, start it again.

## 6. Supabase settings (dashboard, not in code)

- **Authentication → Sign In / Providers → "Allow new users to sign up": OFF.**
  Accounts are created by admins inside the CRM (with the service key, which
  isn't affected). With sign-ups on, anyone holding the public anon key could
  create an account, and the signup trigger takes the new profile's role from
  data the sign-up supplies.
- **Authentication → URL Configuration → Site URL**: the CRM's public address.
- **Google Drive uploads** need an `https://` address on a real domain: Google
  doesn't accept a bare IP as an OAuth redirect. Uploads stored in Supabase
  work either way.

## 7. HTTPS with a domain (later)

Point a domain's DNS at the server, give the Nginx site a `server_name` and
`listen 80`, run `sudo certbot --nginx -d <domain>`, then update `APP_URL`,
the Supabase Site URL and (for Drive) the Google redirect URI to the new
`https://` address, and restart the service.

## Backups

The nightly encrypted backup (`docs/backups.md`) runs in GitHub Actions
against Supabase directly; its `BACKUP_DATABASE_URL` secret must be the Mumbai
project's session pooler URL.
