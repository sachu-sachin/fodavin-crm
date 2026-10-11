<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

# Working on this repo

Rules any agent (or person) working here follows. They exist because this repo
talks to a live production database.

## Environments

- **`.env.local` is the LIVE production Supabase project** (Mumbai,
  `ap-south-1`, since 2026-10-11). Read-only checks are fine. Never run
  `npm run test:e2e`, `db:push`, `db:setup`, `db:seed` or any other write
  against it without the owner's explicit go-ahead *for that specific change*.
  Every `npm run db:*` script loads `.env.local`, so each one is a write to
  production.
- **`.env.test.local` is the disposable test project** (see `docs/testing.md`).
  Every test run and every schema change happens there first.
- Never name the live file `.env`: Prisma and Next.js (in test mode) load `.env`
  as a fallback, so live values could leak into a test run.
- Before and after any database change, confirm which project you're connected
  to (the project ref in the URL) and check what actually changed.
- Env files are gitignored. Never commit them, paste their values into chat or
  logs, or copy them anywhere unencrypted.

## Database changes

- Prisma owns tables and columns; `supabase/setup.sql` owns the Supabase wiring.
  **Re-run `db:setup` after every schema change.** It enables RLS on every
  `public` table and revokes all `anon`/`authenticated` grants, so new tables
  are locked.
- The app never uses Supabase's Data API (all access is Prisma plus server-side
  `authorize()`). Keep it that way: no RLS policies, no grants. See Finding 11
  in `docs/testing.md`.
- `updated_at` triggers are added automatically to every table with that
  column when `setup.sql` runs; there is no list to maintain.
- **Don't run `db:seed` on production.** It overwrites the permissions of every
  template role (Admin, Developer, …), undoing any changes the owner made in
  the Roles page. To roll out a new permission, add it to the template roles
  with a small script that only adds (see `docs/deploy-vps.md`).
- Release order: back up the database → `db:push` → `db:setup` → switch the
  server to the new build. Schema changes must be additive so the running
  version keeps working until the switch. Code that expects new tables must
  never run against an old schema. (There is no auto-deploy: the app runs on
  the VPS and is only updated by hand, so this order is in your control.)

## Code

- Every mutating server action calls `authorize(<permission>)`, directly or via
  a local helper. That check is the access boundary; hiding buttons is not.
  New permissions go in `src/lib/permissions.ts`, including the role templates.
- Pass only plain, serialisable objects to client components: build them from
  named fields and never spread a Prisma result that has `include`s (Finding 4).
- Follow-ups and checklists reuse `Task` (`meeting_id`, `onboarding_id`) rather
  than adding a second to-do list.

## Tests

- `npm test` (Vitest, runs in CI) and `npm run test:e2e` (Playwright, test
  project only). Run the full E2E suite before opening a PR. Each machine needs
  `npx playwright install chromium` once.
- Name every record a test creates with `testName()`, so the global teardown
  can sweep it.
- `next dev` rewrites `tsconfig.json` when it starts. Revert that
  (`git checkout -- tsconfig.json`) before committing.
- Timesheet "copy last week" used to fail intermittently; the cause (a
  week-navigation race) was fixed (Finding 12). A failure there now is a
  real regression.

## Git

- One branch per feature. When features touch the same files, stack the
  branches and merge them in order.
- Clone fully, not with `--depth`: a shallow clone only tracks `main`.
- Changes go through a PR that the owner reviews and merges.
