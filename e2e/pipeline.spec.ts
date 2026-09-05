import { expect, test } from "@playwright/test";
import { ADMIN_STORAGE_STATE, dialog, kanbanCard, saveAndSettle, testName } from "./helpers";

test.use({ storageState: ADMIN_STORAGE_STATE });

test.describe("Pipeline — inquiries", () => {
  test("creates an inquiry, moves its stage via the edit dialog, then deletes it", async ({ page }) => {
    const title = testName("Website revamp");

    await page.goto("/pipeline");
    await page.getByRole("button", { name: "New inquiry" }).click();
    await dialog(page).getByLabel("Title").fill(title);
    await dialog(page).getByLabel("Est. budget (₹)").fill("50000");
    await saveAndSettle(page, "Create inquiry");

    await expect(page.getByText(title).first()).toBeVisible();

    // Move it via the edit dialog's Stage field (more reliable than
    // simulating the Kanban drag — see the dedicated drag test below for
    // that interaction path instead).
    await kanbanCard(page, title).click();
    await dialog(page).getByLabel("Stage").selectOption("contacted");
    await saveAndSettle(page, "Save changes");

    // Re-open to confirm the stage actually persisted, then delete.
    await kanbanCard(page, title).click();
    await expect(dialog(page).getByLabel("Stage")).toHaveValue("contacted");
    await dialog(page).getByRole("button", { name: "Delete" }).click();
    await expect(page.getByText(title)).toHaveCount(0);
  });

  test("clears the follow-up date and requires a lost reason once marked Lost", async ({ page }) => {
    const title = testName("Lost deal");

    await page.goto("/pipeline");
    await page.getByRole("button", { name: "New inquiry" }).click();
    await dialog(page).getByLabel("Title").fill(title);
    await dialog(page).getByLabel("Next follow-up").fill("2027-01-15");
    await saveAndSettle(page, "Create inquiry");
    await expect(page.getByText(title).first()).toBeVisible();

    await kanbanCard(page, title).click();
    await dialog(page).getByLabel("Stage").selectOption("lost");
    // The follow-up field is hidden once a stage is closed; lost_reason appears instead.
    await expect(dialog(page).getByLabel("Next follow-up")).toHaveCount(0);
    await dialog(page).getByLabel("Why was it lost?").fill("Budget too high");
    await saveAndSettle(page, "Save changes");

    // Regression check: reopening the *same* Kanban card (no page reload)
    // must show the value just saved. This dialog's component instance
    // persists across saves — only `open` toggles — so its uncontrolled
    // `defaultValue` fields would otherwise still show pre-save data here,
    // and a second save would silently overwrite the real value with that
    // stale one (see the `key={inquiry?.updated_at}` fix on the Dialog).
    await kanbanCard(page, title).click();
    await expect(dialog(page).getByLabel("Why was it lost?")).toHaveValue("Budget too high");
    await dialog(page).getByRole("button", { name: "Delete" }).click();
    await expect(page.getByText(title)).toHaveCount(0);
  });

  test("converts a won inquiry into a project", async ({ page }) => {
    const title = testName("Convert me");

    await page.goto("/pipeline");
    await page.getByRole("button", { name: "New inquiry" }).click();
    await dialog(page).getByLabel("Title").fill(title);
    await saveAndSettle(page, "Create inquiry");
    await expect(page.getByText(title).first()).toBeVisible();

    await kanbanCard(page, title).click();
    await dialog(page).getByRole("button", { name: "Convert to project →" }).click();

    await expect(page).toHaveURL(/\/projects\/[^/]+$/);
    await expect(page.getByRole("heading", { name: title })).toBeVisible();

    // The inquiry itself survives (marked won), separate from the new
    // project — both share the E2E-prefixed title/name, so teardown's
    // project + inquiry sweeps each clean up their own half.
    await page.goto("/pipeline");
    await expect(page.getByText(title).first()).toBeVisible();
    await kanbanCard(page, title).click();
    await expect(dialog(page).getByLabel("Stage")).toHaveValue("won");
    await dialog(page).getByRole("button", { name: "Delete" }).click();
  });

  test("real drag-and-drop between Kanban columns also moves the stage", async ({ page }) => {
    const title = testName("Drag me");

    await page.goto("/pipeline");
    await page.getByRole("button", { name: "New inquiry" }).click();
    await dialog(page).getByLabel("Title").fill(title);
    await saveAndSettle(page, "Create inquiry");
    await expect(page.getByText(title).first()).toBeVisible();

    const contactedColumn = page.locator("div.rounded-lg.border.bg-muted\\/30", {
      has: page.getByText("Contacted", { exact: true }),
    });
    await kanbanCard(page, title).dragTo(contactedColumn);
    await page.waitForLoadState("networkidle");

    // Confirm via the edit dialog (source of truth) rather than trusting
    // the drag's own optimistic UI update alone.
    await kanbanCard(page, title).click();
    await expect(dialog(page).getByLabel("Stage")).toHaveValue("contacted");
    await dialog(page).getByRole("button", { name: "Delete" }).click();
  });
});
