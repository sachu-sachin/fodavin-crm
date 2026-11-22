import { expect, test } from "@playwright/test";
import { ADMIN_STORAGE_STATE, dialog, kanbanCard, saveAndSettle, testName } from "./helpers";

test.use({ storageState: ADMIN_STORAGE_STATE });

test.describe("Lead management", () => {
  test("logs a call with a recording, which moves the lead forward", async ({ page }) => {
    const title = testName("Dental clinic website");

    await page.goto("/pipeline");
    await page.getByRole("button", { name: "New inquiry" }).click();
    await dialog(page).getByLabel("Title").fill(title);
    await dialog(page).getByLabel("Phone").fill("+91 98765 43210");
    await saveAndSettle(page, "Create inquiry");

    // New leads belong to whoever adds them, so it shows under "My leads".
    await page.goto("/pipeline?mine=1");
    const card = kanbanCard(page, title);
    await expect(card).toBeVisible();
    await expect(card.getByText("Playwright Fixture Admin")).toBeVisible();
    await card.getByRole("link", { name: "Calls →" }).click();

    await expect(page.getByRole("heading", { name: title })).toBeVisible();
    await expect(page.getByRole("link", { name: "+91 98765 43210" })).toHaveAttribute("href", "tel:+91 98765 43210");

    await page.getByLabel("Outcome").selectOption("connected");
    await page.getByLabel("Duration (minutes)").fill("6");
    await page.getByLabel("Next follow-up").fill("2030-01-15");
    await page.getByLabel("Notes").fill("Wants a quote for 5 pages");
    await page.getByLabel("Recording").setInputFiles({
      name: "call.mp3",
      mimeType: "audio/mpeg",
      buffer: Buffer.from("ID3 test recording bytes"),
    });
    await page.getByRole("button", { name: "Log call" }).click();
    await expect(page.getByText("Call logged with its recording.")).toBeVisible();

    await page.reload();
    await expect(page.getByText("Calls (1)")).toBeVisible();
    await expect(page.getByText("Wants a quote for 5 pages")).toBeVisible();
    await expect(page.getByText("6 min")).toBeVisible();
    // Picked up → contacted; the follow-up came from the call.
    await expect(page.getByText("Contacted", { exact: true })).toBeVisible();
    await expect(page.getByText(/15 Jan/).first()).toBeVisible();
    const recording = page.getByRole("link", { name: /Call recording .*call\.mp3/ });
    await expect(recording).toBeVisible();
    // The recording is served through the signed-URL route.
    const res = await page.request.get((await recording.getAttribute("href"))!, { maxRedirects: 0 });
    expect([302, 307]).toContain(res.status());

    // Not interested closes the lead.
    await page.getByLabel("Outcome").selectOption("not_interested");
    await page.getByRole("button", { name: "Log call" }).click();
    await expect(page.getByText("Call logged.")).toBeVisible();
    await page.reload();
    await expect(page.getByText("Not interested", { exact: true }).first()).toBeVisible();

    // Clean up: deleting the calls removes the recording's file too.
    for (let i = 0; i < 2; i++) {
      await page.locator("[data-call]").first().getByRole("button", { name: "Delete" }).click();
      await expect(page.locator("[data-call]")).toHaveCount(1 - i);
    }
    await page.goto("/pipeline");
    await kanbanCard(page, title).click();
    await dialog(page).getByRole("button", { name: "Delete" }).click();
    await expect(page.getByText(title)).toHaveCount(0);
  });

  test("validates a call", async ({ page }) => {
    const title = testName("Validation lead");
    await page.goto("/pipeline");
    await page.getByRole("button", { name: "New inquiry" }).click();
    await dialog(page).getByLabel("Title").fill(title);
    await saveAndSettle(page, "Create inquiry");
    await kanbanCard(page, title).getByRole("link", { name: "Calls →" }).click();
    await page.getByLabel("Duration (minutes)").fill("700");
    await page.getByRole("button", { name: "Log call" }).click();
    // The browser's max=600 stops it before the server sees it.
    await expect(page.getByText("Calls (0)")).toBeVisible();
    await page.goto("/pipeline");
    await kanbanCard(page, title).click();
    await dialog(page).getByRole("button", { name: "Delete" }).click();
    await expect(page.getByText(title)).toHaveCount(0);
  });
});
