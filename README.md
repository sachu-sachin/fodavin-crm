# Fodavin Business OS

A lean, zero-cost CRM + Project/Task manager for the Fodavin agency.
See the full plan in [docs/Fodavin_Business_OS_Master_Plan.md](docs/Fodavin_Business_OS_Master_Plan.md).

A tool for a **website & app development agency** — every module is shaped
around dev delivery (typed projects, dev lifecycle, repo/staging/live URLs,
task disciplines) rather than a generic CRM.

## Stack

- **Next.js 16** (App Router) + **TypeScript**
- **Tailwind CSS 4** + **shadcn/ui**
- **Prisma 6** — ORM for all application data access
- **Supabase** — Auth (email + password), Postgres, Row Level Security
- **Vercel** for hosting (free tier)

### Localization

India-first: all dates/times render in **IST (Asia/Kolkata)** and money in **₹ INR** (`en-IN`), centralised in [src/lib/format.ts](src/lib/format.ts). Formatting uses a fixed timezone + locale, so server and client output match exactly (no hydration mismatches) and scheduled times are correct regardless of where the server runs.

### Data architecture

- **Supabase = identity.** Handles login/sessions. Its Data API (PostgREST/GraphQL) is **locked out of app data**: RLS is on for every table with no policies, and the `anon`/`authenticated` roles have no table grants. Anyone can hold the public anon key, and a signed-in employee can read their own access token from the browser, so any access there would bypass the role permissions below.
- **Prisma = all app data access.** Connects as the `postgres` role via the pooler (bypasses RLS), so authorization is enforced in server code (`authorize` / `requirePermission` / `requireAdmin`) — that is the only access boundary.
- Prisma owns the tables/columns/enums; Supabase-specific wiring (profile-on-signup trigger, `updated_at`, the Data API lock) lives in [supabase/setup.sql](supabase/setup.sql). **Re-run `npm run db:setup` after every schema change** so new tables are locked too.
- **Backups:** an encrypted nightly `pg_dump` runs as a GitHub Action — setup and restore steps in [docs/backups.md](docs/backups.md).

## Access model

- **Admin-only** account creation: an admin creates employees (email + password); they log in directly. No public sign-up.
- **Admin-defined roles**, managed in-app. A role may carry the admin flag.
- **"Admin vs. team"**: admins manage employees/roles/settings; every other employee has full access to clients, inquiries, projects and tasks.
- **Offboarding:** deactivating an employee flips `is_active` *and* bans the Supabase auth user, so existing sessions stop working on the next request (they land on `/login?reason=deactivated`) and they can't sign in again. Admins can't deactivate themselves.
- **Password resets** are admin-driven from **Employees → Reset password**; there is no self-serve reset flow.

## Getting started

### 1. Create a Supabase project

1. Go to [supabase.com/dashboard](https://supabase.com/dashboard) and create a free project.
2. In **Settings → API**, copy the **Project URL**, **anon public key**, and **service_role key**.
3. In **Settings → Database → Connection string**, copy the **Transaction** pooler URL (port 6543) and the **Session** pooler URL (port 5432).
4. Fill all of these into `.env.local` (see [.env.example](.env.example)):

   ```
   NEXT_PUBLIC_SUPABASE_URL=https://your-ref.supabase.co
   NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key
   SUPABASE_SERVICE_ROLE_KEY=your-service-role-key
   DATABASE_URL="postgresql://…:6543/postgres?pgbouncer=true"
   DIRECT_URL="postgresql://…:5432/postgres"
   ```

   > The service-role key is server-only and must never be exposed to the browser.

### 2. Create the schema, apply Supabase wiring, and seed

```bash
npm install       # runs `prisma generate`
npm run db:push   # create tables/enums in Supabase (Prisma)
npm run db:setup  # apply supabase/setup.sql (auth trigger, updated_at, Data API lock)
npm run db:seed   # seed the default roles
```

> `db:setup` runs [supabase/setup.sql](supabase/setup.sql) via Prisma. If the pooler
> rejects it, just paste that file into the Supabase **SQL Editor** instead.

### 3. Disable public sign-ups & create the first admin

1. In Supabase **Authentication → Providers → Email**, turn **off** "Allow new users to sign up" (accounts are admin-created).
2. Bootstrap the first admin (needs the service-role key in `.env.local`):

   ```bash
   node --env-file=.env.local scripts/create-admin.mjs admin@fodavin.com "StrongPassword123" "Founder Name"
   ```

### 4. Run the app

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) and sign in with the admin
email + password. From **Employees** you can create the rest of the team and
assign roles; manage the role list under **Roles**.

## Project structure

```
src/
  app/
    (app)/            Protected app shell + module pages
      page.tsx        Dashboard
      announcements/ crm/ pipeline/ projects/ tasks/ meetings/ social/ team/ onboarding/
      employees/ roles/   Admin-only management
    login/            Email + password sign-in
    auth/callback/    OAuth callback (ready for future social login)
  components/         Shell + admin managers + dialogs/boards + shadcn/ui
  lib/
    prisma.ts         Prisma client singleton (data access)
    supabase/         Browser / server / proxy / admin (service-role) clients
    actions/          Server actions (auth, admin, crm, projects, meetings, social, …)
    auth.ts           Session + admin guards
    types.ts          Domain types + display labels
prisma/
  schema.prisma       Models, enums, relations
  seed.mjs            Default roles
scripts/create-admin.mjs   First-admin bootstrap
supabase/setup.sql         Auth triggers (create/delete), updated_at, Data API lock
```

### Handy scripts

| Command | What it does |
|---------|--------------|
| `npm run db:push` | Sync the Prisma schema to the database |
| `npm run db:setup` | Apply `supabase/setup.sql` (auth triggers + Data API lock) — re-run after every schema change |
| `npm run db:seed` | Seed default roles |
| `npm run db:studio` | Open Prisma Studio |

## Deploy

**Production runs on a VPS** with the database in Supabase Mumbai — setup,
deploying updates and rollback are in [docs/deploy-vps.md](docs/deploy-vps.md).
The Vercel steps below are kept for reference only; Vercel was retired on
2026-10-11.

### Deploy to Vercel (retired)

1. Push this repo to GitHub, then **Import Project** in Vercel (framework auto-detected as Next.js).
2. Add the following **Environment Variables** (Project → Settings → Environment Variables), for Production and Preview:

   | Variable | Notes |
   |----------|-------|
   | `NEXT_PUBLIC_SUPABASE_URL` | Public |
   | `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Public |
   | `SUPABASE_SERVICE_ROLE_KEY` | **Secret** — server only |
   | `DATABASE_URL` | Transaction pooler (`:6543`, `?pgbouncer=true`) — used at runtime |
   | `DIRECT_URL` | Session pooler (`:5432`) |

3. **Build command** — the default (`npm run build`) already runs `prisma generate` first, so no change needed. `postinstall` also generates the client.
4. The database schema is managed from your machine (`npm run db:push` / `db:setup` / `db:seed`) against the same Supabase project — Vercel does not run migrations.
5. In Supabase **Authentication → URL Configuration**, add your Vercel domain to **Redirect URLs** (for the OAuth callback, if you later enable social login).

> Serverless (Vercel) connects through the **transaction pooler** (`DATABASE_URL`), which is the correct mode for short-lived function connections.

## Roadmap

- [x] **Daily reminder emails:** one email per person at 08:30 IST listing what needs them today — their overdue/due tasks (including meeting action items and onboarding steps), today's meetings, pipeline follow-ups (for whoever manages the pipeline), social posts due, and policies still to acknowledge. Nobody gets an empty email or two in a day; anyone can switch theirs off from the user menu. Sent over any SMTP mailbox and triggered by a GitHub Actions schedule, so it works on Vercel or a VPS. Setup: [docs/email-reminders.md](docs/email-reminders.md).
- [x] **Onboarding checklists:** reusable templates (`/onboarding/templates`, plus a one-click starter "Developer onboarding") whose steps are owned by the new hire, a named team member or nobody, and due N days from the start date (negative = before day one). Starting someone's onboarding turns every step into an **ordinary task** (`Task.onboarding_id`), so it shows on the task boards and in "My tasks this week"; `/onboarding` tracks progress and overdue steps, and the new hire gets a "Your onboarding" dashboard card and can always open their own checklist. Cancelling an onboarding removes its checklist tasks; editing a template never changes onboardings already started. Permissions `onboarding.view` / `onboarding.manage`. After deploying: `npm run db:push`, `npm run db:setup`, `npm run db:seed`.
- [x] **Announcements:** company news, holidays and policies at `/announcements`, readable by every signed-in employee (no view permission — a notice people can be locked out of isn't one). Optional scheduled publish time, expiry, pinning, and an audience limited to chosen roles. Policies can **require acknowledgement** ("I've read this"); people with `announcements.manage` see "read by X of Y" and who hasn't yet, and can ask everyone to re-read after a substantial edit. Unread ones appear on each person's dashboard. After deploying: `npm run db:push`, `npm run db:setup`, `npm run db:seed`.
- [x] **Meetings:** schedule internal, client, standup and review meetings with attendees, a call link and an agenda, optionally tied to a client and project. Notes and decisions are written in place on the meeting page. **Action items are ordinary tasks** (`Task.meeting_id`), so they appear on the task boards and in each person's "My tasks this week"; deleting a meeting keeps them. Meetings show on client and project pages, and a "Today's meetings" card sits on the dashboard. New permissions `meetings.view` / `meetings.manage` — after deploying, run `npm run db:push`, `npm run db:setup` and `npm run db:seed` (refreshes the template roles), and tick the new permissions on any custom roles.
- [x] **Phase 1 — Foundation + Access Control:** scaffold, password auth, admin-only Employees & Roles, RLS, app shell, dashboard, team
- [x] **Phase 2 — CRM Core:** companies/contacts CRUD, project-inquiries Kanban (drag-and-drop)
- [x] **Phase 10 — Renewals + dashboard:** projects carry **domain** and **hosting expiry** dates, surfaced on the project page and on a dashboard **Renewals due** card (30-day window, archived projects excluded) so a client's site can't quietly go dark. The dashboard is now four actionable cards — my tasks this week, renewals, follow-ups and money outstanding — instead of counts alone.
- [x] **Phase 9 — Timesheets:** a weekly **projects × days** grid at `/timesheet` that saves as you type (accepts `7`, `7.5` or `7:30`), with week navigation and "copy last week". Everyone edits their own sheet; admins can view and correct anyone's. Each project page gains a **Time** card showing hours logged and the **effective hourly rate** (budget ÷ hours, and received ÷ hours once milestones are paid) — profitability without needing any salary data.
- [x] **Phase 8 — Direct Drive uploads:** files over 10MB upload **browser → Google Drive** via a resumable session, so large files never pass through the server; smaller files keep using the Supabase bucket. Admin connects one agency Google account under **Settings**; the refresh token is AES-256-GCM encrypted at rest and the app requests only the `drive.file` scope. Setup + security model: [docs/google-drive-setup.md](docs/google-drive-setup.md).
- [x] **Phase 7 — Documents:** files and links attached to clients and projects. Uploads go to a **private** Supabase Storage bucket (10MB cap) and are served only through short-lived signed URLs via `/api/documents/[id]`; **Google Drive** links are recognised automatically (file id parsed, URL normalised) and stay in Drive, so Google's own sharing rules still govern access.
- [x] **Phase 6 — Money:** per-project **payment milestones** (advance / mid / final) with due dates, invoice numbers and pending → invoiced → paid status; a "Money outstanding" dashboard tile listing overdue and upcoming payments; **GSTIN** on clients. GST invoicing and bookkeeping stay in Zoho Books — the app only records the invoice number.
- [x] **Phase 5 — Pipeline hygiene & offboarding:** enforced deactivation + admin password reset; inquiries gained a linked contact, lead **source**, **next follow-up** date and **lost reason**; converted projects keep a link back to their inquiry; a "Follow-ups due" tile on the dashboard and due/overdue badges on the board
- [x] **Phase 3 — Projects & Tasks:** dev-shaped projects, per-project + global task boards (drag-and-drop, assignees, due dates)
- [x] **Phase 4 — Convert & Deploy:** one-click won inquiry → project, Vercel deploy guide
- [x] **Internal Ops — Social:** month content **calendar** + workflow board, categories, scheduling, assignment, in-app reminders, and a one-click **7-day auto plan** (LinkedIn / Instagram / Facebook / YouTube, themed per weekday)

> **Reminders** are currently in-app (a "due" surface on the Social page + dashboard tile). To send real email/push reminders, add a Supabase `pg_cron` job that queries `social_posts` where `reminder_at <= now()` and calls an Edge Function / email provider.
