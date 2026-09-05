# Testing

Two layers, two different jobs:

| Layer | Tool | What it checks | Touches real data? | Runs in CI? |
|---|---|---|---|---|
| Unit / server actions | [Vitest](https://vitest.dev) | Business logic, validation, permission boundaries | No — Prisma/Supabase/Next are mocked | Yes, on every push/PR to `main`/`dev` |
| UI / end-to-end | [Playwright](https://playwright.dev) | Real pages in a real browser | No (scope limited on purpose — see below) | No, not yet |

Run everything locally:

```bash
npm test              # Vitest, once
npm run test:watch    # Vitest, watch mode
npm run test:coverage # Vitest with a coverage report
npm run test:e2e      # Playwright, headless
npm run test:e2e:ui   # Playwright's interactive UI mode (best for writing/debugging a test)
npm run test:e2e:report  # Re-open the last Playwright HTML report
```

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

Config: [playwright.config.ts](../playwright.config.ts). Tests live in [e2e/](../e2e/). The config auto-starts `npm run dev` and points the browser at `http://localhost:3000`, so it needs a working local `.env.local` (a real Supabase project) to run at all.

### Why the scope is limited right now

There's no dedicated test Supabase project yet — only the real production one. Running E2E tests that create/edit/delete records against that would risk corrupting real business data. So today's E2E suite is scoped to flows that are **safe to run against the real project with zero setup**:

- Static rendering (`e2e/login.spec.ts` — form fields present, etc.)
- Client-side validation (empty-field submission blocked before any network call)
- One real, safe network call: submitting bad credentials to `signIn` — Supabase handles this the same way it handles every failed login attempt from a real visitor; nothing is created or changed
- Auth redirects (`e2e/auth-redirects.spec.ts`) — every route under `src/app/(app)/` is gated by one layout-level check (`src/app/(app)/layout.tsx`) that calls `supabase.auth.getUser()`. An anonymous, unauthenticated call to that is exactly what happens on every real visitor's first page load — read-only, no risk.

**What's deliberately not tested yet**: anything past login — the dashboard, CRM, pipeline, projects, timesheet, etc. Testing those means being authenticated, and testing their forms means creating/editing/deleting records, both of which need a test account that isn't your real admin login and a database that isn't your real business data.

### Extending this once you have a test environment

To go further, you'd need:

1. A **second Supabase project** dedicated to test data (free tier is fine), with its own schema (`supabase/setup.sql` + `prisma db push`) and a seeded test admin account (`node --env-file=.env.test.local scripts/create-admin.mjs test-admin@example.com "somepassword" "Test Admin"`).
2. A separate env file (e.g. `.env.test.local`, already covered by `.gitignore`'s `.env*` rule) pointing at that project, and a way for Playwright's `webServer` to use it (e.g. `command: "next dev --env-file .env.test.local"` or a wrapper script).
3. A Playwright [`storageState`](https://playwright.dev/docs/auth) fixture: log in once in a `global-setup` file, save the authenticated cookies, and reuse them across tests instead of logging in every time.
4. From there, CRUD flows are straightforward — create a company, assert it shows in the list, edit it, delete it, assert it's gone. Follow the same one-`describe`-per-flow structure as the existing specs.
5. Wire it into `.github/workflows/ci.yml` as a second job, with the test project's Supabase credentials added as GitHub Actions secrets (`Settings → Secrets and variables → Actions`) — **never** the real project's credentials.

Do not point any of this at the production Supabase project, ever — that's the one rule that makes the rest of this safe to automate.

### Adding a test for a newly added page or component

- **New public/unauthenticated page or form**: add a spec next to `e2e/login.spec.ts`, following the same pattern — render checks, then whatever client-side validation exists.
- **New protected route**: add its path to the `PROTECTED_ROUTES` array in [e2e/auth-redirects.spec.ts](../e2e/auth-redirects.spec.ts) — one line, and the redirect test covers it automatically.
- **New authenticated flow (a form, a CRUD page, etc.)**: not testable end-to-end until the test-environment setup above exists. In the meantime, cover its logic with a Vitest server-action test (see above) — that's where the actual validation and permission rules live anyway, so it's the higher-value test.
- Prefer `getByRole`/`getByLabel`/`getByText` locators over CSS selectors — they break less often and roughly match how a screen reader would traverse the page. If a component doesn't expose an accessible role (see the `CardTitle` finding below), that's usually worth fixing in the component rather than working around it in the test.

## Findings

- **`CardTitle` has no heading role** ([src/components/ui/card.tsx:36-47](../src/components/ui/card.tsx)) — shadcn's default renders a `<div>`, not an `<h1>`–`<h6>`, so screen readers don't announce it as a heading anywhere it's used (login page, every dialog, etc.). Not fixed here since it's a shared design-system component used everywhere — worth a deliberate pass rather than an incidental one-line change. `e2e/login.spec.ts` matches on visible text instead of heading role to work around this; switch it back once fixed.
- A real bug was already caught by writing these tests: `redirect()` (which works by throwing) was being swallowed by a `try/catch` in `saveTimeEntry`/`copyPreviousWeek` (`src/lib/actions/timesheet.ts`), so a signed-out user calling either action directly got a raw `"NEXT_REDIRECT"` error string instead of being sent to `/login`. Fixed, with a regression test (`src/lib/actions/timesheet.test.ts`) that fails without the fix — the pattern (mock `redirect` to throw, assert `.rejects.toThrow`) is why this is a standing convention above, not just a one-off.

## CI

[.github/workflows/ci.yml](../.github/workflows/ci.yml) runs on every push/PR to `main` or `dev`: type-check (`tsc --noEmit`), lint (`eslint`), and the full Vitest suite. Playwright is **not** in CI yet, for the same reason its scope is limited locally — no test Supabase project to point it at. Add it as a second job once that exists (see "Extending this" above).
