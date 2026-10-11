# Database backups

The Supabase free plan has no backups you can restore from, so
[.github/workflows/backup.yml](../.github/workflows/backup.yml) takes one
every night at **02:00 IST**:

1. `pg_dump` of the `public` schema (all app data) and the `auth` schema
   (employee accounts and password hashes), minus login sessions and the
   tokens tied to them, the auth audit log, and `auth.schema_migrations`
   (a new project has its own).
2. Checks the archive is readable and contains the core tables. The run
   fails if it isn't, so a broken backup shows up as a red ✗ in the
   **Actions** tab rather than going unnoticed.
3. Encrypts it with AES-256 (`gpg --symmetric`) using a passphrase only you
   hold.
4. Stores it as a workflow artifact for **30 days**.

## What is *not* covered

- **Files in the Supabase Storage bucket** (uploads under 10 MB). The dump
  holds each document's record, not the file bytes. Files uploaded to or
  linked from **Google Drive** live in Drive and aren't affected.
- **Anything newer than the last run.** At most a day of work can be lost.

## One-time setup

1. **Create a passphrase.** Generate a long random one and save it in your
   password manager (e.g. Bitwarden) **before** anything else. Without it,
   every backup is unreadable — that is the point, but it also means losing
   it loses the backups.
   ```bash
   openssl rand -base64 32
   ```
2. **Get the database URL.** In Supabase: **Project Settings → Database →
   Connection string → Session pooler** (port 5432). Same value as
   `DIRECT_URL` in `.env.local`. Not the transaction pooler (6543), which
   `pg_dump` can't use, and not "Direct connection", which is IPv6-only and
   unreachable from GitHub's runners.
3. **Add both as repository secrets** — GitHub → this repo → **Settings →
   Secrets and variables → Actions → New repository secret**:
   | Name | Value |
   |---|---|
   | `BACKUP_DATABASE_URL` | the session pooler URL, with the password filled in |
   | `BACKUP_PASSPHRASE` | the passphrase from step 1 |
4. **Run it once by hand** to prove it works: **Actions → Database backup →
   Run workflow**. Check it goes green and an artifact named
   `fodavin-db-<date>` appears on the run page. Then do the restore drill
   below.

Scheduled runs only start once this workflow is on `main`.

## Restoring

You need PostgreSQL client tools at the same major version as the server
(17 for current Supabase projects), and `gpg`.

1. Download the artifact from the run page and unzip it.
2. Decrypt (you'll be asked for the passphrase):
   ```bash
   gpg --decrypt --output backup.dump fodavin-db-<date>.dump.gpg
   ```
3. Create a **new** Supabase project and put its values in `.env.restore`
   (`DATABASE_URL` and `DIRECT_URL` both set to its session pooler URL).
   Take that URL as `TARGET` too. Restore into an empty project, never on top
   of the live one. Turn **Authentication → Sign In / Providers → "Allow new
   users to sign up"** off in it straight away.
4. Create the tables with Prisma, using the same code version as the backup:
   ```bash
   npx dotenv -e .env.restore -- npx prisma db push --skip-generate
   ```
5. Load accounts and app data in one transaction. `session_replication_role
   = replica` pauses triggers and foreign-key checks while loading, so the
   signup trigger doesn't create duplicate profiles and table order doesn't
   matter:
   ```bash
   { echo "SET session_replication_role = replica;"
     pg_restore --data-only --no-owner --no-privileges \
       --table=users --table=identities --schema=auth -f - backup.dump
     pg_restore --data-only --no-owner --no-privileges --schema=public -f - backup.dump
   } | psql "$TARGET" -v ON_ERROR_STOP=1 --single-transaction -q
   ```
   This is how the Tokyo → Mumbai move was done on 2026-10-11. Compare
   `select count(*)` per table between the backup's source and the target.
6. **Immediately** re-apply the Supabase wiring against the new project
   (signup triggers, `updated_at`, and the Data API lock — until this runs,
   the restored tables may be reachable with the new project's anon key):
   ```bash
   npx dotenv -e .env.restore -- npx prisma db execute --schema prisma/schema.prisma --file supabase/setup.sql
   ```
7. Point the app's environment variables at the new project, rebuild (the
   public Supabase keys are baked into the build), recreate the private
   `documents` bucket's contents if you have copies of those files, and sign
   in to check. Everyone has to sign in again; passwords carry over.

### Restore drill

Do this once after setup and then every few months — a backup that has never
been restored is a hope, not a backup. Use a throwaway Supabase project, run
steps 1–6, sign in, spot-check a few clients and projects, then delete the
throwaway project (it holds real client data).

## Costs and limits

- Each run uses roughly 1–2 Actions minutes; the free allowance for private
  repos is 2,000/month.
- 30 nightly artifacts count against the repo's artifact storage quota (500 MB
  on the free plan). A small agency's database dumps to a few MB, so this is
  far from the limit — check Actions storage on your GitHub billing page if
  the database grows a lot.
- Artifacts live on GitHub. For a second copy somewhere else, add a step that
  uploads the encrypted file to S3-compatible storage (Cloudflare R2,
  Backblaze B2) or your VPS.

## Troubleshooting

- **`server version mismatch`** — Supabase upgraded Postgres. Raise `PG_MAJOR`
  in the workflow to match.
- **`permission denied` on an `auth` table** — Supabase changed what the
  `postgres` role may read. Add another `--exclude-table-data` for that table
  if it's not `auth.users`/`auth.identities`. If it is, drop `--schema=auth`
  and the `auth.users` check. App data is still backed up, but after a restore
  every login has to be recreated, and because profiles are keyed by the
  auth user's id, the new accounts won't reattach to existing assignments.
- **`connection refused` / timeout** — the URL is the direct connection or the
  transaction pooler; use the session pooler (port 5432).
