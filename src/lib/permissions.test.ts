import { describe, expect, it } from "vitest";
import {
  allPermissions,
  expandPermissions,
  isPermission,
  PERMISSION_GROUPS,
  PERMISSION_LABELS,
  PERMISSIONS,
  ROLE_TEMPLATES,
  type Permission,
} from "./permissions";

describe("isPermission", () => {
  it("accepts every value in the catalogue", () => {
    for (const p of PERMISSIONS) expect(isPermission(p)).toBe(true);
  });

  it("rejects unknown strings", () => {
    expect(isPermission("clients.hack")).toBe(false);
    expect(isPermission("")).toBe(false);
    expect(isPermission("CLIENTS.VIEW")).toBe(false);
  });
});

describe("expandPermissions", () => {
  it("returns an empty set for an empty grant list", () => {
    expect(expandPermissions([])).toEqual(new Set());
  });

  it("drops unrecognised permission strings", () => {
    expect(expandPermissions(["not.a.permission"])).toEqual(new Set());
  });

  it("adds the granted permission itself", () => {
    expect(expandPermissions(["team.view"])).toEqual(new Set(["team.view"]));
  });

  it("expands a one-level implication", () => {
    expect(expandPermissions(["clients.manage"])).toEqual(
      new Set(["clients.manage", "clients.view"]),
    );
  });

  it("expands a two-level (transitive) implication", () => {
    // clients.delete -> [clients.view, clients.manage] per IMPLIES, and does
    // not rely on clients.manage's own implication being re-expanded.
    expect(expandPermissions(["clients.delete"])).toEqual(
      new Set(["clients.delete", "clients.view", "clients.manage"]),
    );
  });

  it("expands timesheet.manage_all through to timesheet.log", () => {
    expect(expandPermissions(["timesheet.manage_all"])).toEqual(
      new Set(["timesheet.manage_all", "timesheet.view_all", "timesheet.log"]),
    );
  });

  it("merges implied permissions across multiple grants without duplicates", () => {
    const result = expandPermissions(["clients.manage", "clients.view"]);
    expect(result).toEqual(new Set(["clients.manage", "clients.view"]));
  });

  it("ignores permissions with no implications", () => {
    expect(expandPermissions(["settings.manage"])).toEqual(
      new Set(["settings.manage"]),
    );
  });
});

describe("allPermissions", () => {
  it("contains every permission in the catalogue, and only those", () => {
    expect(allPermissions()).toEqual(new Set(PERMISSIONS));
  });

  it("returns a fresh Set each call (not a shared mutable reference)", () => {
    const a = allPermissions();
    a.delete("clients.view");
    expect(allPermissions().has("clients.view")).toBe(true);
  });
});

describe("PERMISSION_GROUPS / PERMISSION_LABELS consistency", () => {
  it("every permission in the catalogue appears in exactly one group", () => {
    const flat = PERMISSION_GROUPS.flatMap((g) => g.permissions.map((p) => p.value));
    expect(new Set(flat)).toEqual(new Set(PERMISSIONS));
    expect(flat.length).toBe(PERMISSIONS.length);
  });

  it("has a label for every permission", () => {
    for (const p of PERMISSIONS) {
      expect(PERMISSION_LABELS[p]).toBeTruthy();
    }
  });
});

describe("ROLE_TEMPLATES", () => {
  it("only reference permissions that exist in the catalogue", () => {
    const known = new Set<string>(PERMISSIONS);
    for (const template of ROLE_TEMPLATES) {
      for (const p of template.permissions) {
        expect(known.has(p)).toBe(true);
      }
    }
  });

  it("has no duplicate permissions within a single template", () => {
    for (const template of ROLE_TEMPLATES) {
      expect(new Set(template.permissions).size).toBe(template.permissions.length);
    }
  });

  it("has unique template names", () => {
    const names = ROLE_TEMPLATES.map((t) => t.name);
    expect(new Set(names).size).toBe(names.length);
  });

  it("the Admin template is flagged is_admin and grants everything", () => {
    const admin = ROLE_TEMPLATES.find((t) => t.name === "Admin");
    expect(admin?.is_admin).toBe(true);
    expect(new Set(admin?.permissions)).toEqual(new Set(PERMISSIONS));
  });

  it("no non-admin template grants finance or admin-tier permissions unless explicitly listed", () => {
    // Delivery-only templates (developers, designer, QA) must not see money.
    const deliveryOnly = ["Frontend Developer", "Backend Developer", "UI/UX Designer", "QA Engineer"];
    const sensitive: Permission[] = ["finance.view", "finance.manage", "roles.manage", "employees.manage"];
    for (const name of deliveryOnly) {
      const template = ROLE_TEMPLATES.find((t) => t.name === name)!;
      for (const perm of sensitive) {
        expect(template.permissions).not.toContain(perm);
      }
    }
  });
});
