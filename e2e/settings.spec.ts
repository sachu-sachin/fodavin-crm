import { expect, test } from "@playwright/test";
import { ADMIN_STORAGE_STATE } from "./helpers";

test.use({ storageState: ADMIN_STORAGE_STATE });

test.describe("Settings", () => {
  test("renders the Google Drive integration card", async ({ page }) => {
    await page.goto("/settings");
    await expect(page.getByRole("heading", { name: "Settings" })).toBeVisible();
    // Not asserting connected vs. not-configured here — that depends on
    // whatever Google credentials this test environment happens to have,
    // which is out of scope for this smoke check (see docs/testing.md on
    // why Drive itself isn't exercised end-to-end).
    await expect(page.getByText("Google Drive", { exact: true })).toBeVisible();
  });
});
