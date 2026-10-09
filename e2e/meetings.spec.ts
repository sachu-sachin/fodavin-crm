import { expect, test, type Page } from "@playwright/test";
import { ADMIN_STORAGE_STATE, dialog, kanbanCard, saveAndSettle, testName } from "./helpers";

test.use({ storageState: ADMIN_STORAGE_STATE });

/** Tomorrow at 15:30, as an <input type="datetime-local"> value. */
function tomorrowAt1530(): string {
  const d = new Date(Date.now() + 24 * 60 * 60 * 1000);
  return `${d.toISOString().slice(0, 10)}T15:30`;
}

const MEETING_URL = /\/meetings\/[0-9a-f-]{36}$/;

async function deleteMeetingFromItsPage(page: Page) {
  await page.getByRole("button", { name: "Delete" }).first().click();
  await page.getByRole("button", { name: "Delete meeting" }).click();
  await expect(page).toHaveURL(/\/meetings$/);
}

test.describe("Meetings", () => {
  test("schedules a meeting, writes notes, adds an action item that lands on the task board, then deletes the meeting but keeps the task", async ({ page }) => {
    const title = testName("Design Review");
    const actionItem = testName("Send revised mockups");

    // Schedule — creating a meeting opens its page.
    await page.goto("/meetings");
    await page.getByRole("button", { name: "New meeting" }).click();
    await dialog(page).getByLabel("Title").fill(title);
    await dialog(page).getByLabel("Type").selectOption("review");
    await dialog(page).getByLabel("Date & time").fill(tomorrowAt1530());
    await dialog(page).getByLabel("Where / call link").fill("https://meet.example/e2e");
    // Tick the first person offered as an attendee.
    await dialog(page).getByRole("checkbox").first().check();
    await dialog(page).getByLabel("Agenda").fill("Homepage and pricing page");
    await saveAndSettle(page, "Create meeting");

    await expect(page).toHaveURL(MEETING_URL);
    await expect(page.getByRole("heading", { name: title })).toBeVisible();
    await expect(page.getByText("Homepage and pricing page")).toBeVisible();
    await expect(page.getByText("Attendees (1)")).toBeVisible();
    await expect(page.getByRole("link", { name: "https://meet.example/e2e" })).toBeVisible();

    // Notes are edited in place and survive a reload.
    await page.getByLabel("Notes", { exact: true }).fill("Client liked the hero section.");
    await page.getByLabel("Decisions").fill("Go with the dark theme.");
    await page.getByRole("button", { name: "Save notes" }).click();
    await page.waitForLoadState("networkidle");
    await page.reload();
    await expect(page.getByLabel("Notes", { exact: true })).toHaveValue("Client liked the hero section.");
    await expect(page.getByLabel("Decisions")).toHaveValue("Go with the dark theme.");

    // Action item → an ordinary task.
    await page.getByRole("button", { name: "Add action item" }).click();
    await dialog(page).getByLabel("Title").fill(actionItem);
    await saveAndSettle(page, "Add action item");
    await expect(page.getByText(actionItem)).toBeVisible();
    await expect(page.getByText("1 open of 1")).toBeVisible();

    const meetingUrl = page.url();
    await page.goto("/tasks");
    await expect(kanbanCard(page, actionItem)).toBeVisible();
    await expect(kanbanCard(page, actionItem)).toContainText(`Meeting: ${title}`);

    // Ticking it off on the meeting page moves it to Done everywhere.
    await page.goto(meetingUrl);
    await page.getByRole("checkbox", { name: `Mark "${actionItem}" done` }).check();
    await page.waitForLoadState("networkidle");
    await page.reload();
    await expect(page.getByText("0 open of 1")).toBeVisible();

    // Deleting the meeting says the action item is kept — and it is.
    await page.getByRole("button", { name: "Delete" }).first().click();
    await expect(page.getByText(/1 action item will be kept/)).toBeVisible();
    await page.getByRole("button", { name: "Delete meeting" }).click();
    await expect(page).toHaveURL(/\/meetings$/);
    await expect(page.getByText(title)).toHaveCount(0);

    await page.goto("/tasks");
    await expect(kanbanCard(page, actionItem)).toBeVisible();
    await kanbanCard(page, actionItem).click();
    await dialog(page).getByRole("button", { name: "Delete" }).click();
    await expect(kanbanCard(page, actionItem)).toHaveCount(0);
  });

  test("schedules a meeting from a client's page with that client pre-selected", async ({ page }) => {
    const company = testName("Meeting Client");
    const title = testName("Kickoff Call");

    await page.goto("/crm");
    await page.getByRole("button", { name: "Add company" }).click();
    await dialog(page).getByLabel("Name").fill(company);
    await dialog(page).getByRole("button", { name: "Add company" }).click();
    await page.getByRole("link", { name: new RegExp(company) }).click();
    await expect(page.getByRole("heading", { name: company })).toBeVisible();
    const clientUrl = page.url();

    await page.getByRole("button", { name: "New meeting" }).click();
    await expect(dialog(page).getByLabel("Client (optional)")).toHaveValue(/[0-9a-f-]{36}/);
    await expect(dialog(page).getByLabel("Type")).toHaveValue("client");
    await dialog(page).getByLabel("Title").fill(title);
    await dialog(page).getByLabel("Date & time").fill(tomorrowAt1530());
    await saveAndSettle(page, "Create meeting");

    await expect(page).toHaveURL(MEETING_URL);
    await expect(page.getByRole("link", { name: company })).toBeVisible();

    // Listed on the client's page.
    await page.goto(clientUrl);
    await expect(page.getByRole("link", { name: new RegExp(title) })).toBeVisible();

    // Clean up: the meeting, then the client.
    await page.getByRole("link", { name: new RegExp(title) }).click();
    await deleteMeetingFromItsPage(page);
    await page.goto(clientUrl);
    await page.getByRole("button", { name: "Delete" }).first().click();
    await page.getByRole("button", { name: "Delete client" }).click();
    await expect(page).toHaveURL(/\/crm$/);
  });

  test("filters the meetings list instantly by search", async ({ page }) => {
    const keep = testName("Filter Alpha Meeting");
    const other = testName("Filter Beta Meeting");

    for (const title of [keep, other]) {
      await page.goto("/meetings");
      await page.getByRole("button", { name: "New meeting" }).click();
      await dialog(page).getByLabel("Title").fill(title);
      await dialog(page).getByLabel("Date & time").fill(tomorrowAt1530());
      await saveAndSettle(page, "Create meeting");
      await expect(page).toHaveURL(MEETING_URL);
    }

    await page.goto("/meetings");
    const url = page.url();
    await page.getByLabel("Search meetings").fill("Alpha");
    await expect(page).toHaveURL(url);
    await expect(page.getByText(keep)).toBeVisible();
    await expect(page.getByText(other)).toHaveCount(0);

    // Clean up both.
    await page.getByLabel("Search meetings").fill("");
    for (const title of [keep, other]) {
      await page.getByRole("link", { name: new RegExp(title) }).click();
      await deleteMeetingFromItsPage(page);
    }
  });

  test("requires a title and a date", async ({ page }) => {
    await page.goto("/meetings");
    await page.getByRole("button", { name: "New meeting" }).click();
    await dialog(page).getByRole("button", { name: "Create meeting" }).click();
    // Native `required` blocks submission — the dialog stays open.
    await expect(dialog(page).getByLabel("Title")).toBeVisible();
  });
});
