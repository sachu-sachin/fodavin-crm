# Testing

Two layers, two different jobs:

| Layer | Tool | What it checks | Touches real data? | Runs in CI? |
|---|---|---|---|---|
| Unit / server actions | [Vitest](https://vitest.dev) | Business logic, validation, permission boundaries | No — Prisma/Supabase/Next are mocked | Yes, on every push/PR to `main`/`dev` |
| UI / end-to-end | [Playwright](https://playwright.dev) | Real pages in a real browser, full CRUD flows | A dedicated **test** Supabase project — never production | Not yet (see "CI" below) |

Run everything locally:

```bash
npm test              # Vitest, once
npm run test:watch    # Vitest, watch mode
npm run test:coverage # Vitest with a coverage report
npm run test:e2e      # Playwright, headless
npm run test:e2e -- --headed --workers=1  # watch it click through the app
npm run test:e2e:ui   # Playwright's interactive UI mode (best for writing/debugging a test)
npm run test:e2e:report  # Re-open the last Playwright HTML report
```

**Before running `test:e2e`**: stop any other `next dev` server for this project. Next.js 16 locks one dev server per project directory regardless of port, so a real dev server (even on a different port) blocks the E2E test server from starting.

## Unit / server-action tests (Vitest)

Config: [vitest.config.ts](../vitest.config.ts). Setup/fixtures: [test/setup.ts](../test/setup.ts). Tests live next to the code they cover, as `*.test.ts`.

**What's covered today**: every pure-logic module in `src/lib/` (permissions, IST date formatting, week arithmetic, renewal status, crypto, nav), the auth guard functions in `src/lib/auth.ts`, and the server actions in `src/lib/actions/{auth,finance,timesheet,crm,admin}.ts`. Not yet covered: `projects.ts`, `social.ts`, `documents.ts`, `google.ts` actions, and `drive.ts` — same pattern applies, just hasn't been done yet.

**Mocking conventions** — copy these from an existing file rather than reinventing them:

- `@/lib/prisma` → `vi.mock` with a plain object of `vi.fn()`s per model/method you call, e.g. `{ prisma: { company: { create: vi.fn(), update: vi.fn() } } }`.
- `@/lib/auth` → mock `authorize`/`can`/`getSessionProfile`/`DENIED_MESSAGE` as needed. Build a fake session with a helper like `authorized()`/`unauthorized()` (see [finance.test.ts](../src/lib/actions/finance.test.ts)).
- `next/cache` → `{ revalidatePath: vi.fn() }`.
- `next/navigation` → `redirect` must be mocked to **throw**, matching real Next.js behavior: `vi.fn((path) => { throw new Error(\`REDIRECT:${path}\`) })`. This is not incidental — it's how a real bug got caught (see "Findings" below), and asserting `.rejects.toThrow("REDIRECT:/login")` is how you verify a guard actually redirects instead of silently swallowing the error.
- Build `FormData` for actions with a small `form({ field: "value" })` helper (see any `actions/*.test.ts` file).
- Reset mocks in `beforeEach`. Use `vi.resetAllMocks()` (not `vi.clearAllMocks()`) if any test uses `mockRejectedValue`/`mockResolvedValueOnce` — `clearAllMocks` doesn't undo a previously-set implementation, which causes state to leak into the next test (see the fix in [admin.test.ts](../src/lib/actions/admin.test.ts)).

**Adding a test for a new server action**: open the most similar existing file in `src/lib/actions/*.test.ts`, copy its `vi.mock` block, adjust the mocked model/methods, and write one `describe` per exported function covering: (1) denied without the right permission, (2) each validation rule, (3) the success path asserts the exact `prisma.*.create/update` call shape, (4) `revalidatePath` calls.

**Adding a test for a new lib module**: if it's pure logic (no `"use server"`, no imports of prisma/supabase), just write `describe`/`it` blocks directly — no mocking needed. See [renewals.test.ts](../src/lib/renewals.test.ts) for the simplest example.

## UI / end-to-end tests (Playwright)

Config: [playwright.config.ts](../playwright.config.ts). Tests live in [e2e/](../e2e/). Shared helpers in [e2e/helpers.ts](../e2e/helpers.ts).

**Covers every module**: login, auth redirects, CRM (companies + contacts), Pipeline (inquiries, stage changes via both the edit dialog and real drag-and-drop, convert-to-project), Projects (CRUD, payment milestones), Tasks (CRUD, drag-and-drop), Timesheet (logging hours, the 24h cap, copy-last-week), Social (posts, drag-and-drop), Employees and Roles (admin), Team, Settings, and the Dashboard. 46 tests total.

### It runs against a dedicated test Supabase project — set up once

There's a real, separate Supabase project for this, entirely disconnected from production. **Never point any of this at the real project.** To set one up (or recreate it):

1. Create a new Supabase project (free tier). Note its Project URL, `anon` key, and `service_role` key from **Project Settings → API**.
2. From **Project Settings → Database → Connection string**, grab both the **Transaction pooler** (port 6543) and **Session pooler** (port 5432) strings — same hostname, different port. Prisma needs `?pgbouncer=true` appended to the transaction-pooler one (`DATABASE_URL`); the session-pooler one needs no extra params (`DIRECT_URL`). Do **not** use the plain "Direct connection" string shown on that page for `DIRECT_URL` — it only resolves over IPv6 and will fail to connect on an IPv4-only network.
3. Create `.env.test.local` in the repo root (already covered by `.gitignore`'s `.env*` rule):
   ```
   NEXT_PUBLIC_SUPABASE_URL=<project url>
   NEXT_PUBLIC_SUPABASE_ANON_KEY=<anon key>
   SUPABASE_SERVICE_ROLE_KEY=<service_role key>
   DATABASE_URL=<transaction pooler, port 6543, with ?pgbouncer=true&connect_timeout=20&pool_timeout=20>
   DIRECT_URL=<session pooler, port 5432, no extra params>
   APP_URL=http://localhost:3100
   ```
4. Apply the schema and seed the roles, pointed at that file. `npm run db:seed` hardcodes `.env.local`, so do its two steps manually against `.env.test.local` instead:
   ```bash
   npx dotenv -e .env.test.local -- npx prisma db push
   npx dotenv -e .env.test.local -- npx prisma db execute --schema prisma/schema.prisma --file supabase/setup.sql
   npx tsc src/lib/permissions.ts --outDir .seed-build --module es2022 --target es2022 --moduleResolution bundler --skipLibCheck
   npx dotenv -e .env.test.local -- node prisma/seed.mjs
   ```
5. Bootstrap a disposable test-admin account. **Do not name it starting with `E2E `** — that prefix is reserved for disposable per-test records that `e2e/global-teardown.ts` sweeps up after every run, and this fixture must survive between runs:
   ```bash
   node --env-file=.env.test.local scripts/create-admin.mjs e2e-admin@fodavin-test.local "<a password you choose>" "Playwright Fixture Admin"
   ```
6. Add the same credentials to `.env.test.local` so Playwright's `global-setup.ts` can log in with them:
   ```
   TEST_ADMIN_EMAIL=e2e-admin@fodavin-test.local
   TEST_ADMIN_PASSWORD=<same password as step 5>
   ```

From here, `npm run test:e2e` logs in once ([e2e/global-setup.ts](../e2e/global-setup.ts)), saves the session to `e2e/.auth/admin.json` (gitignored), and every CRUD spec reuses it via `test.use({ storageState: ADMIN_STORAGE_STATE })`.

### Test data hygiene

Every record a test creates is named via `testName("Something")` from `e2e/helpers.ts`, which prefixes it `E2E <run-id>-<n> `. That prefix is what makes cleanup possible:

- Most specs delete what they created via the UI, as part of the test itself.
- [e2e/global-teardown.ts](../e2e/global-teardown.ts) is the **safety net**, not the primary path — it runs after every `test:e2e` invocation (pass or fail) and sweeps up anything left over whose name/title starts with `E2E `, including deleting orphaned Supabase Auth users created via the Employees page. It explicitly excludes the fixture admin account by email, as a second line of defense (see the Findings entry about why that mattered).
- The dev server itself always starts fresh on a dedicated port (3100) with `reuseExistingServer: false` — specifically so a real `npm run dev` on :3000 pointed at production can never accidentally get reused as the E2E target.

### Adding a test for a newly added page or component

- **New public/unauthenticated page or form**: follow `e2e/login.spec.ts`'s pattern.
- **New protected route**: add its path to `PROTECTED_ROUTES` in [e2e/auth-redirects.spec.ts](../e2e/auth-redirects.spec.ts) — one line.
- **New CRUD dialog/page**: copy the closest existing spec (e.g. `crm.spec.ts` for a simple create/edit/delete dialog, `pipeline.spec.ts` or `tasks.spec.ts` if it's a Kanban board). Use `testName()` for every created record's name, `dialog(page)` to scope into the open dialog (avoids ambiguity when a submit button shares its accessible name with the trigger that opened it), `kanbanCard(page, text)` to click a draggable board card (see Findings — clicking descendant text doesn't open these), and `saveAndSettle(page, buttonName)` instead of a bare `.click()` on a dialog's submit button whenever the very next step re-opens the same record — see "Timing" below for why.
- Prefer `getByRole`/`getByLabel`/`getByText` locators over CSS selectors.

### Timing: why so many waits, and what they're actually for

`revalidatePath` doesn't finish updating the client the instant a dialog closes — there's a real async gap between "the fetch settled" and "React has reconciled the new data," and some Server Actions were also observed taking 1.5–2.5s under Turbopack dev. A script can click through that gap in milliseconds; a human reacting to a dialog closing generally can't. `saveAndSettle()` (in `e2e/helpers.ts`) closes that gap: wait for the dialog to be gone, wait for network idle, then a buffer on top. Use it — or a similar explicit wait — anywhere a test immediately re-opens or re-reads something it just saved. Skipping it doesn't make the app race in production; it makes the *test* race against timing no real user would ever trigger.

### Extending further

- **CI**: add a job to `.github/workflows/ci.yml` using this same test project's credentials as GitHub Actions secrets (`Settings → Secrets and variables → Actions`) — never the real project's. `stdout`/`stderr` are already piped in `playwright.config.ts` so a CI log shows the dev server's own output for debugging.
- **Remaining Vitest coverage**: `projects.ts`, `social.ts`, `documents.ts`, `google.ts` actions, `drive.ts` — same mocking pattern as the covered ones.
- **Google Drive**: not exercised end-to-end (would need a real or mocked Google OAuth flow); `settings.spec.ts` only checks the integration card renders.

## Findings

Real issues this test suite caught, in the order they came up:

1. **`redirect()` swallowed by a `try/catch`** (fixed) — `saveTimeEntry`/`copyPreviousWeek` (`src/lib/actions/timesheet.ts`) wrapped `resolveTarget()`'s internal `redirect("/login")` in a generic `try/catch` that treated the redirect's own thrown signal as a permission error. A signed-out user calling either action directly got the raw string `"NEXT_REDIRECT"` instead of being sent to `/login`. Regression test in `src/lib/actions/timesheet.test.ts` (mocks `redirect` to throw, asserts `.rejects.toThrow`).

2. **`CardTitle` has no heading role** (not fixed — flagged) — [src/components/ui/card.tsx:36-47](../src/components/ui/card.tsx) renders a plain `<div>`, not an `<h1>`–`<h6>`, so screen readers don't announce it as a heading anywhere it's used (every dialog, the login page). Left alone since it's a shared component used everywhere — worth a deliberate pass, not an incidental one. `e2e/login.spec.ts` matches on visible text instead of heading role as a workaround.

3. **Stale form data in every CRUD edit dialog** (fixed) — `CompanyFormDialog`, `ContactFormDialog`, `InquiryFormDialog`, `ProjectFormDialog`, `TaskFormDialog`, `SocialPostDialog`, and `MilestoneFormDialog` all use uncontrolled inputs (`defaultValue={entity?.field}`), but the dialog's component instance persists across saves — only its `open` boolean toggles, so `defaultValue` never re-applies. Reopening any record's edit dialog without a full page reload showed **pre-save values**, and saving again from that state would silently overwrite the real value with the stale one. Fixed by keying each `<Dialog>` on `entity?.updated_at ?? "new"`, forcing a clean remount exactly when the record's data actually changes (found and pinned down via `e2e/pipeline.spec.ts`'s "lost reason" test, which reopens a card immediately after editing it).

4. **Raw Prisma `Decimal` leaking to Client Components** (fixed, two occurrences) — Next logs `"Only plain objects can be passed to Client Components... Decimal objects are not supported"` (server-side, in the `next dev` terminal — not the browser console) whenever this happens; this Next.js version doesn't hard-crash on it, but a future one plausibly could.
   - `src/app/(app)/crm/[id]/page.tsx`: the full `company` object — including its `include`d `projects` relation, where a project's `budget` is a `Decimal` — was passed to the client-side `CompanyFormDialog` via `company as unknown as Company`. The cast only satisfies TypeScript; the object still carries every relation at runtime.
   - `src/app/(app)/projects/[id]/page.tsx`: same pattern — `serializedProject` was built via `{ ...project, budget: Number(...), ... }`, but the spread also carried the raw `project`'s `time_entries` (Decimal `hours`), `tasks`, `milestones`, `company`, and `documents` relations onto an object then passed whole to `ProjectFormDialog`.
   - **The fix, and the rule going forward**: never spread a Prisma record that came from a query with `include`/nested `select` directly into a prop for a `"use client"` component, even behind an `as unknown as X` cast — that cast is compile-time only. Build the object from explicit named scalar fields instead (see either fix for the pattern). `e2e/crm.spec.ts`'s "budgeted project" test is a regression check for the first one — it can't assert on the warning directly (wrong process), so it exercises the functional path instead.

5. **Two redirect-triggering deletes back-to-back can hang the second one forever** (not fixed — flagged, worked around in tests) — `DeleteEntityButton`/`ConfirmDialog` calls the delete Server Action (`deleteCompany`, `deleteProject`, etc.) as a **direct function reference** inside `startTransition`, not through a `<form action={fn}>`. Deleting one record (which redirects on success), then immediately deleting a second one this way, was observed leaving the second confirm dialog's button stuck on **"Working…" indefinitely** — no further network request ever sent, no error, nothing. The same direct-invocation pattern (a plain `await someServerAction(x)` inside `startTransition`, versus a form-bound action) was separately observed hanging the "Copy last week" timesheet button the same way, though in that case a captured 200 response suggests the copy itself completed and only the UI's own pending state got stuck. Root cause not fully isolated — plausibly specific to how this Next.js version's client runtime handles a redirect (or just a slow response) from a directly-invoked action under Turbopack dev, rather than an application logic bug. Two mitigations in the tests, not the app: `e2e/crm.spec.ts`'s Decimal regression test does its cleanup as two independent, non-consecutive delete flows rather than back-to-back; `e2e/timesheet.spec.ts`'s copy-week test verifies the actual data outcome after a reload instead of the toast or button state. **Worth a closer look** if this ever shows up as a real user complaint ("the delete button just spun forever") — a fix would likely mean switching these to `<form action={fn}>` bindings, matching how the create/update actions in the same components are already invoked.

6. **User menu crashed on open** (fixed) — reported directly by the user from a live `next dev` session, not caught by the test suite. `UserMenu` (`src/components/user-menu.tsx`) rendered `DropdownMenuLabel` directly under `DropdownMenuContent`, with no `DropdownMenuGroup` around it. `DropdownMenuLabel` wraps Base UI's `Menu.GroupLabel` (`src/components/ui/dropdown-menu.tsx`), which throws `"Base UI: MenuGroupContext is missing"` unless it has a `Menu.Group` ancestor — unlike Radix (which this shadcn-style component set was originally written against), Base UI has no standalone label primitive independent of a group. Clicking the navbar avatar crashed the whole menu. Fixed by wrapping just the label in a `DropdownMenuGroup`; "Sign out" stays outside it. Checked for the same class of mistake elsewhere: `DropdownMenuLabel`/`DropdownMenuGroup` were only ever used in this one place, and every other Base UI compound component in `src/components/ui/` (Dialog, Tabs, Avatar) is already exercised, crash-free, across the 46 E2E tests above — `ui/select.tsx` is the only one that isn't, but it's unused dead code (every form in the app uses a plain native `<select>` instead). Regression test in `e2e/dashboard.spec.ts` ("the user menu opens without crashing") asserts zero `pageerror` events on open.

## CI

[.github/workflows/ci.yml](../.github/workflows/ci.yml) runs on every push/PR to `main` or `dev`: type-check (`tsc --noEmit`), lint (`eslint`), and the full Vitest suite. Playwright is not in CI yet — see "Extending further" above.
