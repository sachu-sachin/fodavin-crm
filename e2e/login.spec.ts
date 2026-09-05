import { expect, test } from "@playwright/test";

// These tests never create, edit, or delete a real record — see
// docs/testing.md for why E2E is scoped this way until there's a dedicated
// test Supabase project.

test.describe("Login page", () => {
  test("renders the sign-in form", async ({ page }) => {
    await page.goto("/login");

    // Note: the title renders via shadcn's CardTitle, which is a plain <div>
    // with no heading role — see docs/testing.md's "Findings" section. Text
    // match here, not getByRole("heading"), until that's fixed.
    await expect(page.getByText("Fodavin Business OS")).toBeVisible();
    await expect(page.getByLabel("Email")).toBeVisible();
    await expect(page.getByLabel("Password")).toBeVisible();
    await expect(page.getByRole("button", { name: "Sign in" })).toBeVisible();
    await expect(page.getByText("Accounts are created by an administrator.")).toBeVisible();
  });

  test("blocks submission when email and password are empty", async ({ page }) => {
    await page.goto("/login");
    await page.getByRole("button", { name: "Sign in" }).click();

    // Native HTML5 `required` validation stops the form before any network
    // call, so we're still on /login with no server-side error rendered.
    await expect(page).toHaveURL(/\/login$/);
    const validationMessage = await page
      .getByLabel("Email")
      .evaluate((el: HTMLInputElement) => el.validationMessage);
    expect(validationMessage).not.toBe("");
  });

  test("shows a generic error for invalid credentials (no user enumeration)", async ({ page }) => {
    await page.goto("/login");

    await page.getByLabel("Email").fill(`no-such-user-${Date.now()}@example.com`);
    await page.getByLabel("Password").fill("definitely-wrong-password");
    await page.getByRole("button", { name: "Sign in" }).click();

    await expect(page.getByText("Invalid email or password.")).toBeVisible();
    // Still on /login — a failed attempt must never redirect anywhere.
    await expect(page).toHaveURL(/\/login$/);
  });

  test("shows the deactivated-account notice when linked from a forced sign-out", async ({ page }) => {
    await page.goto("/login?reason=deactivated");

    await expect(
      page.getByText("Your account has been deactivated. Contact an administrator if this is unexpected."),
    ).toBeVisible();
  });

  test("shows no notice for an unrecognised reason param", async ({ page }) => {
    await page.goto("/login?reason=something-unexpected");

    await expect(page.getByText("Your account has been deactivated")).not.toBeVisible();
  });
});
