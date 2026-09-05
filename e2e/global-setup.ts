import { chromium, expect, type FullConfig } from "@playwright/test";
import { ADMIN_STORAGE_STATE } from "./helpers";

/**
 * Logs in once as the disposable test-admin account (see docs/testing.md)
 * and saves the authenticated cookies so every CRUD spec can reuse them via
 * `test.use({ storageState: ADMIN_STORAGE_STATE })` instead of logging in
 * per-test.
 */
export default async function globalSetup(config: FullConfig) {
  const email = process.env.TEST_ADMIN_EMAIL;
  const password = process.env.TEST_ADMIN_PASSWORD;
  if (!email || !password) {
    throw new Error("TEST_ADMIN_EMAIL / TEST_ADMIN_PASSWORD not set — see docs/testing.md.");
  }

  const baseURL = config.projects[0]?.use?.baseURL as string;
  const browser = await chromium.launch();
  const page = await browser.newPage({ baseURL });

  await page.goto("/login");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill(password);
  await page.getByRole("button", { name: "Sign in" }).click();

  // Successful sign-in redirects to the dashboard.
  await page.waitForURL(`${baseURL}/`, { timeout: 30_000 });
  await expect(page.getByText("Fodavin OS").first()).toBeVisible();

  await page.context().storageState({ path: ADMIN_STORAGE_STATE });
  await browser.close();
}
