import { expect, test, type Page } from "@playwright/test";
import { ADMIN_STORAGE_STATE, dialog, kanbanCard, saveAndSettle, testName } from "./helpers";

test.use({ storageState: ADMIN_STORAGE_STATE });

const FIXTURE_ADMIN = "Playwright Fixture Admin";

const templateCard = (page: Page, name: string) =>
  page.locator(`[data-template="${name}"]`);

async function deleteTemplate(page: Page, name: string) {
  await page.goto("/onboarding/templates");
  await templateCard(page, name).getByRole("button", { name: "Edit" }).click();
  await dialog(page).getByRole("button", { name: "Delete" }).click();
  await expect(templateCard(page, name)).toHaveCount(0);
}

test.describe("Onboarding", () => {
  test("builds a template, onboards someone from it, works the checklist, then cancels it", async ({ page }) => {
    // One long journey across five pages with settle waits: triple the timeout.
    test.slow();
    const template = testName("Dev Checklist");
    const laptop = testName("Set up laptop");
    const accounts = testName("Create accounts");
    const extra = testName("Order business cards");

    // A template with two steps (the third, blank row is ignored).
    await page.goto("/onboarding/templates");
    await page.getByRole("button", { name: "New template" }).click();
    await dialog(page).getByLabel("Name").fill(template);
    await dialog(page).getByLabel("Step 1", { exact: true }).fill(laptop);
    await dialog(page).getByLabel("Who does step 1").selectOption("new_hire");
    await dialog(page).getByLabel("Step 2", { exact: true }).fill(accounts);
    await dialog(page).getByLabel("Days for step 2").fill("-2");
    await saveAndSettle(page, "Create template");

    await expect(templateCard(page, template)).toContainText("New hire · Start day");
    await expect(templateCard(page, template)).toContainText("Unassigned · 2 days before");

    // Start the fixture admin's onboarding from it.
    await page.goto("/onboarding");
    await page.getByRole("button", { name: "Start onboarding" }).click();
    await dialog(page).getByLabel("Who is joining").selectOption({ label: FIXTURE_ADMIN });
    await dialog(page).getByLabel("Checklist").selectOption({ label: `${template} (2 steps)` });
    await saveAndSettle(page, "Start onboarding");

    await expect(page).toHaveURL(/\/onboarding\/[0-9a-f-]{36}$/);
    // The fixture admin is onboarding themselves here, so it's "Your onboarding".
    await expect(page.getByRole("heading", { name: "Your onboarding" })).toBeVisible();
    await expect(page.getByText(laptop, { exact: true })).toBeVisible();
    await expect(page.getByText(accounts, { exact: true })).toBeVisible();
    await expect(page.getByText("2 open of 2")).toBeVisible();
    const onboardingUrl = page.url();

    // It's on their dashboard and on the task board.
    await page.goto("/");
    const card = page.locator('[data-slot="card"]', { hasText: "Your onboarding" });
    await expect(card).toContainText("0 of 2 done");
    await expect(card).toContainText(laptop);
    await page.goto("/tasks");
    await expect(kanbanCard(page, laptop)).toContainText(`Onboarding: ${FIXTURE_ADMIN}`);

    // Tick a step off; add an extra one.
    await page.goto(onboardingUrl);
    await page.getByRole("checkbox", { name: `Mark "${laptop}" done` }).check();
    await expect(page.getByText("1 open of 2")).toBeVisible();
    await page.waitForTimeout(3000);
    await page.getByRole("button", { name: "Add item" }).click();
    await dialog(page).getByLabel("Title").fill(extra);
    await saveAndSettle(page, "Add item");
    await page.reload();
    await expect(page.getByText("2 open of 3")).toBeVisible();

    // The overview shows progress.
    await page.goto("/onboarding");
    await expect(page.getByRole("link", { name: new RegExp(FIXTURE_ADMIN) })).toContainText("1 of 3 done");

    // Cancelling removes the onboarding and its checklist tasks.
    await page.goto(onboardingUrl);
    await page.getByRole("button", { name: "Delete" }).first().click();
    await expect(page.getByText(/This also removes 3 checklist tasks/)).toBeVisible();
    await page.getByRole("button", { name: "Delete onboarding" }).click();
    await expect(page).toHaveURL(/\/onboarding$/);
    await page.goto("/tasks");
    await expect(kanbanCard(page, accounts)).toHaveCount(0);

    await deleteTemplate(page, template);
  });

  test("adds the starter template", async ({ page }) => {
    await page.goto("/onboarding/templates");
    const starters = templateCard(page, "Developer onboarding");
    const before = await starters.count();

    await page.getByRole("button", { name: "Add starter template" }).click();
    await expect(starters).toHaveCount(before + 1);
    await expect(starters.last().locator("li")).toHaveCount(10);

    // Clean up the one just added (they're identical).
    await starters.last().getByRole("button", { name: "Edit" }).click();
    await dialog(page).getByRole("button", { name: "Delete" }).click();
    await expect(starters).toHaveCount(before);
  });

  test("won't save a template without any steps", async ({ page }) => {
    await page.goto("/onboarding/templates");
    await page.getByRole("button", { name: "New template" }).click();
    await dialog(page).getByLabel("Name").fill(testName("Empty Template"));
    await dialog(page).getByRole("button", { name: "Create template" }).click();
    await expect(dialog(page).getByText("Add at least one step.")).toBeVisible();
  });
});
