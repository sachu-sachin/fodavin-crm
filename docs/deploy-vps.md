# Deploying to your own server (VPS)

Moving the app from Vercel to a VPS moves **no data**. Everything (accounts,
clients, projects, files in the storage bucket) stays in Supabase, and the
server only runs the Next.js app. Done in this order, the switch has no
downtime and is reversible until the very end.

Assumes Ubuntu/Debian, a domain you control (`os.fodavin.com` below) and
`sudo` access. Adapt names and paths to taste.

## 1. Before you start

- **Release order.** If this deploy includes database changes (new tables or
  columns), apply them to the live database *before* the new code runs there:
  merge → `npm run db:push` → `npm run db:setup` → `npm run db:seed` → deploy.
  New code against an old schema makes the new pages fail. See the
  "Database changes" rules in `AGENTS.md`.
- Keep the Vercel deployment running until step 7. Both can serve the same
  Supabase database at once.

## 2. Server basics

```bash
sudo apt update && sudo apt install -y git nginx
# Node 22 LTS (Next.js 16 needs Node 20.9+; CI uses 22)
curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash -
sudo apt install -y nodejs
sudo adduser --system --group --home /srv/fodavin fodavin
```

Firewall: allow SSH and HTTP/HTTPS only. The app port (3000) stays private.

```bash
sudo ufw allow OpenSSH && sudo ufw allow 'Nginx Full' && sudo ufw enable
```

## 3. Code and secrets

The repository is private, so give the server its own **read-only deploy
key** rather than your personal GitHub login. A deploy key opens this one
repository and nothing else, and can be revoked on its own:

```bash
sudo -u fodavin ssh-keygen -t ed25519 -N "" -f /srv/fodavin/.ssh/id_ed25519
sudo cat /srv/fodavin/.ssh/id_ed25519.pub
```

Add that public key under GitHub → the repo → Settings → Deploy keys (leave
"Allow write access" off), then clone over SSH:

```bash
sudo -u fodavin git clone git@github.com:sachu-sachin/fodavin-crm.git /srv/fodavin/app
```

Copy the **production** env file to `/srv/fodavin/app/.env.local` using a
secure channel (`scp` over SSH, or paste from your password manager), never
email or chat. Then:

- set `APP_URL=https://os.fodavin.com`, the exact public address with no
  trailing slash;
- lock the file down:
  ```bash
  sudo chown fodavin:fodavin /srv/fodavin/app/.env.local
  sudo chmod 600 /srv/fodavin/app/.env.local
  ```

Name it `.env.local`, not `.env`. Next.js loads it in production; Prisma's CLI
and the E2E tooling don't, which keeps the live database out of their reach.

```bash
cd /srv/fodavin/app
sudo -u fodavin npm ci
sudo -u fodavin npm run build    # runs prisma generate, then next build
```

The build doesn't touch the database. **Never** add `db:push` or `db:setup`
to an automatic deploy step: schema changes are run by hand, deliberately.

## 4. Keep it running (systemd)

`/etc/systemd/system/fodavin.service`:

```ini
[Unit]
Description=Fodavin Business OS
After=network.target

[Service]
Type=simple
User=fodavin
WorkingDirectory=/srv/fodavin/app
Environment=NODE_ENV=production
# Listen on localhost only; Nginx is the public entry point.
ExecStart=/usr/bin/npm run start -- -H 127.0.0.1 -p 3000
Restart=on-failure

[Install]
WantedBy=multi-user.target
```

```bash
sudo systemctl daemon-reload
sudo systemctl enable --now fodavin
curl -I http://127.0.0.1:3000/login    # expect 200
```

## 5. Nginx and HTTPS

`/etc/nginx/sites-available/fodavin`:

```nginx
server {
    listen 80;
    server_name os.fodavin.com;

    # Document uploads go up to 10 MB (the app allows 12 MB including form
    # overhead). Nginx's default is 1 MB, which would reject them.
    client_max_body_size 12m;

    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_http_version 1.1;

        # REQUIRED: Next.js checks that form submissions (Server Actions)
        # come from the same host. Without the original Host header, every
        # save fails with "Invalid Server Actions request".
        proxy_set_header Host $host;
        proxy_set_header X-Forwarded-Host $host;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;

        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
    }
}
```

```bash
sudo ln -s /etc/nginx/sites-available/fodavin /etc/nginx/sites-enabled/
sudo nginx -t && sudo systemctl reload nginx
```

Point a **test** hostname at the server first if you can, or test with a
`hosts`-file entry. Then add HTTPS:

```bash
sudo apt install -y certbot python3-certbot-nginx
sudo certbot --nginx -d os.fodavin.com
```

## 6. Outside services that know the address

- **Supabase** → Authentication → URL Configuration: set **Site URL** to
  `https://os.fodavin.com` and add it to the redirect URLs.
- **Google Cloud Console** (only if Drive uploads are used) → Credentials → the
  OAuth client → add `https://os.fodavin.com/api/google/callback` as an
  authorised redirect URI. It must match `APP_URL` exactly. The Drive account
  already connected keeps working; this is needed to reconnect it.

## 7. Verify, then switch

On the new server:

- [ ] Sign in, and open every section in the sidebar.
- [ ] Make a harmless edit and save it (this checks the Host header).
- [ ] Upload a small document to a project, open it, then delete it (this
      checks the body-size limit and storage).
- [ ] The dashboard cards load.

Then point the domain's DNS at the VPS. Once traffic has moved over and
things look right for a day, remove or pause the Vercel project, and delete its
copies of the environment variables.

**Rollback:** until Vercel is removed, point DNS back at it. Nothing in the
database depends on where the app runs.

## Updating later

```bash
cd /srv/fodavin/app
sudo -u fodavin git pull
# If the release changes the schema, run db:push / db:setup / db:seed now
# (by hand, deliberately), before restarting.
sudo -u fodavin npm ci
sudo -u fodavin npm run build
sudo systemctl restart fodavin
```

The nightly database backup (`docs/backups.md`) runs in GitHub Actions against
Supabase directly, so it doesn't depend on where the app is hosted.
