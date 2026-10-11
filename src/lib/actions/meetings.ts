"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { authorize, DENIED_MESSAGE } from "@/lib/auth";
import type { Permission } from "@/lib/permissions";
import { parseISTInput } from "@/lib/format";
import { MEETING_DURATIONS, type MeetingType } from "@/lib/types";

export type MeetingState = { error?: string; success?: string; id?: string };

async function requireUserId(
  permission: Permission,
): Promise<string | null> {
  const session = await authorize(permission);
  return session?.userId ?? null;
}

const MEETING_TYPE = new Set<MeetingType>([
  "internal",
  "client",
  "standup",
  "review",
]);
const DURATIONS = new Set<number>(MEETING_DURATIONS);

function str(v: FormDataEntryValue | null): string | null {
  const s = String(v ?? "").trim();
  return s ? s : null;
}

function meetingDataFromForm(formData: FormData) {
  const type = String(formData.get("type") ?? "internal") as MeetingType;
  const duration = Number(formData.get("duration_minutes"));
  return {
    title: String(formData.get("title") ?? "").trim(),
    type: MEETING_TYPE.has(type) ? type : "internal",
    // datetime-local values are treated as IST wall time.
    starts_at: parseISTInput(String(formData.get("starts_at") ?? "")),
    duration_minutes: DURATIONS.has(duration) ? duration : null,
    location: str(formData.get("location")),
    company_id: str(formData.get("company_id")),
    project_id: str(formData.get("project_id")),
    agenda: str(formData.get("agenda")),
  };
}

/**
 * The submitted attendee ids, de-duplicated and limited to real, active
 * team members — anything else would fail the foreign key or add someone
 * who has left.
 */
async function attendeeIdsFromForm(formData: FormData): Promise<string[]> {
  const ids = [
    ...new Set(
      formData
        .getAll("attendee_ids")
        .map((v) => String(v).trim())
        .filter(Boolean),
    ),
  ];
  if (ids.length === 0) return [];
  const found = await prisma.profile.findMany({
    where: { id: { in: ids }, is_active: true },
    select: { id: true },
  });
  const valid = new Set(found.map((p) => p.id));
  return ids.filter((id) => valid.has(id));
}

function revalidateMeeting(
  id: string,
  links: { company_id: string | null; project_id: string | null },
) {
  revalidatePath("/meetings");
  revalidatePath(`/meetings/${id}`);
  revalidatePath("/");
  if (links.company_id) revalidatePath(`/crm/${links.company_id}`);
  if (links.project_id) revalidatePath(`/projects/${links.project_id}`);
}

export async function createMeeting(
  _prev: MeetingState,
  formData: FormData,
): Promise<MeetingState> {
  const userId = await requireUserId("meetings.manage");
  if (!userId) return { error: DENIED_MESSAGE };
  const data = meetingDataFromForm(formData);
  if (!data.title) return { error: "Give the meeting a title." };
  if (!data.starts_at) return { error: "Pick a date and time." };
  const attendeeIds = await attendeeIdsFromForm(formData);

  const meeting = await prisma.meeting.create({
    data: {
      ...data,
      starts_at: data.starts_at,
      created_by: userId,
      attendees: {
        create: attendeeIds.map((profile_id) => ({ profile_id })),
      },
    },
    select: { id: true },
  });

  revalidateMeeting(meeting.id, data);
  return { success: `"${data.title}" scheduled.`, id: meeting.id };
}

export async function updateMeeting(
  _prev: MeetingState,
  formData: FormData,
): Promise<MeetingState> {
  if (!(await requireUserId("meetings.manage"))) return { error: DENIED_MESSAGE };
  const id = String(formData.get("id") ?? "");
  const data = meetingDataFromForm(formData);
  if (!data.title) return { error: "Give the meeting a title." };
  if (!data.starts_at) return { error: "Pick a date and time." };
  const attendeeIds = await attendeeIdsFromForm(formData);

  // Capture the old client/project so their pages drop a meeting that was
  // moved elsewhere.
  const before = await prisma.meeting.findUnique({
    where: { id },
    select: {
      company_id: true,
      project_id: true,
      attendees: {
        where: { profile: { is_active: false } },
        select: { profile_id: true },
      },
    },
  });
  if (!before) return { error: "That meeting no longer exists." };

  // The form only offers active people, so the submitted list replaces the
  // active attendees. Anyone who attended and has since left stays on the
  // record: they can't be ticked in the form, so they must not be dropped.
  const formerAttendees = before.attendees.map((a) => a.profile_id);
  await prisma.meeting.update({
    where: { id },
    data: {
      ...data,
      starts_at: data.starts_at,
      attendees: {
        deleteMany: { profile_id: { notIn: formerAttendees } },
        create: attendeeIds.map((profile_id) => ({ profile_id })),
      },
    },
  });

  revalidateMeeting(id, data);
  revalidateMeeting(id, before);
  return { success: "Meeting updated." };
}

/**
 * Notes and decisions are saved on their own, from the editor on the meeting
 * page, so they can be written during the meeting without reopening the
 * details dialog — and so saving details never touches them.
 */
export async function saveMeetingNotes(
  _prev: MeetingState,
  formData: FormData,
): Promise<MeetingState> {
  if (!(await requireUserId("meetings.manage"))) return { error: DENIED_MESSAGE };
  const id = String(formData.get("id") ?? "");
  const exists = await prisma.meeting.findUnique({
    where: { id },
    select: { id: true },
  });
  if (!exists) return { error: "That meeting no longer exists." };

  await prisma.meeting.update({
    where: { id },
    data: {
      notes: str(formData.get("notes")),
      decisions: str(formData.get("decisions")),
    },
  });
  revalidatePath(`/meetings/${id}`);
  return { success: "Notes saved." };
}

export async function deleteMeeting(formData: FormData): Promise<void> {
  if (!(await requireUserId("meetings.manage"))) return;
  const id = String(formData.get("id") ?? "");
  if (!id) return;

  // Action items survive (Task.meeting_id is SetNull): they're real work
  // that still needs doing, whatever happens to the meeting record.
  // Already gone (e.g. a second click, or someone else deleted it): nothing
  // to do but leave the page.
  const meeting = await prisma.meeting.findUnique({
    where: { id },
    select: { company_id: true, project_id: true },
  });
  if (meeting) {
    await prisma.meeting.deleteMany({ where: { id } });
    revalidateMeeting(id, meeting);
    revalidatePath("/tasks");
  }
  redirect("/meetings");
}
