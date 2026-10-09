import { describe, expect, it } from "vitest";
import {
  announcementStatus,
  isForRole,
  liveForRoleWhere,
  sortForFeed,
} from "./announcements";

const now = new Date("2026-03-10T06:00:00Z");

describe("announcementStatus", () => {
  it("is scheduled before its publish time", () => {
    expect(
      announcementStatus({ publish_at: "2026-03-10T07:00:00Z", expires_at: null }, now),
    ).toBe("scheduled");
  });

  it("is live from its publish time with no expiry", () => {
    expect(announcementStatus({ publish_at: now, expires_at: null }, now)).toBe("live");
  });

  it("is live until its expiry, and expired from that instant", () => {
    const a = { publish_at: "2026-03-01T00:00:00Z", expires_at: "2026-03-10T06:00:01Z" };
    expect(announcementStatus(a, now)).toBe("live");
    expect(announcementStatus({ ...a, expires_at: now }, now)).toBe("expired");
  });
});

describe("isForRole", () => {
  it("an empty audience is everyone, including people with no role", () => {
    expect(isForRole({ audience_role_ids: [] }, "r1")).toBe(true);
    expect(isForRole({ audience_role_ids: [] }, null)).toBe(true);
  });

  it("a role-limited audience includes only those roles", () => {
    const a = { audience_role_ids: ["r1", "r2"] };
    expect(isForRole(a, "r2")).toBe(true);
    expect(isForRole(a, "r3")).toBe(false);
    expect(isForRole(a, null)).toBe(false);
  });
});

describe("liveForRoleWhere", () => {
  it("filters to live and addressed to everyone or the role", () => {
    expect(liveForRoleWhere("r1", now)).toEqual({
      publish_at: { lte: now },
      AND: [
        { OR: [{ expires_at: null }, { expires_at: { gt: now } }] },
        {
          OR: [
            { audience_role_ids: { isEmpty: true } },
            { audience_role_ids: { has: "r1" } },
          ],
        },
      ],
    });
  });

  it("without a role, matches only everyone-announcements", () => {
    const where = liveForRoleWhere(null, now);
    expect(where.AND).toContainEqual({ OR: [{ audience_role_ids: { isEmpty: true } }] });
  });
});

describe("sortForFeed", () => {
  it("puts pinned first, then newest first, without mutating the input", () => {
    const items = [
      { id: "old", pinned: false, publish_at: "2026-03-01T00:00:00Z" },
      { id: "new", pinned: false, publish_at: "2026-03-09T00:00:00Z" },
      { id: "pinned-old", pinned: true, publish_at: "2026-02-01T00:00:00Z" },
    ];
    expect(sortForFeed(items).map((i) => i.id)).toEqual(["pinned-old", "new", "old"]);
    expect(items[0].id).toBe("old");
  });
});
