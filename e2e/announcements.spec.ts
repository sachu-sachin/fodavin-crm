import { expect, test, type Page } from "@playwright/test";
import { ADMIN_STORAGE_STATE, dialog, saveAndSettle, testName } from "./helpers";

test.use({ storageState: ADMIN_STORAGE_STATE });

/** An announcement's card on /announcements. */
const card = (page: Page, title: string) =>
  page.locator('[id^="announcement-"]', { hasText: title });

/** Tomorrow at 09:00, as an <input type="datetime-local"> value. */
function tomorrowAt0900(): string {
  const d = new Date(Date.now() + 24 * 60 * 60 * 1000);
  return `${d.toISOString().slice(0, 10)}T09:00`;
}

async function post(page: Page, title: string, fill?: () => Promise<void>) {
  await page.goto("/announcements");
  await page.getByRole("button", { name: "New announcement" }).click();
  await dialog(page).getByLabel("Title").fill(title);
  await dialog(page).getByLabel("Message").fill("Details for the whole team.");
  await fill?.();
  await saveAndSettle(page, "Post announcement");
}

async function remove(page: Page, title: string) {
  await page.goto("/announcements");
  await card(page, title).getByRole("button", { name: "Edit" }).click();
  await dialog(page).getByRole("button", { name: "Delete" }).click();
  await expect(card(page, title)).toHaveCount(0);
}

test.describe("Announcements", () => {
  test("a policy needing acknowledgement shows as unread on the dashboard until acknowledged", async ({ page }) => {
    const title = testName("Leave Policy");

    await post(page, title, async () => {
      await dialog(page).getByLabel("Category").selectOption("policy");
      await dialog(page).getByLabel("Ask everyone to confirm they've read it").check();
    });

    await expect(card(page, title)).toContainText("New");
    await expect(card(page, title)).toContainText("Policy");
    await expect(card(page, title)).toContainText(/Acknowledged by 0 of \d+/);

    await page.goto("/");
    const unread = page.locator("li", { hasText: title });
    await expect(unread).toBeVisible();
    await expect(unread).toContainText("Please confirm you've read it");

    // The dashboard row links straight to the card.
    await unread.getByRole("link").click();
    await expect(page).toHaveURL(/\/announcements#announcement-/);
    await card(page, title).getByRole("button", { name: "I've read this" }).click();
    await expect(card(page, title).getByRole("button", { name: "I've read this" })).toHaveCount(0);
    await expect(card(page, title)).toContainText(/Acknowledged by 1 of \d+/);

    await page.goto("/");
    await expect(page.locator("li", { hasText: title })).toHaveCount(0);

    await remove(page, title);
  });

  test("a scheduled announcement waits under Scheduled and stays off the dashboard", async ({ page }) => {
    const title = testName("Holiday Notice");

    await post(page, title, async () => {
      await dialog(page).getByLabel("Publish at").fill(tomorrowAt0900());
    });

    const scheduled = page.locator("section", {
      has: page.getByRole("heading", { name: "Scheduled" }),
    });
    await expect(scheduled.locator('[id^="announcement-"]', { hasText: title })).toBeVisible();
    await expect(card(page, title)).not.toContainText("New");

    await page.goto("/");
    await expect(page.getByText(title)).toHaveCount(0);

    await remove(page, title);
  });

  test("one limited to another role is listed for managers but isn't theirs to read", async ({ page }) => {
    const title = testName("Marketing Only");

    await post(page, title, async () => {
      await dialog(page).getByRole("checkbox", { name: "Marketing" }).check();
    });

    await expect(card(page, title)).toContainText("only for Marketing");
    await expect(card(page, title).getByRole("button", { name: "Mark as read" })).toHaveCount(0);

    // The fixture admin isn't in Marketing, so it's not on their dashboard.
    await page.goto("/");
    await expect(page.getByText(title)).toHaveCount(0);

    await remove(page, title);
  });

  test("requires a title and a message", async ({ page }) => {
    await page.goto("/announcements");
    await page.getByRole("button", { name: "New announcement" }).click();
    await dialog(page).getByRole("button", { name: "Post announcement" }).click();
    // Native `required` blocks submission — the dialog stays open.
    await expect(dialog(page).getByLabel("Title")).toBeVisible();
  });
});
