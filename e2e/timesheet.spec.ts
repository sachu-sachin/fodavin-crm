import { expect, test } from "@playwright/test";
import { ADMIN_STORAGE_STATE, dialog, saveAndSettle, testName } from "./helpers";

test.use({ storageState: ADMIN_STORAGE_STATE });

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

    // Log something last week.
    await page.goto("/timesheet");
    await page.getByRole("button", { name: "Previous week" }).click();
    const lastWeekCell = page.getByRole("textbox", { name: new RegExp(projectName) }).first();
    await lastWeekCell.fill("4");
    await lastWeekCell.blur();
    await page.waitForTimeout(1000);

    // Move to this week and copy. "Copy last week" invokes copyPreviousWeek
    // as a direct server-action reference inside startTransition (not via a
    // <form>) — network capture confirmed the request completes with a 200,
    // but the button's own pending indicator ("Copying…") can get stuck
    // regardless, never flipping back and never showing the success toast
    // (see docs/testing.md's "Findings" section). So this checks the actual
    // outcome — the copied hours, after a fresh page load — rather than the
    // toast or the button's transient state, neither of which reliably
    // reflects whether the copy actually happened.
    await page.getByRole("button", { name: "Next week" }).click();
    await page.getByRole("button", { name: "Copy last week" }).click();
    await page.waitForTimeout(3000);

    await page.reload();
    await expect(page.getByRole("textbox", { name: new RegExp(projectName) }).first()).toHaveValue("4");

    await page.goto("/projects");
    await page.getByRole("link", { name: new RegExp(projectName) }).click();
    await page.getByRole("button", { name: "Delete" }).first().click();
    await page.getByRole("button", { name: "Delete project" }).click();
  });
});
