import type { OnboardingTemplateItemData } from "@/lib/types";
import { addDays } from "@/lib/week";

/** Bounds on a step's due offset: a month of prep, a year of follow-up. */
export const MIN_OFFSET_DAYS = -30;
export const MAX_OFFSET_DAYS = 365;
export const MAX_TEMPLATE_ITEMS = 50;

/**
 * Validate the template dialog's items (sent as JSON). Blank rows are
 * dropped; everything else must be well-formed.
 */
export function parseTemplateItems(
  raw: string,
): { items: OnboardingTemplateItemData[] } | { error: string } {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return { error: "The checklist couldn't be read. Try again." };
  }
  if (!Array.isArray(parsed)) return { error: "The checklist couldn't be read. Try again." };

  const items: OnboardingTemplateItemData[] = [];
  for (const row of parsed) {
    const r = (row ?? {}) as Record<string, unknown>;
    const title = String(r.title ?? "").trim();
    if (!title) continue;
    const offset = Number(r.due_offset_days ?? 0);
    if (!Number.isInteger(offset) || offset < MIN_OFFSET_DAYS || offset > MAX_OFFSET_DAYS) {
      return {
        error: `"${title}": days must be a whole number from ${MIN_OFFSET_DAYS} to ${MAX_OFFSET_DAYS}.`,
      };
    }
    const toNewHire = r.assign_to_new_hire === true;
    const assignee = String(r.assignee_id ?? "").trim();
    const description = String(r.description ?? "").trim();
    items.push({
      title,
      description: description || null,
      assign_to_new_hire: toNewHire,
      assignee_id: toNewHire || !assignee ? null : assignee,
      due_offset_days: offset,
    });
  }
  if (items.length === 0) return { error: "Add at least one step." };
  if (items.length > MAX_TEMPLATE_ITEMS) {
    return { error: `A checklist can have at most ${MAX_TEMPLATE_ITEMS} steps.` };
  }
  return { items };
}

/**
 * The Task rows an onboarding starts with: one per template step, due
 * relative to the start date, owned by the new hire, a named team member
 * (if they're still active) or nobody.
 */
export function checklistTasks(
  items: OnboardingTemplateItemData[],
  opts: {
    newHireId: string;
    /** "YYYY-MM-DD". */
    startDate: string;
    activeProfileIds: Set<string>;
    createdBy: string;
  },
) {
  return items.map((item, position) => ({
    title: item.title,
    description: item.description,
    type: "general" as const,
    status: "todo" as const,
    assignee_id: item.assign_to_new_hire
      ? opts.newHireId
      : item.assignee_id && opts.activeProfileIds.has(item.assignee_id)
        ? item.assignee_id
        : null,
    due_date: new Date(addDays(opts.startDate, item.due_offset_days)),
    position,
    created_by: opts.createdBy,
  }));
}

/** How a step's timing reads in the UI: "Day 1", "3 days before", … */
export function offsetLabel(days: number): string {
  if (days === 0) return "Start day";
  if (days < 0) return `${-days} day${days === -1 ? "" : "s"} before`;
  return `Day ${days + 1}`;
}

/** A sensible first template for a small web/app agency. */
export const STARTER_TEMPLATE: {
  name: string;
  description: string;
  items: OnboardingTemplateItemData[];
} = {
  name: "Developer onboarding",
  description: "Accounts, setup and the first month for a new developer or designer.",
  items: [
    { title: "Create email, Slack/Discord and app accounts", description: null, assign_to_new_hire: false, assignee_id: null, due_offset_days: -3 },
    { title: "Add to GitHub org, Vercel and Supabase as needed", description: null, assign_to_new_hire: false, assignee_id: null, due_offset_days: -3 },
    { title: "Share the password vault (Bitwarden) collection", description: null, assign_to_new_hire: false, assignee_id: null, due_offset_days: -1 },
    { title: "Welcome call and team introductions", description: null, assign_to_new_hire: false, assignee_id: null, due_offset_days: 0 },
    { title: "Set up laptop, editor and local dev environment", description: null, assign_to_new_hire: true, assignee_id: null, due_offset_days: 0 },
    { title: "Read the handbook and current company policies", description: "See Announcements for the policies to acknowledge.", assign_to_new_hire: true, assignee_id: null, due_offset_days: 1 },
    { title: "Clone a live project and run it locally", description: null, assign_to_new_hire: true, assignee_id: null, due_offset_days: 1 },
    { title: "Ship a first small task to production", description: null, assign_to_new_hire: true, assignee_id: null, due_offset_days: 4 },
    { title: "One-week check-in", description: null, assign_to_new_hire: false, assignee_id: null, due_offset_days: 6 },
    { title: "30-day review", description: null, assign_to_new_hire: false, assignee_id: null, due_offset_days: 29 },
  ],
};
