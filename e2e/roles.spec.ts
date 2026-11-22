import { expect, test } from "@playwright/test";
import { ADMIN_STORAGE_STATE, testName } from "./helpers";

test.use({ storageState: ADMIN_STORAGE_STATE });

// These forms submit via a bare `startTransition` or native form action with
// no `saveAndSettle`-style close-and-wait signal to hook into (there's no
// dialog closing to await) — just a settle pause before trusting a reload.
async function settle(page: import("@playwright/test").Page) {
  await page.waitForLoadState("networkidle");
  await page.waitForTimeout(1500);
}

test.describe("Roles (admin)", () => {
  test("creates a role, grants a permission, then deletes it", async ({ page }) => {
    const roleName = testName("Junior Dev");

    await page.goto("/roles");
    await page.getByLabel("Role name").fill(roleName);
    await page.getByRole("button", { name: "Add role" }).click();
    await settle(page);

    const card = page.locator(".rounded-xl", { hasText: roleName }).first();
    await expect(card).toBeVisible();

    await card.getByRole("button", { name: "Edit permissions" }).click();
    await card.getByText("View task boards").click();
    await card.getByRole("button", { name: "Save permissions" }).click();
    await settle(page);

    await page.reload();
    const reopened = page.locator(".rounded-xl", { hasText: roleName }).first();
    await expect(reopened.getByText("1 permission")).toBeVisible();

    await reopened.getByRole("button", { name: "Delete" }).click();
    await expect(page.getByRole("heading", { name: "Delete this role?" })).toBeVisible();
    await page.getByRole("button", { name: "Delete role" }).click();
    await expect(page.getByText(roleName)).toHaveCount(0);
  });

  test("applying a preset template fills in its permission set", async ({ page }) => {
    const roleName = testName("From Preset");

    await page.goto("/roles");
    await page.getByLabel("Role name").fill(roleName);
    await page.getByRole("button", { name: "Add role" }).click();
    await settle(page);

    const card = page.locator(".rounded-xl", { hasText: roleName }).first();
    await card.getByRole("button", { name: "Edit permissions" }).click();
    await card
      .getByRole("combobox")
      .selectOption({ label: "Accounts — Money only — invoicing, payments and outstanding balances." });
    await card.getByRole("button", { name: "Apply preset" }).click();
    await settle(page);

    await page.reload();
    const reopened = page.locator(".rounded-xl", { hasText: roleName }).first();
    // The Accounts template grants 10 permissions (see permissions.ts).
    await expect(reopened.getByText("10 permissions")).toBeVisible();

    await reopened.getByRole("button", { name: "Delete" }).click();
    await page.getByRole("button", { name: "Delete role" }).click();
  });

  test("rejects a duplicate role name", async ({ page }) => {
    const roleName = testName("Duplicate Role");

    await page.goto("/roles");
    await page.getByLabel("Role name").fill(roleName);
    await page.getByRole("button", { name: "Add role" }).click();
    // Exact: the 'Role "…" created.' toast also contains the name, and
    // whether it's on screen at the same moment as the card is timing.
    await expect(page.getByText(roleName, { exact: true })).toBeVisible();
    // React 19 resets a <form action={fn}> on a successful submission —
    // without a settle pause here, the reset can land after this test's own
    // re-fill of the same field, wiping it back to empty before the second
    // "Add role" click.
    await settle(page);

    await page.getByLabel("Role name").fill(roleName);
    await page.getByRole("button", { name: "Add role" }).click();
    await expect(page.getByText("That role already exists.")).toBeVisible();

    const card = page.locator(".rounded-xl", { hasText: roleName }).first();
    await card.getByRole("button", { name: "Delete" }).click();
    await page.getByRole("button", { name: "Delete role" }).click();
  });
});
