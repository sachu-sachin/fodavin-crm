import { expect, test, type Page } from "@playwright/test";
import { ADMIN_STORAGE_STATE, testName } from "./helpers";

test.use({ storageState: ADMIN_STORAGE_STATE });
// One fixture admin's day: these steps share today's check-in and leave.
test.describe.configure({ mode: "serial" });

/** The register row for one person, matched on the name cell only. */
const personRow = (page: Page, name: string) =>
  page.locator("tr").filter({ has: page.locator("td:first-child", { hasText: name }) });

/** Tomorrow in IST as YYYY-MM-DD. */
function tomorrowIST(): string {
  const now = new Date(Date.now() + 5.5 * 3_600_000 + 86_400_000);
  return now.toISOString().slice(0, 10);
}

test.describe("Attendance", () => {
  test("checks in and out from the dashboard", async ({ page }) => {
    await page.goto("/");
    await page.getByRole("button", { name: "Check in" }).click();
    await expect(page.getByText("Checked in.")).toBeVisible();
    await page.getByRole("button", { name: "Check out" }).click();
    await expect(page.getByText("Checked out.")).toBeVisible();
    await expect(page.getByText("Done for today")).toBeVisible();

    // The day shows on the attendance page as present.
    await page.goto("/attendance");
    await expect(page.getByText("P · Present").first()).toBeVisible();
  });

  test("a lead marks a team member's day, with lateness worked out", async ({ page }) => {
    const name = testName("Attendee");
    await page.goto("/employees");
    await page.getByLabel("Full name").fill(name);
    await page.getByLabel("Email").fill(`${Date.now()}-${Math.random().toString(36).slice(2, 8)}@fodavin-test.local`);
    await page.getByLabel("Temporary password").fill("temp12345");
    await page.getByRole("button", { name: "Create account" }).click();
    await expect(page.locator("tr").filter({ has: page.locator("td:first-child", { hasText: name }) })).toBeVisible();

    await page.goto("/attendance?tab=team");
    const row = personRow(page, name);
    await row.getByLabel("Check-in").fill("09:30");
    await row.getByLabel("Check-out").fill("18:00");
    await row.getByLabel("Remarks").fill("Traffic");
    await row.getByRole("button", { name: "Save" }).click();
    await expect(page.getByText("Saved.")).toBeVisible();

    await page.reload();
    await expect(personRow(page, name).getByText(/8\.5 h · late 30 min/)).toBeVisible();

    // Mark the next working state explicitly: half day.
    await personRow(page, name).getByLabel("Status").selectOption("half_day");
    await personRow(page, name).getByRole("button", { name: "Save" }).click();
    await expect(page.getByText("Saved.")).toBeVisible();

    await page.goto("/attendance?tab=summary");
    const summaryRow = personRow(page, name);
    await expect(summaryRow).toBeVisible();
    // Half day = 0.5 present-equivalent.
    await expect(summaryRow.locator("td").nth(1)).toHaveText("0.5");
  });

  test("requests leave, then it is approved and cancelled", async ({ page }) => {
    const reason = testName("Family function");
    await page.goto("/attendance");
    await page.getByLabel("Leave type").selectOption("casual");
    await page.getByLabel("From", { exact: true }).fill(tomorrowIST());
    await page.getByLabel("Reason").fill(reason);
    await page.getByRole("button", { name: "Request leave" }).click();
    await expect(page.getByText("Leave requested.", { exact: false })).toBeVisible();

    await page.goto("/attendance?tab=team");
    const request = page.locator("div.flex", { hasText: reason }).filter({ has: page.getByRole("button", { name: "Approve" }) }).last();
    await request.getByRole("button", { name: "Approve" }).click();
    await expect(page.getByText("Leave approved.")).toBeVisible();

    await page.goto("/attendance");
    await expect(page.getByText("Approved").first()).toBeVisible();

    await page.goto("/attendance?tab=team");
    const approved = page.locator("div.flex", { hasText: reason }).filter({ has: page.getByRole("button", { name: "Cancel leave" }) }).last();
    await approved.getByRole("button", { name: "Cancel leave" }).click();
    await expect(page.getByText("Leave cancelled.")).toBeVisible();
  });

  test("refuses leave that ends before it starts", async ({ page }) => {
    await page.goto("/attendance");
    await page.getByLabel("From", { exact: true }).fill("2030-01-10");
    await page.getByLabel("To", { exact: true }).fill("2030-01-05");
    await page.getByRole("button", { name: "Request leave" }).click();
    await expect(page.getByText("The end date is before the start date.")).toBeVisible();
  });

  test("manages office hours and holidays", async ({ page }) => {
    await page.goto("/attendance?tab=settings");
    // Save the defaults back unchanged: proves the form round-trips without
    // changing the rules other tests rely on.
    await expect(page.getByLabel("Office starts")).toHaveValue("09:00");
    await page.getByRole("button", { name: "Save office hours" }).click();
    await expect(page.getByText("Office hours saved.")).toBeVisible();

    const holiday = testName("Founders Day");
    await page.getByLabel("Date").fill("2030-12-30");
    await page.getByLabel("Holiday").fill(holiday);
    await page.getByRole("button", { name: "Add holiday" }).click();
    await expect(page.getByText("Holiday saved.")).toBeVisible();
    const line = page.locator("div", { hasText: holiday }).filter({ has: page.getByRole("button", { name: "Remove" }) }).last();
    await line.getByRole("button", { name: "Remove" }).click();
    await expect(page.getByText(holiday)).toHaveCount(0);
  });
});
