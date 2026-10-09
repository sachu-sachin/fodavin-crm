import { expect, test, type Page } from "@playwright/test";
import { ADMIN_STORAGE_STATE, dialog, saveAndSettle, testName } from "./helpers";

test.use({ storageState: ADMIN_STORAGE_STATE });

/**
 * Click a week arrow and wait until that week is actually showing: the URL
 * has changed and the toolbar has re-enabled itself (it stays disabled while
 * the new week loads).
 */
async function changeWeek(page: Page, arrow: "Previous week" | "Next week") {
  const before = page.url();
  await page.getByRole("button", { name: arrow }).click();
  await expect(page).not.toHaveURL(before);
  await expect(page.getByRole("button", { name: arrow })).toBeEnabled();
}

/** The server-action POST a timesheet cell makes when it saves. */
const saveResponse = (page: Page) =>
  page.waitForResponse(
    (r) => r.request().method() === "POST" && r.url().includes("/timesheet") && r.ok(),
  );

test.describe("Timesheet", () => {
  test("logs hours against a project for a day, then removes them by zeroing the cell", async ({ page }) => {
    const projectName = testName("Timesheet Project");

    await page.goto("/projects");
    await page.getByRole("button", { name: "New project" }).click();
    await dialog(page).getByLabel("Name").fill(projectName);
    await saveAndSettle(page, "Create project");

    await page.goto("/timesheet");
    // Cell aria-label is "<project name>, <day label> <day of month>" —
    // just match the project name and grab the first (Monday) column.
    const firstCell = page.getByRole("textbox", { name: new RegExp(projectName) }).first();
    await firstCell.fill("7.5");
    await firstCell.blur();

    // Saved via onBlur; give the fire-and-forget save a moment, then reload
    // to confirm it actually persisted server-side rather than trusting the
    // optimistic client state.
    await page.waitForTimeout(1000);
    await page.reload();
    await expect(page.getByRole("textbox", { name: new RegExp(projectName) }).first()).toHaveValue("7.5");

    // Zero clears the row entirely (see saveTimeEntry: 0 deletes the row).
    await firstCell.fill("0");
    await firstCell.blur();
    await page.waitForTimeout(1000);
    await page.reload();
    await expect(page.getByRole("textbox", { name: new RegExp(projectName) }).first()).toHaveValue("");

    // Clean up.
    await page.goto("/projects");
    await page.getByRole("link", { name: new RegExp(projectName) }).click();
    await page.getByRole("button", { name: "Delete" }).first().click();
    await page.getByRole("button", { name: "Delete project" }).click();
  });

  test("rejects more than 24 hours on a single cell", async ({ page }) => {
    const projectName = testName("Overtime Project");

    await page.goto("/projects");
    await page.getByRole("button", { name: "New project" }).click();
    await dialog(page).getByLabel("Name").fill(projectName);
    await saveAndSettle(page, "Create project");

    await page.goto("/timesheet");
    const firstCell = page.getByRole("textbox", { name: new RegExp(projectName) }).first();
    await firstCell.fill("25");
    await firstCell.blur();

    await expect(page.getByText(/can't hold more than 24 hours/)).toBeVisible();

    await page.goto("/projects");
    await page.getByRole("link", { name: new RegExp(projectName) }).click();
    await page.getByRole("button", { name: "Delete" }).first().click();
    await page.getByRole("button", { name: "Delete project" }).click();
  });

  test("copy last week duplicates the previous week's entries", async ({ page }) => {
    const projectName = testName("Copy Week Project");

    await page.goto("/projects");
    await page.getByRole("button", { name: "New project" }).click();
    await dialog(page).getByLabel("Name").fill(projectName);
    await saveAndSettle(page, "Create project");

    // Log something last week. Wait for the week change to finish before
    // touching the grid: until it renders, the old week's grid and toolbar
    // are still on screen (this race was the cause of this test's old
    // flakiness — see Finding 5 in docs/testing.md).
    await page.goto("/timesheet");
    await changeWeek(page, "Previous week");
    const lastWeekCell = page.getByRole("textbox", { name: new RegExp(projectName) }).first();
    await lastWeekCell.fill("4");
    await Promise.all([saveResponse(page), lastWeekCell.blur()]);
    await expect(lastWeekCell).toHaveAttribute("aria-busy", "false");

    // Back to this week and copy.
    await changeWeek(page, "Next week");
    await page.getByRole("button", { name: "Copy last week" }).click();
    await expect(page.getByText("Copied last week.")).toBeVisible();

    await page.reload();
    await expect(page.getByRole("textbox", { name: new RegExp(projectName) }).first()).toHaveValue("4");

    await page.goto("/projects");
    await page.getByRole("link", { name: new RegExp(projectName) }).click();
    await page.getByRole("button", { name: "Delete" }).first().click();
    await page.getByRole("button", { name: "Delete project" }).click();
  });
});
