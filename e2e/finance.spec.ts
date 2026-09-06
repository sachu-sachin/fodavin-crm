import { expect, test } from "@playwright/test";
import { ADMIN_STORAGE_STATE, dialog, saveAndSettle, testName } from "./helpers";

test.use({ storageState: ADMIN_STORAGE_STATE });

test.describe("Finance", () => {
  test("is reachable from the nav and lists a milestone created from a project", async ({ page }) => {
    const projectName = testName("Finance Project");
    const milestoneLabel = testName("Finance Milestone");

    await page.goto("/projects");
    await page.getByRole("button", { name: "New project" }).click();
    await dialog(page).getByLabel("Name").fill(projectName);
    await saveAndSettle(page, "Create project");
    await page.getByRole("link", { name: new RegExp(projectName) }).click();

    await page.getByRole("button", { name: "Add milestone" }).click();
    await dialog(page).getByLabel("Label").fill(milestoneLabel);
    await dialog(page).getByLabel("Amount (₹)").fill("25000");
    await saveAndSettle(page, "Add milestone");

    await page.getByRole("link", { name: "Finance" }).click();
    await expect(page).toHaveURL(/\/finance$/);
    await expect(page.getByRole("heading", { name: "Finance" })).toBeVisible();
    await expect(page.getByText(milestoneLabel)).toBeVisible();
    // The project name also appears as an <option> in the filter dropdown,
    // so scope to the table row's link specifically.
    await expect(page.getByRole("link", { name: new RegExp(projectName) })).toBeVisible();
  });

  test("filters milestones by status and exposes a matching CSV export link", async ({ page }) => {
    await page.goto("/finance");
    await page.getByLabel("Status").selectOption({ label: "Pending" });
    await page.waitForURL(/status=pending/);

    const exportLink = page.getByRole("link", { name: "Export CSV" });
    await expect(exportLink).toHaveAttribute("href", /\/api\/reports\/finance\?.*status=pending/);
  });
});
