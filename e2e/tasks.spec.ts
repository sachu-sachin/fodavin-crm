import { expect, test } from "@playwright/test";
import { ADMIN_STORAGE_STATE, dialog, kanbanCard, saveAndSettle, testName } from "./helpers";

test.use({ storageState: ADMIN_STORAGE_STATE });

// Tasks require an existing project (the "New task" trigger only renders
// when at least one project exists), so each test creates its own.
async function createProject(page: import("@playwright/test").Page, name: string) {
  await page.goto("/projects");
  await page.getByRole("button", { name: "New project" }).click();
  await dialog(page).getByLabel("Name").fill(name);
  await saveAndSettle(page, "Create project");
}

async function deleteProject(page: import("@playwright/test").Page, name: string) {
  await page.goto("/projects");
  await page.getByRole("link", { name: new RegExp(name) }).click();
  await page.getByRole("button", { name: "Delete" }).first().click();
  await page.getByRole("button", { name: "Delete project" }).click();
  await expect(page).toHaveURL(/\/projects$/);
}

test.describe("Tasks", () => {
  test("creates a task from the global board, moves it via the edit dialog, then deletes it", async ({ page }) => {
    const projectName = testName("Task Host Project");
    const taskTitle = testName("Build the login form");

    await createProject(page, projectName);

    await page.goto("/tasks");
    await page.getByRole("button", { name: "New task" }).click();
    await dialog(page).getByLabel("Title").fill(taskTitle);
    await dialog(page).getByLabel("Project").selectOption({ label: projectName });
    await dialog(page).getByLabel("Discipline").selectOption("frontend");
    await saveAndSettle(page, "Create task");

    await expect(page.getByText(taskTitle).first()).toBeVisible();

    await kanbanCard(page, taskTitle).click();
    await dialog(page).getByLabel("Status").selectOption("in_progress");
    await saveAndSettle(page, "Save changes");

    await kanbanCard(page, taskTitle).click();
    await expect(dialog(page).getByLabel("Status")).toHaveValue("in_progress");
    await dialog(page).getByRole("button", { name: "Delete" }).click();
    await expect(page.getByText(taskTitle)).toHaveCount(0);

    await deleteProject(page, projectName);
  });

  test("adds a task directly from a project's own page", async ({ page }) => {
    const projectName = testName("Direct Task Project");
    const taskTitle = testName("Fix the header");

    await createProject(page, projectName);
    await page.getByRole("link", { name: new RegExp(projectName) }).click();

    await page.getByRole("button", { name: "Add task" }).click();
    await dialog(page).getByLabel("Title").fill(taskTitle);
    await saveAndSettle(page, "Create task");
    await expect(page.getByText(taskTitle).first()).toBeVisible();

    // Deleting the project cascades this task.
    await page.getByRole("button", { name: "Delete" }).first().click();
    await page.getByRole("button", { name: "Delete project" }).click();
    await expect(page).toHaveURL(/\/projects$/);
  });

  test("real drag-and-drop between board columns moves the task status", async ({ page }) => {
    const projectName = testName("Drag Task Project");
    const taskTitle = testName("Drag this task");

    await createProject(page, projectName);
    await page.goto("/tasks");
    await page.getByRole("button", { name: "New task" }).click();
    await dialog(page).getByLabel("Title").fill(taskTitle);
    await dialog(page).getByLabel("Project").selectOption({ label: projectName });
    await saveAndSettle(page, "Create task");
    await expect(page.getByText(taskTitle).first()).toBeVisible();

    const reviewColumn = page.locator("div.rounded-lg.border.bg-muted\\/30", {
      has: page.getByText("Review", { exact: true }),
    });
    await kanbanCard(page, taskTitle).dragTo(reviewColumn);
    await page.waitForLoadState("networkidle");

    await kanbanCard(page, taskTitle).click();
    await expect(dialog(page).getByLabel("Status")).toHaveValue("review");
    await dialog(page).getByRole("button", { name: "Delete" }).click();

    await deleteProject(page, projectName);
  });
});
