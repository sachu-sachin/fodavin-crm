import { expect, test } from "@playwright/test";
import { ADMIN_STORAGE_STATE } from "./helpers";

test.use({ storageState: ADMIN_STORAGE_STATE });

test.describe("Dashboard", () => {
  test("renders the summary cards after login", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByRole("heading", { name: "Dashboard" })).toBeVisible();
    // .last(): the sidebar nav also has a plain "Clients" link; the stat
    // card link (with its count appended, e.g. "Clients 0") renders after it.
    await expect(page.getByRole("link", { name: /Clients/ }).last()).toBeVisible();
    await expect(page.getByRole("link", { name: /Open Inquiries/ }).last()).toBeVisible();
    await expect(page.getByRole("link", { name: /Active Projects/ }).last()).toBeVisible();
    await expect(page.getByRole("link", { name: /Open Tasks/ }).last()).toBeVisible();
    await expect(page.getByText("My tasks this week")).toBeVisible();
  });
});
