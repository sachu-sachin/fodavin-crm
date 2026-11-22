"use server";

import { revalidatePath } from "next/cache";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { authorize, DENIED_MESSAGE } from "@/lib/auth";
import { isPermission, ROLE_TEMPLATES } from "@/lib/permissions";
import { createAdminClient } from "@/lib/supabase/admin";
import { wouldCreateCycle } from "@/lib/roles";

export type ActionState = { error?: string; success?: string };

// -- Employees ----------------------------------------------------------------

export async function createEmployee(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  if (!(await authorize("employees.manage"))) return { error: DENIED_MESSAGE };

  const email = String(formData.get("email") ?? "").trim();
  const password = String(formData.get("password") ?? "");
  const fullName = String(formData.get("full_name") ?? "").trim();
  const roleId = String(formData.get("role_id") ?? "").trim();
  const extraRoleIds = formData.getAll("extra_role_ids").map(String);
  const leadId = String(formData.get("reports_to_id") ?? "") || null;

  if (!email || !password || !fullName) {
    return { error: "Name, email and password are required." };
  }
  if (password.length < 8) {
    return { error: "Password must be at least 8 characters." };
  }

  // The auth user must be created via Supabase's Admin API. A DB trigger
  // then creates the matching profile row (reading full_name + role_id here).
  const admin = createAdminClient();
  const { data, error } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { full_name: fullName, role_id: roleId || null },
  });

  if (error) return { error: error.message };

  // The trigger has created the profile by now (same transaction as the auth
  // user), so the extra roles and the lead can be set straight away.
  const newId = data?.user?.id;
  if (newId) {
    await replaceExtraRoles(newId, extraRoleIds);
    if (leadId) {
      const leadError = await setLead(newId, leadId);
      if (leadError) {
        return { error: `Account created, but ${leadError.toLowerCase()}` };
      }
    }
  }

  revalidatePath("/employees");
  revalidatePath("/team");
  return { success: `${fullName} can now sign in with their email + password.` };
}

export async function updateEmployeeRole(formData: FormData): Promise<void> {
  if (!(await authorize("employees.manage"))) return;
  const id = String(formData.get("id") ?? "");
  const roleId = String(formData.get("role_id") ?? "") || null;

  await prisma.profile.update({ where: { id }, data: { role_id: roleId } });
  revalidatePath("/employees");
}

/**
 * Replace someone's additional roles. Ids that aren't real roles are dropped,
 * so a tampered form can't attach anything else.
 */
async function replaceExtraRoles(profileId: string, requested: string[]) {
  const unique = [...new Set(requested.filter(Boolean))];
  const valid = unique.length
    ? (
        await prisma.role.findMany({
          where: { id: { in: unique } },
          select: { id: true },
        })
      ).map((r) => r.id)
    : [];

  await prisma.$transaction([
    prisma.profileRole.deleteMany({ where: { profile_id: profileId } }),
    ...(valid.length
      ? [
          prisma.profileRole.createMany({
            data: valid.map((role_id) => ({ profile_id: profileId, role_id })),
          }),
        ]
      : []),
  ]);
}

export async function updateEmployeeExtraRoles(formData: FormData): Promise<void> {
  if (!(await authorize("employees.manage"))) return;
  const id = String(formData.get("id") ?? "");
  if (!id) return;

  await replaceExtraRoles(id, formData.getAll("extra_role_ids").map(String));
  revalidatePath("/employees");
  revalidatePath("/team");
}

/** Set (or clear, with null) someone's managing lead. Returns an error message. */
async function setLead(profileId: string, leadId: string | null): Promise<string | null> {
  if (leadId) {
    const people = await prisma.profile.findMany({
      select: { id: true, is_active: true, reports_to_id: true },
    });
    const lead = people.find((p) => p.id === leadId);
    if (!lead || !lead.is_active) return "That lead isn't an active employee.";
    const leadOf = new Map(people.map((p) => [p.id, p.reports_to_id]));
    if (wouldCreateCycle(profileId, leadId, leadOf)) {
      return "Someone can't report to themselves or to a person who reports to them.";
    }
  }
  await prisma.profile.update({
    where: { id: profileId },
    data: { reports_to_id: leadId },
  });
  return null;
}

export async function updateEmployeeLead(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  if (!(await authorize("employees.manage"))) return { error: DENIED_MESSAGE };
  const id = String(formData.get("id") ?? "");
  const leadId = String(formData.get("reports_to_id") ?? "") || null;
  if (!id) return { error: "Unknown employee." };

  const error = await setLead(id, leadId);
  if (error) return { error };

  revalidatePath("/employees");
  revalidatePath("/team");
  return { success: leadId ? "Reporting lead updated." : "Reporting lead removed." };
}

// Supabase has no "disable user" flag — a long ban is the supported way to
// lock an account out and revoke its refresh tokens.
const BAN_FOREVER = "876000h"; // 100 years
const BAN_NONE = "none";

/**
 * Activate / deactivate an employee.
 *
 * Flips `is_active` (which `getSessionProfile` enforces on every request) and
 * bans the underlying auth user so they can't sign in again or refresh their
 * session. Admins can't deactivate themselves — that's a lockout risk.
 */
export async function setEmployeeActive(formData: FormData): Promise<void> {
  const session = await authorize("employees.manage");
  if (!session) return;
  const id = String(formData.get("id") ?? "");
  const active = String(formData.get("active") ?? "") === "true";

  if (!id || (id === session.userId && !active)) return;

  const admin = createAdminClient();
  const { error } = await admin.auth.admin.updateUserById(id, {
    ban_duration: active ? BAN_NONE : BAN_FOREVER,
  });
  // Don't flip the profile flag if the auth user couldn't be banned — that
  // would show "Inactive" in the UI while the account still works.
  if (error) return;

  await prisma.profile.update({ where: { id }, data: { is_active: active } });
  revalidatePath("/employees");
  revalidatePath("/team");
}

/** Set a new password for an employee who's locked out. Admins only. */
export async function resetEmployeePassword(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  if (!(await authorize("employees.manage"))) return { error: DENIED_MESSAGE };
  const id = String(formData.get("id") ?? "");
  const password = String(formData.get("password") ?? "");

  if (!id) return { error: "Unknown employee." };
  if (password.length < 8) {
    return { error: "Password must be at least 8 characters." };
  }

  const admin = createAdminClient();
  const { error } = await admin.auth.admin.updateUserById(id, { password });
  if (error) return { error: error.message };

  return { success: "Password updated. Share it with them securely." };
}

// -- Roles --------------------------------------------------------------------

export async function createRole(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  if (!(await authorize("roles.manage"))) return { error: DENIED_MESSAGE };
  const name = String(formData.get("name") ?? "").trim();
  const isAdmin = String(formData.get("is_admin") ?? "") === "on";

  if (!name) return { error: "Role name is required." };

  try {
    await prisma.role.create({ data: { name, is_admin: isAdmin } });
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") {
      return { error: "That role already exists." };
    }
    throw e;
  }

  revalidatePath("/roles");
  return { success: `Role "${name}" created.` };
}

export async function updateRole(formData: FormData): Promise<void> {
  if (!(await authorize("roles.manage"))) return;
  const id = String(formData.get("id") ?? "");
  const name = String(formData.get("name") ?? "").trim();
  const isAdmin = String(formData.get("is_admin") ?? "") === "true";
  if (!id || !name) return;

  // Only store values from the catalogue, so a tampered form can't inject a
  // permission string that some future guard might honour.
  const permissions = formData
    .getAll("permissions")
    .map(String)
    .filter(isPermission);

  await prisma.role.update({
    where: { id },
    data: { name, is_admin: isAdmin, permissions },
  });
  revalidatePath("/roles");
  revalidatePath("/employees");
}

/** Apply a role template's permission set — the "start from a preset" button. */
export async function applyRoleTemplate(formData: FormData): Promise<void> {
  if (!(await authorize("roles.manage"))) return;
  const id = String(formData.get("id") ?? "");
  const templateName = String(formData.get("template") ?? "");
  const template = ROLE_TEMPLATES.find((t) => t.name === templateName);
  if (!id || !template) return;

  await prisma.role.update({
    where: { id },
    data: { permissions: [...template.permissions], is_admin: template.is_admin },
  });
  revalidatePath("/roles");
}

export async function deleteRole(formData: FormData): Promise<void> {
  if (!(await authorize("roles.manage"))) return;
  const id = String(formData.get("id") ?? "");

  await prisma.role.delete({ where: { id } });
  revalidatePath("/roles");
}
