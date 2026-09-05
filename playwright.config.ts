import { defineConfig, devices } from "@playwright/test";

// Local-only for now: these tests hit the real dev server, which needs a
// real .env.local (Supabase project) to boot. There's no dedicated test
// Supabase project yet, so this suite is scoped to flows that never create,
// edit, or delete a real record — see docs/testing.md for the reasoning and
// how to extend once a test environment exists. Not wired into CI for the
// same reason (no Supabase secrets available there).
export default defineConfig({
  testDir: "./e2e",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  reporter: [["html", { open: "never" }], ["list"]],
  use: {
    baseURL: process.env.E2E_BASE_URL ?? "http://localhost:3000",
    trace: "on-first-retry",
    screenshot: "only-on-failure",
  },
  projects: [
    { name: "chromium", use: { ...devices["Desktop Chrome"] } },
  ],
  webServer: {
    command: "npm run dev",
    url: "http://localhost:3000",
    reuseExistingServer: !process.env.CI,
    timeout: 60_000,
  },
});
