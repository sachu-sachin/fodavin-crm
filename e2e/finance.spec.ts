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

  test("filters milestones by status instantly (client-side, no navigation) and exposes a matching CSV export link", async ({ page }) => {
    const projectName = testName("Finance Filter Project");
    const pendingLabel = testName("Pending Milestone");
    const paidLabel = testName("Paid Milestone");

    await page.goto("/projects");
    await page.getByRole("button", { name: "New project" }).click();
    await dialog(page).getByLabel("Name").fill(projectName);
    await saveAndSettle(page, "Create project");
    await page.getByRole("link", { name: new RegExp(projectName) }).click();

    // Left at its default "pending" status.
    await page.getByRole("button", { name: "Add milestone" }).click();
    await dialog(page).getByLabel("Label").fill(pendingLabel);
    await dialog(page).getByLabel("Amount (₹)").fill("10000");
    await saveAndSettle(page, "Add milestone");

    await page.getByRole("button", { name: "Add milestone" }).click();
    await dialog(page).getByLabel("Label").fill(paidLabel);
    await dialog(page).getByLabel("Amount (₹)").fill("20000");
    await dialog(page).getByLabel("Status").selectOption("paid");
    await saveAndSettle(page, "Add milestone");

    await page.getByRole("link", { name: "Finance" }).click();
    await expect(page).toHaveURL(/\/finance$/);
    // .first(): a "<label> added." toast can still be on screen and also
    // matches this text.
    await expect(page.getByText(pendingLabel).first()).toBeVisible();
    await expect(page.getByText(paidLabel).first()).toBeVisible();

    const url = page.url();
    // exact: true — a plain "Status" substring match also picks up each
    // table row's own "Status for <label>" control (payments-section.tsx,
    // reused on the project detail page).
    await page.getByLabel("Status", { exact: true }).selectOption({ label: "Paid" });
    await expect(page).toHaveURL(url);
    await expect(page.getByText(paidLabel).first()).toBeVisible();
    await expect(page.getByText(pendingLabel)).toHaveCount(0);

    const exportLink = page.getByRole("link", { name: "Export CSV" });
    await expect(exportLink).toHaveAttribute("href", /\/api\/reports\/finance\?.*status=paid/);
  });
});
