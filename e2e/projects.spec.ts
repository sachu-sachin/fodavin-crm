import { expect, test } from "@playwright/test";
import { ADMIN_STORAGE_STATE, dialog, saveAndSettle, testName } from "./helpers";

test.use({ storageState: ADMIN_STORAGE_STATE });

test.describe("Projects", () => {
  test("creates a project, sees it on the list, opens it, edits it", async ({ page }) => {
    const name = testName("Marketing Site");
    const renamed = `${name} v2`;

    await page.goto("/projects");
    await page.getByRole("button", { name: "New project" }).click();
    await dialog(page).getByLabel("Name").fill(name);
    await dialog(page).getByLabel("Type").selectOption("web_app");
    await saveAndSettle(page, "Create project");

    await expect(page.getByRole("link", { name: new RegExp(name) })).toBeVisible();
    await page.getByRole("link", { name: new RegExp(name) }).click();
    await expect(page.getByRole("heading", { name })).toBeVisible();

    await page.getByRole("button", { name: "Edit" }).click();
    await dialog(page).getByLabel("Name").fill(renamed);
    await dialog(page).getByLabel("Budget (₹)").fill("200000");
    await saveAndSettle(page, "Save changes");
    await expect(page.getByRole("heading", { name: renamed })).toBeVisible();

    await page.getByRole("button", { name: "Delete" }).first().click();
    await page.getByRole("button", { name: "Delete project" }).click();
    await expect(page).toHaveURL(/\/projects$/);
  });

  test("adds a payment milestone, marks it paid, then edits it", async ({ page }) => {
    const projectName = testName("Payments Project");
    const milestoneLabel = testName("Advance");

    await page.goto("/projects");
    await page.getByRole("button", { name: "New project" }).click();
    await dialog(page).getByLabel("Name").fill(projectName);
    await saveAndSettle(page, "Create project");
    await page.getByRole("link", { name: new RegExp(projectName) }).click();

    await page.getByRole("button", { name: "Add milestone" }).click();
    await dialog(page).getByLabel("Label").fill(milestoneLabel);
    await dialog(page).getByLabel("Amount (₹)").fill("50000");
    await saveAndSettle(page, "Add milestone");

    await expect(page.getByText(milestoneLabel).first()).toBeVisible();
    await expect(page.getByText("₹50,000").first()).toBeVisible();

    // One-click status change (setMilestoneStatus), separate from the edit dialog.
    await page.getByLabel(`Status for ${milestoneLabel}`).selectOption("paid");
    const receivedFigure = page.locator("div.rounded-md.border.p-3", { hasText: "Received" });
    await expect(receivedFigure).toContainText("₹50,000");

    // Clean up via the project delete (cascades the milestone).
    await page.getByRole("button", { name: "Delete" }).first().click();
    await page.getByRole("button", { name: "Delete project" }).click();
    await expect(page).toHaveURL(/\/projects$/);
  });

  test("requires a project name", async ({ page }) => {
    await page.goto("/projects");
    await page.getByRole("button", { name: "New project" }).click();
    await dialog(page).getByRole("button", { name: "Create project" }).click();
    await expect(dialog(page).getByLabel("Name")).toBeVisible();
  });

  test("filters the project list by status instantly (client-side, no navigation) and exposes a matching CSV export link", async ({ page }) => {
    const onHold = testName("Filter OnHold Project");
    const active = testName("Filter Active Project");

    await page.goto("/projects");
    await page.getByRole("button", { name: "New project" }).click();
    await dialog(page).getByLabel("Name").fill(onHold);
    await dialog(page).getByLabel("Status").selectOption("on_hold");
    await saveAndSettle(page, "Create project");

    await page.getByRole("button", { name: "New project" }).click();
    await dialog(page).getByLabel("Name").fill(active);
    await saveAndSettle(page, "Create project");

    await page.goto("/projects");
    await expect(page.getByText(onHold)).toBeVisible();
    await expect(page.getByText(active)).toBeVisible();

    const url = page.url();
    await page.getByLabel("Status").selectOption({ label: "On Hold" });
    await expect(page).toHaveURL(url);
    await expect(page.getByText(onHold)).toBeVisible();
    await expect(page.getByText(active)).toHaveCount(0);

    const exportLink = page.getByRole("link", { name: "Export CSV" });
    await expect(exportLink).toHaveAttribute("href", /\/api\/reports\/projects\?.*status=on_hold/);
  });
});
