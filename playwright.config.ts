import { defineConfig, devices } from "@playwright/test";
import { config as loadEnv } from "dotenv";

// Full E2E suite, run against a *dedicated test Supabase project* — never
// the real one. See docs/testing.md for how that project is provisioned.
//
// Safety-critical details, don't casually change these:
// - Loads .env.test.local (not .env.local) into this process, then the
//   webServer command below inherits it. NODE_ENV=test also makes Next's
//   own env loading skip .env.local even if something inherited it anyway
//   (see node_modules/next/dist/docs/.../environment-variables.md).
// - Runs on a dedicated port (3100) and NEVER reuses an already-running
//   server, specifically so this can't accidentally attach to a real `npm
//   run dev` on :3000 that's pointed at the real production database.
loadEnv({ path: ".env.test.local" });

const TEST_PORT = 3100;
const baseURL = `http://localhost:${TEST_PORT}`;

if (!process.env.TEST_ADMIN_EMAIL || !process.env.TEST_ADMIN_PASSWORD) {
  throw new Error(
    "TEST_ADMIN_EMAIL / TEST_ADMIN_PASSWORD missing from .env.test.local — see docs/testing.md to bootstrap the test admin account.",
  );
}

export default defineConfig({
  testDir: "./e2e",
  // Serial, not parallel: many specs assert against shared aggregate views
  // (the roles list, the employees table, dashboard counts) that would
  // interleave unpredictably if two tests mutated them at once. Test data
  // is also uniquely named per run (see e2e/helpers.ts), so this is about
  // assertion stability, not data collisions.
  fullyParallel: false,
  workers: 1,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  reporter: [["html", { open: "never" }], ["list"]],
  // The dev server compiles each page on its first visit, which under a full
  // run can take longer than the 5s default; 15s keeps a slow first compile
  // from reading as a failure, while a real failure still fails.
  expect: { timeout: 15_000 },
  timeout: 60_000,
  globalSetup: "./e2e/global-setup.ts",
  globalTeardown: "./e2e/global-teardown.ts",
  use: {
    baseURL,
    trace: "on-first-retry",
    screenshot: "only-on-failure",
  },
  projects: [
    { name: "chromium", use: { ...devices["Desktop Chrome"] } },
  ],
  webServer: {
    command: `npm run dev -- --port ${TEST_PORT}`,
    url: baseURL,
    reuseExistingServer: false,
    timeout: 60_000,
    env: { ...process.env, NODE_ENV: "test" },
    stdout: "pipe",
    stderr: "pipe",
  },
});
