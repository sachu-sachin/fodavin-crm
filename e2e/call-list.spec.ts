import { expect, test } from "@playwright/test";
import { ADMIN_STORAGE_STATE, dialog, testName } from "./helpers";

test.use({ storageState: ADMIN_STORAGE_STATE });
test.describe.configure({ mode: "serial" });

const a = testName("Sri Dental Care");
const b = testName("Kovai Gym");
const c = testName("Sri Dental duplicate");
const todayIST = () => new Date(Date.now() + 5.5 * 3_600_000).toISOString().slice(0, 10);

test.describe("Call list", () => {
  test("imports leads pasted from Excel, skipping a repeated phone number", async ({ page }) => {
    await page.goto("/pipeline/calls");
    await page.getByRole("button", { name: "Import leads" }).click();
    await dialog(page)
      .getByLabel("Rows to import")
      .fill(
        [
          "Business Name\tContact Person\tMobile\tArea",
          `${a}\tDr. Priya\t98765 4${String(Date.now()).slice(-4)}\tRS Puram`,
          `${b}\t\t+91 90000 ${String(Date.now()).slice(-5)}\tGandhipuram`,
          `${c}\t\t98765 4${String(Date.now()).slice(-4)}\t`,
        ].join("\n"),
      );
    await expect(dialog(page).getByRole("cell", { name: "Dr. Priya" })).toBeVisible();
    await dialog(page).getByRole("button", { name: "Import 3 leads" }).click();
    await expect(page.getByText("2 leads added, 1 skipped (phone already in the pipeline).")).toBeVisible();

    await page.reload();
    const newSection = page.locator("section", { has: page.getByRole("heading", { name: /New: never called/ }) });
    await expect(newSection.locator(`[data-lead="${a}"]`)).toBeVisible();
    await expect(newSection.locator(`[data-lead="${b}"]`)).toBeVisible();
    await expect(page.locator(`[data-lead="${c}"]`)).toHaveCount(0);
  });

  test("a one-line call log moves the lead up the list and counts towards today", async ({ page }) => {
    await page.goto("/pipeline/calls");
    const before = Number((await page.getByTestId("calls-today").innerText()).split("/")[0].trim());

    const row = page.locator(`[data-lead="${a}"]`);
    await row.getByLabel("Outcome").selectOption("interested");
    await row.getByLabel("Call note").fill("Wants a booking site");
    await row.getByLabel("Next follow-up").fill(todayIST());
    await row.getByRole("button", { name: "Log" }).click();
    await expect(page.getByText(`Call logged: ${a}`)).toBeVisible();

    await page.reload();
    const todaySection = page.locator("section", { has: page.getByRole("heading", { name: /Follow up today/ }) });
    const moved = todaySection.locator(`[data-lead="${a}"]`);
    await expect(moved).toBeVisible();
    // The stage badge (the outcome dropdown also has an "Interested" option).
    await expect(moved.getByText("Interested", { exact: true }).first()).toBeVisible();
    await expect(moved.getByText(/Last: Interested .* Wants a booking site/)).toBeVisible();
    await expect(page.getByTestId("calls-today")).toContainText(String(before + 1));
  });

  test("today's calls start the EOD report", async ({ page }) => {
    await page.goto("/reports");
    await expect(page.getByLabel("Completed")).toHaveValue(/Calls today: \d+ \(.*interested \d+/);
  });
});
