import { cache } from "react";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { VERIFIED_USER_HEADER } from "@/lib/supabase/verified-user-header";
import { prisma } from "@/lib/prisma";
import type { Permission } from "@/lib/permissions";
import { effectiveAccess, ROLES_INCLUDE, rolesOf } from "@/lib/roles";
import type { ProfileWithRole } from "@/lib/types";

export interface SessionProfile {
  userId: string;
  profile: ProfileWithRole | null;
  isAdmin: boolean;
  /** Every role the person holds: the main one first, then additional ones. */
  roleIds: string[];
  /** Effective permissions — every permission when isAdmin. */
  permissions: Set<Permission>;
}

/**
 * Identity comes from Supabase Auth; the profile, role and permissions come
 * from Prisma.
 *
 * A deactivated employee is force-signed-out rather than served: deactivation
 * bans the auth user, but an already-issued access token stays valid until it
 * expires, so this is what closes that window.
 */
export const getSessionProfile = cache(
  async (): Promise<SessionProfile | null> => {
    // The middleware already made one real network call to Supabase's auth
    // server (getUser()) for this exact request and, only once verified,
    // forwarded the id via this header — see updateSession in
    // src/lib/supabase/middleware.ts, which strips any client-supplied copy
    // of this header before that point, so it is never attacker-controlled.
    // Trusting it here avoids paying for a second identical round trip.
    // Falls back to a real getUser() call if it's ever missing (e.g. a
    // context that doesn't go through that middleware).
    const verifiedUserId = (await headers()).get(VERIFIED_USER_HEADER);

    let userId: string;
    if (verifiedUserId) {
      userId = verifiedUserId;
    } else {
      const supabase = await createClient();
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) return null;
      userId = user.id;
    }

    const profile = await prisma.profile.findUnique({
      where: { id: userId },
      include: ROLES_INCLUDE,
    });

    if (profile && !profile.is_active) {
      redirect("/auth/signout?reason=deactivated");
    }

    // Permissions are the union of every role held; admin if any role is.
    const roles = profile ? rolesOf(profile) : [];
    const { isAdmin, permissions } = effectiveAccess(roles);

    return {
      userId,
      profile: profile as unknown as ProfileWithRole | null,
      isAdmin,
      roleIds: roles.map((r) => r.id),
      permissions,
    };
  },
);

/** Does this session hold the permission? */
export function can(
  session: SessionProfile | null,
  permission: Permission,
): boolean {
  return !!session?.permissions.has(permission);
}

/** True if the session holds at least one of the permissions. */
export function canAny(
  session: SessionProfile | null,
  permissions: readonly Permission[],
): boolean {
  return permissions.some((p) => can(session, p));
}

/** For admin-only pages/actions: redirects non-admins away. */
export async function requireAdmin(): Promise<SessionProfile> {
  const session = await getSessionProfile();
  if (!session) redirect("/login");
  if (!session.isAdmin) redirect("/");
  return session;
}

/**
 * Page guard. Redirects to the dashboard when the permission is missing, so a
 * bookmarked or hand-typed URL can't reach a screen the role shouldn't see.
 */
export async function requirePermission(
  permission: Permission,
): Promise<SessionProfile> {
  const session = await getSessionProfile();
  if (!session) redirect("/login");
  if (!can(session, permission)) redirect("/");
  return session;
}

export const DENIED_MESSAGE = "You don't have permission to do that.";

/**
 * Server-action guard. Redirects if signed out; returns null if the session
 * lacks the permission, so callers can no-op or return an error uniformly.
 *
 * This — not the hidden buttons — is the actual access boundary. Every
 * mutating action must call it.
 */
export async function authorize(
  permission: Permission,
): Promise<SessionProfile | null> {
  const session = await getSessionProfile();
  if (!session) redirect("/login");
  return can(session, permission) ? session : null;
}
