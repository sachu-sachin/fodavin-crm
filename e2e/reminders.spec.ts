import { expect, test, type APIRequestContext, type Page } from "@playwright/test";
import { ADMIN_STORAGE_STATE, dialog, saveAndSettle, testName } from "./helpers";

// Exercises the reminders endpoint in dry-run mode only: it reports who would
// get what, and never sends an email. Needs CRON_SECRET in .env.test.local.

const FIXTURE_ADMIN = "Playwright Fixture Admin";
const SECRET = process.env.CRON_SECRET;

/** Today in IST at 23:00, as an <input type="datetime-local"> value. */
function todayLateIST(): string {
  const ist = new Date(Date.now() + 5.5 * 60 * 60 * 1000);
  return `${ist.toISOString().slice(0, 10)}T23:00`;
}

interface DryRun {
  dry: boolean;
  preview: { id: string; name: string; subject: string; items: string[] }[];
  skipped: Record<string, number>;
}

async function dryRun(request: APIRequestContext): Promise<DryRun> {
  const res = await request.post("/api/cron/reminders?dry=1", {
    headers: { Authorization: `Bearer ${SECRET}` },
  });
  expect(res.status()).toBe(200);
  return res.json();
}

async function setDigest(page: Page, on: boolean) {
  await page.goto("/");
  // The avatar button, labelled with the fixture admin's initials.
  await page.getByRole("button", { name: "PF" }).click();
  const item = page.getByRole("menuitem", { name: /Daily reminder email/ });
  if ((await item.getAttribute("aria-label"))?.endsWith(on ? "on" : "off")) {
    await page.keyboard.press("Escape");
    return;
  }
  await item.click();
  await expect(page.getByText(on ? "Daily reminder email on" : "Daily reminder email off")).toBeVisible();
  await page.keyboard.press("Escape");
}

test.describe("Daily reminders endpoint", () => {
  test("can't be called without the secret, and isn't sent to the login page", async ({ request }) => {
    const res = await request.post("/api/cron/reminders?dry=1", { maxRedirects: 0 });
    expect(res.status()).toBe(SECRET ? 401 : 503);
    const wrong = await request.post("/api/cron/reminders?dry=1", {
      headers: { Authorization: "Bearer not-the-secret" },
      maxRedirects: 0,
    });
    expect(wrong.status()).toBe(SECRET ? 401 : 503);
  });

  test.describe("with a signed-in admin", () => {
    test.use({ storageState: ADMIN_STORAGE_STATE });
    test.skip(!SECRET, "Add CRON_SECRET to .env.test.local (see docs/testing.md).");

    test("a meeting today shows up in the attendee's digest, and switching the email off removes them", async ({ page, request }) => {
      test.slow();
      const title = testName("Reminder Standup");

      await page.goto("/meetings");
      await page.getByRole("button", { name: "New meeting" }).click();
      await dialog(page).getByLabel("Title").fill(title);
      await dialog(page).getByLabel("Date & time").fill(todayLateIST());
      await dialog(page).getByRole("checkbox", { name: FIXTURE_ADMIN }).check();
      await saveAndSettle(page, "Create meeting");
      await expect(page).toHaveURL(/\/meetings\/[0-9a-f-]{36}$/);
      const meetingUrl = page.url();

      try {
        const before = await dryRun(request);
        expect(before.dry).toBe(true);
        const mine = before.preview.find((p) => p.name === FIXTURE_ADMIN);
        expect(mine, "fixture admin should get a digest").toBeDefined();
        expect(mine!.items).toContain(`Today's meetings: ${title}`);
        expect(mine!.subject).toMatch(/^Fodavin OS — today: .*meeting/);

        await setDigest(page, false);
        const off = await dryRun(request);
        expect(off.preview.find((p) => p.name === FIXTURE_ADMIN)).toBeUndefined();
        expect(off.skipped.opted_out).toBeGreaterThanOrEqual(1);
      } finally {
        await setDigest(page, true);
        await page.goto(meetingUrl);
        await page.getByRole("button", { name: "Delete" }).first().click();
        await page.getByRole("button", { name: "Delete meeting" }).click();
        await expect(page).toHaveURL(/\/meetings$/);
      }
    });
  });
});
