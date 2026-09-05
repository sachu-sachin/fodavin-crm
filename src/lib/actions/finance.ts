"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { authorize, DENIED_MESSAGE } from "@/lib/auth";
import type { Permission } from "@/lib/permissions";
import { istToday } from "@/lib/format";
import type { MilestoneStatus } from "@/lib/types";

export type FinanceState = { error?: string; success?: string };

async function requireUserId(
  permission: Permission,
): Promise<string | null> {
  const session = await authorize(permission);
  return session?.userId ?? null;
}

const MILESTONE_STATUS = new Set<MilestoneStatus>([
  "pending",
  "invoiced",
  "paid",
]);

function str(v: FormDataEntryValue | null): string | null {
  const s = String(v ?? "").trim();
  return s ? s : null;
}

function parseDateOnly(v: FormDataEntryValue | null): Date | null {
  const s = String(v ?? "").trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return null;
  const d = new Date(`${s}T00:00:00Z`);
  return Number.isNaN(d.getTime()) ? null : d;
}

/** Milestones must be a real positive figure — a ₹0 milestone is a data-entry slip. */
function parseAmount(v: FormDataEntryValue | null): number | "invalid" {
  const s = String(v ?? "").trim();
  if (!s) return "invalid";
  const n = Number(s.replace(/,/g, ""));
  return Number.isFinite(n) && n > 0 ? n : "invalid";
}

/**
 * `paid_on` is derived, never free-typed: it is stamped when a milestone
 * becomes paid and cleared if it moves back to pending/invoiced. That keeps
 * "received this month" totals honest.
 */
function paidOnFor(
  status: MilestoneStatus,
  existing: Date | null,
): Date | null {
  if (status !== "paid") return null;
  return existing ?? parseDateOnly(istToday());
}

function revalidateProject(projectId: string) {
  revalidatePath(`/projects/${projectId}`);
  revalidatePath("/projects");
  revalidatePath("/");
}

export async function createMilestone(
  _prev: FinanceState,
  formData: FormData,
): Promise<FinanceState> {
  const userId = await requireUserId("finance.manage");
  if (!userId) return { error: DENIED_MESSAGE };
  const projectId = String(formData.get("project_id") ?? "");
  const label = String(formData.get("label") ?? "").trim();

  if (!projectId) return { error: "Missing project." };
  if (!label) return { error: "Give the milestone a label." };

  const amount = parseAmount(formData.get("amount"));
  if (amount === "invalid") return { error: "Amount must be more than zero." };

  const rawStatus = String(formData.get("status") ?? "pending") as MilestoneStatus;
  const status = MILESTONE_STATUS.has(rawStatus) ? rawStatus : "pending";

  const last = await prisma.paymentMilestone.findFirst({
    where: { project_id: projectId },
    orderBy: { position: "desc" },
    select: { position: true },
  });

  await prisma.paymentMilestone.create({
    data: {
      project_id: projectId,
      label,
      amount,
      status,
      due_date: parseDateOnly(formData.get("due_date")),
      paid_on: paidOnFor(status, null),
      invoice_no: str(formData.get("invoice_no")),
      notes: str(formData.get("notes")),
      position: (last?.position ?? -1) + 1,
      created_by: userId,
    },
  });

  revalidateProject(projectId);
  return { success: `${label} added.` };
}

export async function updateMilestone(
  _prev: FinanceState,
  formData: FormData,
): Promise<FinanceState> {
  if (!(await requireUserId("finance.manage"))) return { error: DENIED_MESSAGE };
  const id = String(formData.get("id") ?? "");
  const label = String(formData.get("label") ?? "").trim();
  if (!label) return { error: "Give the milestone a label." };

  const amount = parseAmount(formData.get("amount"));
  if (amount === "invalid") return { error: "Amount must be more than zero." };

  const existing = await prisma.paymentMilestone.findUnique({
    where: { id },
    select: { project_id: true, paid_on: true },
  });
  if (!existing) return { error: "That milestone no longer exists." };

  const rawStatus = String(formData.get("status") ?? "pending") as MilestoneStatus;
  const status = MILESTONE_STATUS.has(rawStatus) ? rawStatus : "pending";

  await prisma.paymentMilestone.update({
    where: { id },
    data: {
      label,
      amount,
      status,
      due_date: parseDateOnly(formData.get("due_date")),
      paid_on: paidOnFor(status, existing.paid_on),
      invoice_no: str(formData.get("invoice_no")),
      notes: str(formData.get("notes")),
    },
  });

  revalidateProject(existing.project_id);
  return { success: "Milestone updated." };
}

export async function deleteMilestone(formData: FormData): Promise<void> {
  if (!(await requireUserId("finance.manage"))) return;
  const id = String(formData.get("id") ?? "");
  const existing = await prisma.paymentMilestone.findUnique({
    where: { id },
    select: { project_id: true },
  });
  if (!existing) return;

  await prisma.paymentMilestone.delete({ where: { id } });
  revalidateProject(existing.project_id);
}

/** One-click status change from the project payments table. */
export async function setMilestoneStatus(
  id: string,
  status: MilestoneStatus,
): Promise<void> {
  if (!(await requireUserId("finance.manage"))) return;
  if (!MILESTONE_STATUS.has(status)) return;

  const existing = await prisma.paymentMilestone.findUnique({
    where: { id },
    select: { project_id: true, paid_on: true },
  });
  if (!existing) return;

  await prisma.paymentMilestone.update({
    where: { id },
    data: { status, paid_on: paidOnFor(status, existing.paid_on) },
  });

  revalidateProject(existing.project_id);
}
