import { describe, expect, it } from "vitest";
import { effectiveAccess, roleIdsOf, rolesOf, wouldCreateCycle } from "./roles";

const dev = { id: "dev", is_admin: false, permissions: ["tasks.manage"] };
const video = { id: "video", is_admin: false, permissions: ["social.view"] };
const admin = { id: "admin", is_admin: true, permissions: [] };

describe("rolesOf", () => {
  it("puts the main role first and drops duplicates", () => {
    const p = {
      role_id: "dev",
      role: dev,
      extra_roles: [{ role: video }, { role: dev }],
    };
    expect(rolesOf(p).map((r) => r.id)).toEqual(["dev", "video"]);
    expect(roleIdsOf(p)).toEqual(["dev", "video"]);
  });

  it("handles no main role and missing extras", () => {
    expect(roleIdsOf({ role_id: null, role: null })).toEqual([]);
    expect(
      roleIdsOf({ role_id: null, role: null, extra_roles: [{ role: video }] }),
    ).toEqual(["video"]);
  });
});

describe("effectiveAccess", () => {
  it("unions permissions across roles, with implied reads", () => {
    const { isAdmin, permissions } = effectiveAccess([dev, video]);
    expect(isAdmin).toBe(false);
    expect(permissions.has("tasks.manage")).toBe(true);
    expect(permissions.has("tasks.view")).toBe(true);
    expect(permissions.has("social.view")).toBe(true);
    expect(permissions.has("finance.view")).toBe(false);
  });

  it("is admin when any role is", () => {
    const { isAdmin, permissions } = effectiveAccess([dev, admin]);
    expect(isAdmin).toBe(true);
    expect(permissions.has("roles.manage")).toBe(true);
  });

  it("gives nothing with no roles", () => {
    expect(effectiveAccess([]).permissions.size).toBe(0);
  });
});

describe("wouldCreateCycle", () => {
  const leadOf = new Map<string, string | null>([
    ["a", "b"],
    ["b", "c"],
    ["c", null],
  ]);

  it("rejects being your own lead", () => {
    expect(wouldCreateCycle("a", "a", leadOf)).toBe(true);
  });

  it("rejects a loop through the chain", () => {
    expect(wouldCreateCycle("c", "a", leadOf)).toBe(true);
  });

  it("allows a normal chain and clearing the lead", () => {
    expect(wouldCreateCycle("d", "a", leadOf)).toBe(false);
    expect(wouldCreateCycle("a", null, leadOf)).toBe(false);
  });

  it("stops on a pre-existing loop elsewhere", () => {
    const looped = new Map<string, string | null>([
      ["x", "y"],
      ["y", "x"],
    ]);
    expect(wouldCreateCycle("z", "x", looped)).toBe(false);
  });
});
