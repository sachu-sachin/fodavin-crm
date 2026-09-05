import { expect, test } from "@playwright/test";
import { ADMIN_STORAGE_STATE } from "./helpers";

test.use({ storageState: ADMIN_STORAGE_STATE });

test.describe("Dashboard", () => {
  test("renders the summary cards after login", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByRole("heading", { name: "Dashboard" })).toBeVisible();
    // .last(): the sidebar nav also has a plain "Clients" link; the stat
    // card link (with its count appended, e.g. "Clients 0") renders after it.
    await expect(page.getByRole("link", { name: /Clients/ }).last()).toBeVisible();
    await expect(page.getByRole("link", { name: /Open Inquiries/ }).last()).toBeVisible();
    await expect(page.getByRole("link", { name: /Active Projects/ }).last()).toBeVisible();
    await expect(page.getByRole("link", { name: /Open Tasks/ }).last()).toBeVisible();
    await expect(page.getByText("My tasks this week")).toBeVisible();
  });

  test("the user menu opens without crashing", async ({ page }) => {
    // Regression test: DropdownMenuLabel wraps Base UI's Menu.GroupLabel,
    // which throws ("MenuGroupContext is missing") unless it's rendered
    // inside a Menu.Group — unlike Radix, Base UI has no standalone label
    // primitive. UserMenu used it directly under DropdownMenuContent with
    // no group around it, crashing the whole menu on open (see
    // docs/testing.md's Findings).
    const pageErrors: string[] = [];
    page.on("pageerror", (err) => pageErrors.push(err.message));

    await page.goto("/");
    await page.getByRole("button", { name: "PF" }).click();
    await expect(page.getByText("Playwright Fixture Admin")).toBeVisible();
    await expect(page.getByText("e2e-admin@fodavin-test.local")).toBeVisible();
    await expect(page.getByRole("button", { name: "Sign out" })).toBeVisible();

    expect(pageErrors).toEqual([]);
  });
});
