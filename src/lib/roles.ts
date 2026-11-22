// Multi-role and reporting-line helpers. Pure functions, no database access,
// so they are shared by the session, the digest job and the tests.

import {
  allPermissions,
  expandPermissions,
  type Permission,
} from "@/lib/permissions";

export interface RoleGrant {
  is_admin: boolean;
  permissions: readonly string[];
}

/**
 * The prisma `include` that loads everything needed to work out someone's
 * roles: the main one and any additional ones.
 */
export const ROLES_INCLUDE = {
  role: true,
  extra_roles: { include: { role: true } },
} as const;

interface WithRoles<R> {
  role_id: string | null;
  role: R | null;
  extra_roles?: { role: R }[] | null;
}

/** Main role first, then the additional ones, without duplicates. */
export function rolesOf<R extends { id: string }>(p: WithRoles<R>): R[] {
  const seen = new Set<string>();
  const out: R[] = [];
  for (const r of [p.role, ...(p.extra_roles ?? []).map((x) => x.role)]) {
    if (r && !seen.has(r.id)) {
      seen.add(r.id);
      out.push(r);
    }
  }
  return out;
}

export function roleIdsOf<R extends { id: string }>(p: WithRoles<R>): string[] {
  return rolesOf(p).map((r) => r.id);
}

/**
 * Effective access across all of a person's roles: admin if any role is, and
 * otherwise the union of every role's permissions (with implied reads).
 */
export function effectiveAccess(roles: readonly RoleGrant[]): {
  isAdmin: boolean;
  permissions: Set<Permission>;
} {
  if (roles.some((r) => r.is_admin)) {
    return { isAdmin: true, permissions: allPermissions() };
  }
  return {
    isAdmin: false,
    permissions: expandPermissions(roles.flatMap((r) => r.permissions)),
  };
}

/**
 * Would making `leadId` the lead of `personId` create a loop (A reports to B
 * who reports to A)? `leadOf` maps each person to their current lead.
 */
export function wouldCreateCycle(
  personId: string,
  leadId: string | null,
  leadOf: ReadonlyMap<string, string | null>,
): boolean {
  const seen = new Set<string>();
  let cursor = leadId;
  while (cursor) {
    if (cursor === personId) return true;
    if (seen.has(cursor)) return false; // an existing loop elsewhere; not ours
    seen.add(cursor);
    cursor = leadOf.get(cursor) ?? null;
  }
  return false;
}
