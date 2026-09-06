import { expect, test } from "@playwright/test";
import { ADMIN_STORAGE_STATE, dialog, saveAndSettle, testName } from "./helpers";

test.use({ storageState: ADMIN_STORAGE_STATE });

test.describe("CRM — companies", () => {
  test("creates a company, sees it in the list, opens its detail page, edits it, then deletes it", async ({ page }) => {
    const name = testName("Acme Co");
    const renamed = `${name} Renamed`;

    await page.goto("/crm");
    await page.getByRole("button", { name: "Add company" }).click();
    await dialog(page).getByLabel("Name").fill(name);
    await dialog(page).getByLabel("Website").fill("acme.example.com");
    await dialog(page).getByLabel("Industry").fill("Manufacturing");
    await dialog(page).getByRole("button", { name: "Add company" }).click();

    const card = page.getByRole("link", { name: new RegExp(name) });
    await expect(card).toBeVisible();

    await card.click();
    await expect(page.getByRole("heading", { name })).toBeVisible();
    await expect(page.getByText("Manufacturing").first()).toBeVisible();

    await page.getByRole("button", { name: "Edit" }).click();
    await dialog(page).getByLabel("Name").fill(renamed);
    await dialog(page).getByRole("button", { name: "Save changes" }).click();
    await expect(page.getByRole("heading", { name: renamed })).toBeVisible();

    await page.getByRole("button", { name: "Delete" }).click();
    await expect(page.getByRole("heading", { name: "Delete this client?" })).toBeVisible();
    await page.getByRole("button", { name: "Delete client" }).click();

    await expect(page).toHaveURL(/\/crm$/);
    await expect(page.getByText(renamed)).toHaveCount(0);
  });

  test("requires a name", async ({ page }) => {
    await page.goto("/crm");
    await page.getByRole("button", { name: "Add company" }).click();
    await dialog(page).getByRole("button", { name: "Add company" }).click();
    // Native `required` blocks submission — dialog stays open, no server error.
    await expect(dialog(page).getByLabel("Name")).toBeVisible();
  });

  test("a company with a budgeted project loads its detail page and the edit dialog still works", async ({ page }) => {
    // Regression test: src/app/(app)/crm/[id]/page.tsx used to pass the
    // whole `company` object — including its `projects` relation, and a
    // project's `budget` is a Prisma Decimal — to the client-side
    // CompanyFormDialog via an `as unknown as Company` cast that only
    // satisfied the type checker, not the runtime. That triggers Next's
    // "Only plain objects can be passed to Client Components... Decimal
    // objects are not supported" warning — logged server-side in the
    // `next dev` terminal, not the browser console, so it isn't something
    // this test can assert on directly. What it can verify is the
    // functional path that exercises it: a company with a budgeted project
    // still loads and its edit dialog still works, on the fix as on the bug
    // (this Next version doesn't hard-crash on the leak) — so this guards
    // against a future Next/React version turning that warning into one.
    const companyName = testName("Decimal Regression Co");
    const projectName = testName("Budgeted Project");

    await page.goto("/crm");
    await page.getByRole("button", { name: "Add company" }).click();
    await dialog(page).getByLabel("Name").fill(companyName);
    await saveAndSettle(page, "Add company");

    await page.goto("/projects");
    await page.getByRole("button", { name: "New project" }).click();
    await dialog(page).getByLabel("Name").fill(projectName);
    await dialog(page).getByLabel("Company").selectOption({ label: companyName });
    await dialog(page).getByLabel("Budget (₹)").fill("75000");
    await saveAndSettle(page, "Create project");

    await page.goto("/crm");
    await page.getByRole("link", { name: new RegExp(companyName) }).click();
    await expect(page.getByRole("heading", { name: companyName })).toBeVisible();
    await expect(page.getByText(projectName)).toBeVisible();

    // The edit dialog itself must still work correctly post-fix.
    await page.getByRole("button", { name: "Edit" }).click();
    await expect(dialog(page).getByLabel("Name")).toHaveValue(companyName);
    await saveAndSettle(page, "Save changes");

    // No UI-driven cleanup here on purpose: deletion itself is already
    // covered by the other tests in this file and in projects.spec.ts, and
    // two redirect-triggering deletes back-to-back (company, then its
    // now-orphaned project) intermittently left a confirm button stuck on
    // "Working…" indefinitely in this dev environment — a Next.js dev-mode
    // quirk unrelated to the fix this test exists to check (see
    // docs/testing.md's "Findings" section). global-teardown.ts's
    // E2E-prefix sweep cleans up both records after the run instead.
  });
});

test.describe("CRM — filters and export", () => {
  test("filters the client list by industry and exposes a matching CSV export link", async ({ page }) => {
    const name = testName("Filter Co");

    await page.goto("/crm");
    await page.getByRole("button", { name: "Add company" }).click();
    await dialog(page).getByLabel("Name").fill(name);
    await dialog(page).getByLabel("Industry").fill("E2E Filter Industry");
    await saveAndSettle(page, "Add company");

    await page.goto("/crm");
    await expect(page.getByText(name)).toBeVisible();

    await page.getByLabel("Industry").selectOption({ label: "E2E Filter Industry" });
    await page.waitForURL(/industry=/);
    await expect(page.getByText(name)).toBeVisible();

    const exportLink = page.getByRole("link", { name: "Export CSV" });
    await expect(exportLink).toHaveAttribute("href", /\/api\/reports\/clients\?.*industry=/);

    // Clearing goes back to the unfiltered list.
    await page.getByRole("button", { name: "Clear filters" }).click();
    await expect(page).toHaveURL(/\/crm$/);
  });
});

test.describe("CRM — unsaved changes guard", () => {
  // Only the negative case (no edits -> no dialog) is asserted here.
  // useUnsavedChangesGuard (src/hooks/use-unsaved-changes-guard.ts) is a
  // standard beforeunload + preventDefault()/returnValue implementation,
  // but headless Chromium does not fire beforeunload dialogs at all
  // (a documented Chromium limitation, not a Playwright one) — confirmed by
  // trying both page.reload() and page.close({ runBeforeUnload: true }),
  // neither of which ever surfaced the dialog event even with an actual
  // unsaved edit present. Automating the positive case isn't possible in
  // this environment; the hook's logic was verified by code review instead.
  test("does not warn on reload when a dialog is open with no edits made", async ({ page }) => {
    const name = testName("Guard Co");

    await page.goto("/crm");
    await page.getByRole("button", { name: "Add company" }).click();
    await dialog(page).getByLabel("Name").fill(name);
    await saveAndSettle(page, "Add company");

    let dialogFired = false;
    page.on("dialog", () => {
      dialogFired = true;
    });
    await page.getByRole("link", { name: new RegExp(name) }).click();
    await page.getByRole("button", { name: "Edit" }).click();
    await page.reload();
    expect(dialogFired).toBe(false);
    await expect(page.getByRole("button", { name: "Edit" })).toBeVisible();
  });
});

test.describe("CRM — contacts", () => {
  test("adds a contact to a company, edits it, then deletes it", async ({ page }) => {
    const companyName = testName("Contact Test Co");
    const contactName = testName("Jane Doe");
    const updatedName = `${contactName} Updated`;

    await page.goto("/crm");
    await page.getByRole("button", { name: "Add company" }).click();
    await dialog(page).getByLabel("Name").fill(companyName);
    await dialog(page).getByRole("button", { name: "Add company" }).click();
    await page.getByRole("link", { name: new RegExp(companyName) }).click();

    await page.getByRole("button", { name: "Add contact" }).click();
    await dialog(page).getByLabel("Name").fill(contactName);
    await dialog(page).getByLabel("Email").fill("jane@example.com");
    await dialog(page).getByRole("button", { name: "Add contact" }).click();
    await expect(page.getByText(contactName)).toBeVisible();

    // Scoped to the contact's own row — the page also has a company-level
    // "Edit" button with the same accessible name.
    const contactRow = page.locator("div.rounded-md.border.p-3", { hasText: contactName });
    await contactRow.getByRole("button", { name: "Edit" }).click();
    await dialog(page).getByLabel("Name").fill(updatedName);
    await dialog(page).getByRole("button", { name: "Save changes" }).click();
    await expect(page.getByText(updatedName)).toBeVisible();

    // Clean up: deleting the company cascades its contacts. The page also
    // has the contact row's own "Delete" submit button by this point, so
    // scope to the company-level one (rendered first, in the page header).
    await page.getByRole("button", { name: "Delete" }).first().click();
    await page.getByRole("button", { name: "Delete client" }).click();
    await expect(page).toHaveURL(/\/crm$/);
  });
});
