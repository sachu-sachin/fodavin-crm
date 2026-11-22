import { expect, test } from "@playwright/test";
import { ADMIN_STORAGE_STATE, dialog, kanbanCard, saveAndSettle, testName } from "./helpers";

test.use({ storageState: ADMIN_STORAGE_STATE });
// One fixture admin's day: the steps share today's reports and the task.
test.describe.configure({ mode: "serial" });

const taskTitle = testName("Write 8 IT blog posts");
const plan = testName("Blogs first, then the SEO audit");

test.describe("Individual tasks and daily reports", () => {
  test("creates an individual task (no project) with priority and allocated hours", async ({ page }) => {
    await page.goto("/tasks");
    await page.getByRole("button", { name: "New task" }).click();
    await dialog(page).getByLabel("Title").fill(taskTitle);
    // Left on "No project (individual task)".
    await expect(dialog(page).getByLabel("Project")).toHaveValue("");
    await dialog(page).getByLabel("Assignee").selectOption({ label: "Playwright Fixture Admin" });
    await dialog(page).getByLabel("Priority").selectOption("high");
    await dialog(page).getByLabel("Workstream").fill("SEO");
    await dialog(page).getByLabel("Allocated hours").fill("2");
    await saveAndSettle(page, "Create task");

    const card = kanbanCard(page, taskTitle);
    await expect(card).toBeVisible();
    await expect(card.getByText("High")).toBeVisible();
    await expect(card.getByText("2 h")).toBeVisible();
  });

  test("submits the morning plan with today's task", async ({ page }) => {
    await page.goto("/reports");
    await page.getByLabel("Today's plan").fill(plan);
    await page.getByRole("group", { name: "Tasks for today" }).getByLabel(new RegExp(taskTitle)).check();
    await page.getByRole("button", { name: "Submit morning plan" }).click();
    await expect(page.getByText("Morning plan submitted.")).toBeVisible();
    await expect(page.getByRole("button", { name: "Update morning plan" })).toBeVisible();
  });

  test("the EOD report ticks the task off, which moves it to Done", async ({ page }) => {
    await page.goto("/reports");
    await page
      .getByRole("group", { name: /Finished today/ })
      .getByLabel(new RegExp(taskTitle))
      .check();
    await page.getByLabel("Completed").fill("Wrote the 8 blog posts");
    await page.getByLabel("Blockers").fill("None");
    await page.getByRole("button", { name: "Submit EOD report" }).click();
    await expect(page.getByText("End-of-day report submitted.")).toBeVisible();

    await page.goto("/tasks");
    await kanbanCard(page, taskTitle).click();
    await expect(dialog(page).getByLabel("Status")).toHaveValue("done");
    await expect(dialog(page).getByText(/Finished/)).toBeVisible();
  });

  test("a reviewer sees the reports with the finished task and comments", async ({ page }) => {
    await page.goto("/reports?tab=team");
    const card = page.locator('[data-person="Playwright Fixture Admin"]');
    await expect(card.getByText(plan)).toBeVisible();
    await expect(card.getByText("Wrote the 8 blog posts")).toBeVisible();
    // Finished-this-day table: allocated 2.
    await expect(card.getByRole("cell", { name: taskTitle })).toBeVisible();
    await card.getByLabel("Lead comment").first().fill("Good start");
    await card.getByRole("button", { name: "Save comment" }).first().click();
    await expect(page.getByText("Comment saved.")).toBeVisible();

    await page.goto("/reports");
    await expect(page.getByText("Good start")).toBeVisible();

    // Clean up the task (teardown also sweeps it by name).
    await page.goto("/tasks");
    await kanbanCard(page, taskTitle).click();
    await dialog(page).getByRole("button", { name: "Delete" }).click();
    await expect(page.getByText(taskTitle)).toHaveCount(0);
  });
});
