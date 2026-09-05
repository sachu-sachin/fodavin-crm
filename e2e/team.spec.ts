import { expect, test } from "@playwright/test";
import { ADMIN_STORAGE_STATE } from "./helpers";

test.use({ storageState: ADMIN_STORAGE_STATE });

test.describe("Team", () => {
  test("shows the signed-in admin in the team directory", async ({ page }) => {
    await page.goto("/team");
    await expect(page.getByRole("heading", { name: "Team" })).toBeVisible();
    await expect(page.getByText("Playwright Fixture Admin")).toBeVisible();
    await expect(page.getByText("e2e-admin@fodavin-test.local")).toBeVisible();
  });
});
