import { expect, test, type Page } from "@playwright/test";
import { ADMIN_STORAGE_STATE, testName } from "./helpers";

/**
 * The table row for one employee. Matching on the first (name) cell, not the
 * whole row: every row's "Reporting lead" dropdown lists everyone's name, so
 * a plain `tr` + hasText would match other people's rows too.
 */
function employeeRow(page: Page, name: string) {
  return page.locator("tr").filter({
    has: page.locator("td:first-child", { hasText: name }),
  });
}

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

    const row = employeeRow(page, fullName);
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

    const row = employeeRow(page, fullName);
    await expect(row).toBeVisible();
    await row.getByRole("combobox", { name: "Main role" }).selectOption({ label: "QA Engineer" });
    // The select's onChange does a bare form.requestSubmit() (no
    // useTransition to await) — give the fire-and-forget submission a
    // moment to land before reloading to check it persisted.
    await page.waitForLoadState("networkidle");
    await page.waitForTimeout(1000);

    await page.reload();
    const selectedLabel = await employeeRow(page, fullName)
      .getByRole("combobox", { name: "Main role" })
      .evaluate((el: HTMLSelectElement) => el.selectedOptions[0]?.textContent);
    expect(selectedLabel).toBe("QA Engineer");
  });

  test("gives an employee an additional role and a reporting lead", async ({ page }) => {
    const leadName = testName("Lead");
    const memberName = testName("Member");
    const stamp = () => `${Date.now()}-${Math.random().toString(36).slice(2, 8)}@fodavin-test.local`;

    await page.goto("/employees");
    // The lead first, so they can be picked as the member's lead.
    await page.getByLabel("Full name").fill(leadName);
    await page.getByLabel("Email").fill(stamp());
    await page.getByLabel("Temporary password").fill("temp12345");
    await page.locator("#role_id").selectOption({ label: "Managing Lead" });
    await page.getByRole("button", { name: "Create account" }).click();
    await expect(employeeRow(page, leadName)).toBeVisible();

    // The member: main role Frontend Developer + Video Editor, reporting to the lead.
    await page.getByLabel("Full name").fill(memberName);
    await page.getByLabel("Email").fill(stamp());
    await page.getByLabel("Temporary password").fill("temp12345");
    await page.locator("#role_id").selectOption({ label: "Frontend Developer" });
    await page
      .getByRole("group", { name: "Additional roles" })
      .getByLabel("Video Editor")
      .check();
    await page.locator("#reports_to_id").selectOption({ label: leadName });
    await page.getByRole("button", { name: "Create account" }).click();

    const row = employeeRow(page, memberName);
    await expect(row).toBeVisible();
    await expect(row.getByText("+ Video Editor")).toBeVisible();
    await expect(row.getByRole("combobox", { name: "Reporting lead" })).toHaveValue(/.+/);

    await page.goto("/team");
    // The innermost element holding the name, the lead and the role badges.
    const card = page
      .locator("div", { hasText: memberName })
      .filter({ hasText: "Reports to" })
      .filter({ hasText: "Video Editor" })
      .last();
    await expect(card.getByText(`Reports to ${leadName}`)).toBeVisible();
    await expect(card.getByText("Frontend Developer")).toBeVisible();
    await expect(card.getByText("Video Editor")).toBeVisible();
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
    await expect(employeeRow(page, fullName)).toHaveCount(0);
  });
});
