import { expect, test } from "@playwright/test";
import { ADMIN_STORAGE_STATE, dialog, kanbanCard, saveAndSettle, testName } from "./helpers";

test.use({ storageState: ADMIN_STORAGE_STATE });

test.describe("Social", () => {
  test("creates a post, moves it via the edit dialog, then deletes it", async ({ page }) => {
    const title = testName("Launch teaser");

    await page.goto("/social");
    await page.getByRole("tab", { name: "Board" }).click();
    await page.getByRole("button", { name: "New post" }).click();
    await dialog(page).getByLabel("Title").fill(title);
    await dialog(page).getByLabel("Platform").selectOption("instagram");
    await saveAndSettle(page, "Create post");

    await expect(page.getByText(title).first()).toBeVisible();

    await kanbanCard(page, title).click();
    await dialog(page).getByLabel("Status").selectOption("draft");
    await saveAndSettle(page, "Save changes");

    await kanbanCard(page, title).click();
    await expect(dialog(page).getByLabel("Status")).toHaveValue("draft");
    await dialog(page).getByRole("button", { name: "Delete" }).click();
    await expect(page.getByText(title)).toHaveCount(0);
  });

  test("requires a title", async ({ page }) => {
    await page.goto("/social");
    await page.getByRole("button", { name: "New post" }).click();
    await dialog(page).getByRole("button", { name: "Create post" }).click();
    await expect(dialog(page).getByLabel("Title")).toBeVisible();
  });

  test("real drag-and-drop between board columns moves the post status", async ({ page }) => {
    const title = testName("Drag post");

    await page.goto("/social");
    await page.getByRole("tab", { name: "Board" }).click();
    await page.getByRole("button", { name: "New post" }).click();
    await dialog(page).getByLabel("Title").fill(title);
    await saveAndSettle(page, "Create post");
    await expect(page.getByText(title).first()).toBeVisible();

    const draftColumn = page.locator("div.rounded-lg.border.bg-muted\\/30", {
      has: page.getByText("Drafting", { exact: true }),
    });
    await kanbanCard(page, title).dragTo(draftColumn);
    await page.waitForLoadState("networkidle");

    await kanbanCard(page, title).click();
    await expect(dialog(page).getByLabel("Status")).toHaveValue("draft");
    await dialog(page).getByRole("button", { name: "Delete" }).click();
  });
});

test.describe("Social — icons, filters and overview", () => {
  test("shows a platform icon on a board card and filters the list by platform", async ({ page }) => {
    const title = testName("Icon filter post");

    await page.goto("/social");
    await page.getByRole("tab", { name: "Board" }).click();
    await page.getByRole("button", { name: "New post" }).click();
    await dialog(page).getByLabel("Title").fill(title);
    await dialog(page).getByLabel("Platform").selectOption("linkedin");
    await saveAndSettle(page, "Create post");

    const card = kanbanCard(page, title);
    await expect(card).toBeVisible();
    // The platform badge on the card renders an svg icon alongside the label.
    await expect(card.locator("svg")).toHaveCount(1);

    await page.getByLabel("Platform").selectOption({ label: "LinkedIn" });
    await page.waitForURL(/platform=linkedin/);
    await expect(page.getByText(title).first()).toBeVisible();

    const exportLink = page.getByRole("link", { name: "Export CSV" });
    await expect(exportLink).toHaveAttribute("href", /\/api\/reports\/social\?.*platform=linkedin/);

    await page.getByRole("button", { name: "Clear filters" }).click();
    await kanbanCard(page, title).click();
    await dialog(page).getByRole("button", { name: "Delete" }).click();
  });

  test("the Overview tab renders without crashing", async ({ page }) => {
    await page.goto("/social");
    await page.getByRole("tab", { name: "Overview" }).click();
    await expect(page.getByText("Posts by platform")).toBeVisible();
    await expect(page.getByText("Posts by status")).toBeVisible();
    await expect(page.getByText("Posts by month")).toBeVisible();
  });
});
