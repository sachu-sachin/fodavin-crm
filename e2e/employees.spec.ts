import { expect, test } from "@playwright/test";
import { ADMIN_STORAGE_STATE, testName } from "./helpers";

test.use({ storageState: ADMIN_STORAGE_STATE });

test.describe("Employees (admin)", () => {
  test("creates an employee, then deactivates and reactivates them", async ({ page }) => {
    const fullName = testName("New Hire");
    const email = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}@fodavin-test.local`;

    await page.goto("/employees");
    await page.getByLabel("Full name").fill(fullName);
    await page.getByLabel("Email").fill(email);
    await page.getByLabel("Temporary password").fill("temp12345");
    await page.getByRole("button", { name: "Create account" }).click();

    const row = page.locator("tr", { hasText: fullName });
    await expect(row).toBeVisible();
    await expect(row.getByText("Active")).toBeVisible();

    await row.getByRole("button", { name: "Deactivate" }).click();
    await expect(row.getByText("Inactive")).toBeVisible();
    await expect(row.getByRole("button", { name: "Activate" })).toBeVisible();

    await row.getByRole("button", { name: "Activate" }).click();
    await expect(row.getByText("Active")).toBeVisible();
  });

  test("assigns a role to an employee via the inline select", async ({ page }) => {
    const fullName = testName("Role Assignee");
    const email = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}@fodavin-test.local`;

    await page.goto("/employees");
    await page.getByLabel("Full name").fill(fullName);
    await page.getByLabel("Email").fill(email);
    await page.getByLabel("Temporary password").fill("temp12345");
    await page.getByRole("button", { name: "Create account" }).click();

    const row = page.locator("tr", { hasText: fullName });
    await expect(row).toBeVisible();
    await row.getByRole("combobox").selectOption({ label: "QA Engineer" });
    // The select's onChange does a bare form.requestSubmit() (no
    // useTransition to await) — give the fire-and-forget submission a
    // moment to land before reloading to check it persisted.
    await page.waitForLoadState("networkidle");
    await page.waitForTimeout(1000);

    await page.reload();
    const selectedLabel = await page
      .locator("tr", { hasText: fullName })
      .getByRole("combobox")
      .evaluate((el: HTMLSelectElement) => el.selectedOptions[0]?.textContent);
    expect(selectedLabel).toBe("QA Engineer");
  });

  test("admin cannot deactivate their own account", async ({ page }) => {
    await page.goto("/employees");
    const ownRow = page.locator("tr", { hasText: "You" });
    await expect(ownRow).toBeVisible();
    // No Deactivate/Activate control renders for the signed-in admin's own row.
    await expect(ownRow.getByRole("button", { name: /Deactivate|Activate/ })).toHaveCount(0);
  });

  test("blocks a password under 8 characters before it ever reaches the server", async ({ page }) => {
    // The password field has a native `minLength={8}`, so the browser's own
    // validation stops submission — the server-side length check in
    // createEmployee is a defense-in-depth backstop behind it, not what a
    // real browser submission would ever actually exercise.
    const fullName = testName("Short Pw");
    await page.goto("/employees");
    await page.getByLabel("Full name").fill(fullName);
    await page.getByLabel("Email").fill(`${Date.now()}@fodavin-test.local`);
    const password = page.getByLabel("Temporary password");
    await password.fill("short");
    await page.getByRole("button", { name: "Create account" }).click();

    await expect(page).toHaveURL(/\/employees$/);
    const validationMessage = await password.evaluate((el: HTMLInputElement) => el.validationMessage);
    expect(validationMessage).not.toBe("");
    await expect(page.locator("tr", { hasText: fullName })).toHaveCount(0);
  });
});
