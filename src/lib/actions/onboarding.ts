"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { authorize, DENIED_MESSAGE } from "@/lib/auth";
import {
  checklistTasks,
  parseTemplateItems,
  STARTER_TEMPLATE,
} from "@/lib/onboarding";
import type { OnboardingTemplateItemData } from "@/lib/types";

export type OnboardingState = { error?: string; success?: string; id?: string };

const DATE_KEY = /^\d{4}-\d{2}-\d{2}$/;

function str(v: FormDataEntryValue | null): string | null {
  const s = String(v ?? "").trim();
  return s ? s : null;
}

function itemRows(items: OnboardingTemplateItemData[]) {
  return items.map((item, position) => ({ ...item, position }));
}

// -- Templates ----------------------------------------------------------------

/** Create a template, or (with an id) replace an existing one's details and steps. */
export async function saveTemplate(
  _prev: OnboardingState,
  formData: FormData,
): Promise<OnboardingState> {
  const session = await authorize("onboarding.manage");
  if (!session) return { error: DENIED_MESSAGE };
  const id = str(formData.get("id"));
  const name = String(formData.get("name") ?? "").trim();
  if (!name) return { error: "Give the template a name." };
  const parsed = parseTemplateItems(String(formData.get("items") ?? "[]"));
  if ("error" in parsed) return { error: parsed.error };

  const data = { name, description: str(formData.get("description")) };
  if (id) {
    // Steps are replaced wholesale; onboardings already started keep their
    // own tasks, so editing a template never changes someone's checklist.
    await prisma.onboardingTemplate.update({
      where: { id },
      data: { ...data, items: { deleteMany: {}, create: itemRows(parsed.items) } },
    });
  } else {
    await prisma.onboardingTemplate.create({
      data: { ...data, created_by: session.userId, items: { create: itemRows(parsed.items) } },
    });
  }
  revalidatePath("/onboarding/templates");
  revalidatePath("/onboarding");
  return { success: id ? "Template saved." : `"${name}" created.` };
}

export async function deleteTemplate(formData: FormData): Promise<void> {
  if (!(await authorize("onboarding.manage"))) return;
  const id = String(formData.get("id") ?? "");
  if (!id) return;
  // Onboardings made from it keep their checklists (template_id SetNull).
  // deleteMany: deleting one that's already gone is a no-op.
  await prisma.onboardingTemplate.deleteMany({ where: { id } });
  revalidatePath("/onboarding/templates");
  revalidatePath("/onboarding");
}

export async function addStarterTemplate(): Promise<OnboardingState> {
  const session = await authorize("onboarding.manage");
  if (!session) return { error: DENIED_MESSAGE };
  // The button shows on two pages and can be clicked twice; one copy is enough.
  const existing = await prisma.onboardingTemplate.findFirst({
    where: { name: STARTER_TEMPLATE.name },
    select: { id: true },
  });
  if (existing) {
    return { error: `"${STARTER_TEMPLATE.name}" is already in your templates.` };
  }
  await prisma.onboardingTemplate.create({
    data: {
      name: STARTER_TEMPLATE.name,
      description: STARTER_TEMPLATE.description,
      created_by: session.userId,
      items: { create: itemRows(STARTER_TEMPLATE.items) },
    },
  });
  revalidatePath("/onboarding/templates");
  revalidatePath("/onboarding");
  return { success: `"${STARTER_TEMPLATE.name}" added — edit it to fit.` };
}

// -- Onboardings --------------------------------------------------------------

/** Start someone's onboarding: one task per template step, dated from their start date. */
export async function startOnboarding(
  _prev: OnboardingState,
  formData: FormData,
): Promise<OnboardingState> {
  const session = await authorize("onboarding.manage");
  if (!session) return { error: DENIED_MESSAGE };
  const profileId = String(formData.get("profile_id") ?? "");
  const templateId = String(formData.get("template_id") ?? "");
  const startDate = String(formData.get("start_date") ?? "").trim();
  if (!profileId) return { error: "Pick who is joining." };
  if (!templateId) return { error: "Pick a checklist template." };
  if (!DATE_KEY.test(startDate) || Number.isNaN(new Date(startDate).getTime())) {
    return { error: "Pick their start date." };
  }

  const [person, existing, template, active] = await Promise.all([
    prisma.profile.findUnique({
      where: { id: profileId },
      select: { is_active: true, full_name: true, email: true },
    }),
    prisma.onboarding.findUnique({ where: { profile_id: profileId }, select: { id: true } }),
    prisma.onboardingTemplate.findUnique({
      where: { id: templateId },
      include: { items: { orderBy: { position: "asc" } } },
    }),
    prisma.profile.findMany({ where: { is_active: true }, select: { id: true } }),
  ]);
  if (!person?.is_active) return { error: "That person isn't an active employee." };
  if (existing) return { error: "They already have an onboarding checklist." };
  if (!template) return { error: "That template no longer exists." };
  if (template.items.length === 0) return { error: "That template has no steps." };

  let onboarding: { id: string };
  try {
    onboarding = await prisma.onboarding.create({
      data: {
        profile_id: profileId,
        template_id: templateId,
        start_date: new Date(startDate),
        created_by: session.userId,
        tasks: {
          create: checklistTasks(template.items, {
            newHireId: profileId,
            startDate,
            activeProfileIds: new Set(active.map((p) => p.id)),
            createdBy: session.userId,
          }),
        },
      },
      select: { id: true },
    });
  } catch (e) {
    // A double submit (or two managers at once) can pass the check above;
    // the unique profile_id then rejects the second one.
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") {
      return { error: "They already have an onboarding checklist." };
    }
    throw e;
  }

  revalidatePath("/onboarding");
  revalidatePath("/tasks");
  revalidatePath("/");
  const name = person.full_name || person.email?.split("@")[0] || "Their";
  return {
    success: `Onboarding started — ${template.items.length} steps for ${name}.`,
    id: onboarding.id,
  };
}

/** Cancel an onboarding. Its checklist tasks go with it. */
export async function deleteOnboarding(formData: FormData): Promise<void> {
  if (!(await authorize("onboarding.manage"))) return;
  const id = String(formData.get("id") ?? "");
  if (!id) return;
  // deleteMany: a second click (already gone) just redirects.
  await prisma.onboarding.deleteMany({ where: { id } });
  revalidatePath("/onboarding");
  revalidatePath("/tasks");
  revalidatePath("/");
  redirect("/onboarding");
}
