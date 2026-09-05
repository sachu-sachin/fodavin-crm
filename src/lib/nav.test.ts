import { describe, expect, it } from "vitest";
import { ADMIN_NAV_ITEMS, NAV_ITEMS } from "./nav";
import { PERMISSIONS } from "./permissions";

describe("nav item permissions", () => {
  const known = new Set<string>(PERMISSIONS);

  it("every gated nav item references a real permission (catches typos that would silently hide it)", () => {
    for (const item of [...NAV_ITEMS, ...ADMIN_NAV_ITEMS]) {
      if (item.permission) expect(known.has(item.permission)).toBe(true);
    }
  });

  it("has unique hrefs across the combined nav", () => {
    const hrefs = [...NAV_ITEMS, ...ADMIN_NAV_ITEMS].map((i) => i.href);
    expect(new Set(hrefs).size).toBe(hrefs.length);
  });

  it("the dashboard link is always visible (no permission gate)", () => {
    expect(NAV_ITEMS.find((i) => i.href === "/")?.permission).toBeUndefined();
  });
});
