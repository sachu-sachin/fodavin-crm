"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { authorize, DENIED_MESSAGE } from "@/lib/auth";
import { normalisePhone, type ImportRow } from "@/lib/call-list";
import type { InquirySource } from "@/lib/types";

export type ImportResult = {
  error?: string;
  created?: number;
  /** Rows skipped because the phone number is already a lead (or repeats in the list). */
  duplicates?: string[];
};

const MAX_ROWS = 500;
const SOURCES = new Set<InquirySource>([
  "referral",
  "website",
  "social",
  "cold_outreach",
  "marketplace",
  "repeat_client",
  "event",
  "other",
]);
const cut = (v: unknown, n: number) => String(v ?? "").trim().slice(0, n) || null;

/**
 * Add many leads at once from a pasted sheet. Every lead gets the chosen
 * owner and source and starts at New. A phone number that's already a lead,
 * or repeats within the list, is skipped rather than creating a duplicate.
 */
export async function importLeads(input: {
  rows: ImportRow[];
  ownerId?: string;
  source?: string;
}): Promise<ImportResult> {
  const session = await authorize("pipeline.manage");
  if (!session) return { error: DENIED_MESSAGE };
  if (!Array.isArray(input.rows) || input.rows.length === 0) return { error: "There are no rows to import." };
  if (input.rows.length > MAX_ROWS) return { error: `Import at most ${MAX_ROWS} leads at a time.` };

  let ownerId = session.userId;
  if (input.ownerId) {
    const owner = await prisma.profile.findFirst({
      where: { id: input.ownerId, is_active: true },
      select: { id: true },
    });
    if (!owner) return { error: "That owner isn't an active employee." };
    ownerId = owner.id;
  }
  const source = SOURCES.has(input.source as InquirySource) ? (input.source as InquirySource) : null;

  // Phones already in the pipeline, normalised so formatting can't hide a repeat.
  const known = new Set(
    (await prisma.inquiry.findMany({ where: { phone: { not: null } }, select: { phone: true } }))
      .map((i) => normalisePhone(i.phone))
      .filter(Boolean),
  );

  const duplicates: string[] = [];
  const data = [];
  for (const r of input.rows) {
    const title = cut(r.title, 200);
    if (!title) continue;
    const phone = cut(r.phone, 40);
    const key = normalisePhone(phone);
    if (key && known.has(key)) {
      duplicates.push(title);
      continue;
    }
    if (key) known.add(key);
    data.push({
      title,
      contact_name: cut(r.contact_name, 200),
      phone,
      email: cut(r.email, 200),
      notes: cut(r.notes, 2000),
      source,
      stage: "new" as const,
      owner_id: ownerId,
      created_by: session.userId,
    });
  }

  if (data.length) await prisma.inquiry.createMany({ data });
  revalidatePath("/pipeline");
  revalidatePath("/pipeline/calls");
  revalidatePath("/");
  return { created: data.length, duplicates };
}
