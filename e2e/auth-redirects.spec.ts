import { expect, test } from "@playwright/test";

// Every route under src/app/(app)/ is gated by a single layout-level guard
// (see src/app/(app)/layout.tsx: `if (!session) redirect("/login")`), so an
// anonymous visitor hitting any of them should always land on /login. This
// only exercises the "no session" path — a read-only, unauthenticated
// Supabase call every real visitor triggers anyway, so it's safe to run
// against the real project with no dedicated test environment.

const PROTECTED_ROUTES = [
  "/",
  "/announcements",
  "/attendance",
  "/reports",
  "/crm",
  "/pipeline",
  "/projects",
  "/tasks",
  "/meetings",
  "/timesheet",
  "/social",
  "/team",
  "/onboarding",
  "/onboarding/templates",
  "/employees",
  "/roles",
  "/settings",
];

for (const route of PROTECTED_ROUTES) {
  test(`unauthenticated visit to ${route} redirects to /login`, async ({ page }) => {
    await page.goto(route);
    await expect(page).toHaveURL(/\/login$/);
    await expect(page.getByText("Fodavin Business OS")).toBeVisible();
  });
}
