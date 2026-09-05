import path from "node:path";
import { expect, type Page } from "@playwright/test";

/** Storage state file written by global-setup.ts, reused by every authenticated spec. */
export const ADMIN_STORAGE_STATE = path.join(__dirname, ".auth/admin.json");

/**
 * Scopes to the currently-open Dialog. Needed because a dialog's submit
 * button often shares an accessible name with whatever opened it (e.g.
 * "Add company" is both the page-level trigger button and, once open, the
 * dialog's own submit button) — `page.getByRole("button", { name: ... })`
 * alone would be ambiguous once the dialog is open.
 */
export const dialog = (page: Page) => page.getByRole("dialog");

/**
 * Opens a Kanban card's edit dialog (inquiry/task/social-post boards).
 * These cards render with `nativeTrigger={false}` — clicking descendant
 * text (e.g. the title `<p>`) does not open the dialog, only a click that
 * lands on the `draggable` container itself does. Click the container, not
 * the text, when opening one of these.
 */
export const kanbanCard = (page: Page, text: string) =>
  page.locator("div[draggable='true']", { hasText: text });

/**
 * Clicks a dialog's submit button, waits for the dialog to close, then for
 * the network to go idle. `revalidatePath` triggers an async RSC re-fetch
 * that lands slightly after the dialog closes — reopening the same card
 * immediately (as a script can, but a human reacting to the dialog closing
 * generally can't) can race that re-fetch and see a dialog that flashes
 * open then immediately resets. Use this instead of a bare `.click()`
 * whenever the next step reopens the same record.
 */
export async function saveAndSettle(page: Page, buttonName: string | RegExp) {
  await dialog(page).getByRole("button", { name: buttonName }).click();
  await expect(dialog(page)).toHaveCount(0);
  await page.waitForLoadState("networkidle");
  // `networkidle` covers the revalidation fetch itself, but not the brief
  // client-side reconciliation after it lands — reopening faster than that
  // (only a script does; a human's reaction time already clears it) can
  // catch the update mid-flight. A buffer trades a little test time for not
  // chasing that race; updateInquiry alone has been observed taking ~1.5-2.4s
  // under Turbopack dev, so this needs real margin above that.
  await page.waitForTimeout(3000);
}

/**
 * All E2E-created records are named with this prefix, so:
 *  - a human glancing at the test DB can tell what's test data,
 *  - global-teardown.ts can find and purge anything a failed test left behind,
 *  - parallel-safe if that's ever turned back on (each call is unique).
 */
const RUN_ID = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
let counter = 0;

export function testName(label: string): string {
  counter += 1;
  return `E2E ${RUN_ID}-${counter} ${label}`;
}

export const E2E_PREFIX = "E2E ";
