import { beforeEach, describe, expect, it, vi } from "vitest";

// Covers the task actions' meeting handling (action items). The project
// actions themselves aren't covered here yet — see docs/testing.md.

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

vi.mock("next/navigation", () => ({
  redirect: vi.fn((path: string) => {
    throw new Error(`REDIRECT:${path}`);
  }),
}));

vi.mock("@/lib/auth", () => ({
  authorize: vi.fn(),
  getSessionProfile: vi.fn(),
  can: vi.fn(),
  DENIED_MESSAGE: "You don't have permission to do that.",
}));

vi.mock("@/lib/document-files", () => ({ purgeDocumentFiles: vi.fn() }));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    task: { create: vi.fn(), update: vi.fn(), delete: vi.fn(), findFirst: vi.fn(), findUnique: vi.fn() },
    meeting: { findUnique: vi.fn() },
    onboarding: { findUnique: vi.fn() },
  },
}));

const { revalidatePath } = await import("next/cache");
const { authorize, getSessionProfile, can, DENIED_MESSAGE } = await import("@/lib/auth");
const { prisma } = await import("@/lib/prisma");
const { createTask, updateTask, deleteTask, moveTaskStatus } = await import("./projects");

function form(fields: Record<string, string>): FormData {
  const fd = new FormData();
  for (const [k, v] of Object.entries(fields)) fd.set(k, v);
  return fd;
}

/** Signed in with tasks.manage, plus `extra` permissions (meetings.view by default). */
function authorized(userId = "user-1", extra: string[] = ["meetings.view"]) {
  signedIn(userId, ["tasks.manage", ...extra]);
}

/** Signed in with exactly these permissions. */
function signedIn(userId: string, perms: string[]) {
  const permissions = new Set(perms);
  const session = { userId, profile: null, isAdmin: false, permissions };
  vi.mocked(authorize).mockImplementation(async (p) =>
    permissions.has(p) ? (session as never) : null,
  );
  vi.mocked(getSessionProfile).mockResolvedValue(session as never);
  vi.mocked(can).mockImplementation((_s, p) => permissions.has(p));
}

function unauthorized() {
  vi.mocked(authorize).mockResolvedValue(null);
}

beforeEach(() => {
  vi.resetAllMocks();
  // The task as it was before an edit or move (for start/finish stamping).
  vi.mocked(prisma.task.findUnique).mockResolvedValue({
    status: "todo",
    started_at: null,
    completed_at: null,
    actual_hours: null,
  } as never);
});

describe("createTask", () => {
  it("denies without tasks.manage", async () => {
    unauthorized();
    const result = await createTask({}, form({ project_id: "p1", title: "X" }));
    expect(result).toEqual({ error: DENIED_MESSAGE });
    expect(prisma.task.create).not.toHaveBeenCalled();
  });

  it("creates an individual task with no project, with its planning fields", async () => {
    authorized();
    const result = await createTask(
      {},
      form({ title: "Edit shorts", priority: "high", workstream: "Editing", allocated_hours: "3" }),
    );
    expect(result.success).toBeTruthy();
    expect(prisma.task.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        project_id: null,
        priority: "high",
        workstream: "Editing",
        allocated_hours: 3,
      }),
    });
  });

  it("rejects nonsense hours", async () => {
    authorized();
    const result = await createTask({}, form({ title: "X", allocated_hours: "-2" }));
    expect(result.error).toMatch(/Hours/);
    expect(prisma.task.create).not.toHaveBeenCalled();
  });

  it("stamps start and finish when created straight as done", async () => {
    authorized();
    await createTask({}, form({ title: "X", status: "done" }));
    const data = vi.mocked(prisma.task.create).mock.calls[0][0].data as { started_at: Date; completed_at: Date };
    expect(data.started_at).toBeInstanceOf(Date);
    expect(data.completed_at).toBeInstanceOf(Date);
  });

  it("requires a title", async () => {
    authorized();
    const result = await createTask({}, form({ project_id: "p1", title: " " }));
    expect(result.error).toMatch(/title/i);
  });

  it("creates an ordinary project task with no meeting", async () => {
    authorized("user-1");
    await createTask({}, form({ project_id: "p1", title: "Build header" }));
    expect(prisma.meeting.findUnique).not.toHaveBeenCalled();
    expect(vi.mocked(prisma.task.create).mock.calls[0][0].data).toMatchObject({
      project_id: "p1",
      meeting_id: null,
      title: "Build header",
      created_by: "user-1",
    });
    expect(revalidatePath).toHaveBeenCalledWith("/projects/p1");
  });

  it("gives an action item its meeting's project", async () => {
    authorized();
    vi.mocked(prisma.meeting.findUnique).mockResolvedValue({ project_id: "p9" } as never);
    const result = await createTask({}, form({ meeting_id: "m1", title: "Send proposal" }));

    expect(result.success).toMatch(/Send proposal/);
    expect(vi.mocked(prisma.task.create).mock.calls[0][0].data).toMatchObject({
      project_id: "p9",
      meeting_id: "m1",
    });
    expect(revalidatePath).toHaveBeenCalledWith("/meetings/m1");
    expect(revalidatePath).toHaveBeenCalledWith("/projects/p9");
    expect(revalidatePath).toHaveBeenCalledWith("/tasks");
  });

  it("allows an action item with no project, from an internal meeting", async () => {
    authorized();
    vi.mocked(prisma.meeting.findUnique).mockResolvedValue({ project_id: null } as never);
    const result = await createTask({}, form({ meeting_id: "m1", title: "Book venue" }));

    expect(result.error).toBeUndefined();
    expect(vi.mocked(prisma.task.create).mock.calls[0][0].data).toMatchObject({
      project_id: null,
      meeting_id: "m1",
    });
  });

  it("adds an item to an onboarding checklist, with no project", async () => {
    authorized("user-1", ["onboarding.manage"]);
    vi.mocked(prisma.onboarding.findUnique).mockResolvedValue({ id: "o1" } as never);
    const result = await createTask(
      {},
      form({ onboarding_id: "o1", project_id: "sneaky", title: "Order business cards" }),
    );

    expect(result.error).toBeUndefined();
    expect(prisma.meeting.findUnique).not.toHaveBeenCalled();
    expect(vi.mocked(prisma.task.create).mock.calls[0][0].data).toMatchObject({
      project_id: null,
      onboarding_id: "o1",
    });
    expect(revalidatePath).toHaveBeenCalledWith("/onboarding/o1");
  });

  it("denies a checklist item without onboarding.manage", async () => {
    authorized("user-1", []);
    const result = await createTask({}, form({ onboarding_id: "o1", title: "X" }));
    expect(result).toEqual({ error: DENIED_MESSAGE });
    expect(prisma.onboarding.findUnique).not.toHaveBeenCalled();
    expect(prisma.task.create).not.toHaveBeenCalled();
  });

  it("refuses a task that claims to be both an action item and a checklist item", async () => {
    authorized("user-1", ["meetings.view", "onboarding.manage"]);
    const result = await createTask({}, form({ onboarding_id: "o1", meeting_id: "m1", title: "X" }));
    expect(result.error).toMatch(/both/i);
    expect(prisma.task.create).not.toHaveBeenCalled();
  });

  it("errors when the onboarding no longer exists", async () => {
    authorized("user-1", ["onboarding.manage"]);
    vi.mocked(prisma.onboarding.findUnique).mockResolvedValue(null);
    const result = await createTask({}, form({ onboarding_id: "gone", title: "X" }));
    expect(result.error).toMatch(/no longer exists/i);
    expect(prisma.task.create).not.toHaveBeenCalled();
  });

  it("uses the meeting's project even if the form sends another one", async () => {
    authorized();
    vi.mocked(prisma.meeting.findUnique).mockResolvedValue({ project_id: "p9" } as never);
    await createTask({}, form({ meeting_id: "m1", project_id: "other", title: "X" }));
    expect(vi.mocked(prisma.task.create).mock.calls[0][0].data).toMatchObject({
      project_id: "p9",
      meeting_id: "m1",
    });
  });

  it("denies an action item without meetings.view", async () => {
    authorized("user-1", []);
    const result = await createTask({}, form({ meeting_id: "m1", title: "X" }));
    expect(result).toEqual({ error: DENIED_MESSAGE });
    expect(prisma.meeting.findUnique).not.toHaveBeenCalled();
    expect(prisma.task.create).not.toHaveBeenCalled();
  });

  it("errors when the meeting no longer exists", async () => {
    authorized();
    vi.mocked(prisma.meeting.findUnique).mockResolvedValue(null);
    const result = await createTask({}, form({ meeting_id: "gone", title: "X" }));
    expect(result.error).toMatch(/no longer exists/i);
    expect(prisma.task.create).not.toHaveBeenCalled();
  });
});

describe("task updates refresh the task's own meeting and project pages", () => {
  beforeEach(() => {
    authorized();
    const where = { project_id: "p1", meeting_id: "m1" };
    vi.mocked(prisma.task.update).mockResolvedValue(where as never);
    vi.mocked(prisma.task.delete).mockResolvedValue(where as never);
  });

  it("updateTask", async () => {
    const result = await updateTask({}, form({ id: "t1", title: "Renamed" }));
    expect(result).toEqual({ success: "Task updated." });
    expect(vi.mocked(prisma.task.update).mock.calls[0][0].select).toEqual({
      project_id: true,
      meeting_id: true,
      onboarding_id: true,
    });
    expect(revalidatePath).toHaveBeenCalledWith("/projects/p1");
    expect(revalidatePath).toHaveBeenCalledWith("/meetings/m1");
  });

  it("deleteTask", async () => {
    await deleteTask(form({ id: "t1" }));
    expect(prisma.task.delete).toHaveBeenCalledWith({
      where: { id: "t1" },
      select: { project_id: true, meeting_id: true, onboarding_id: true },
    });
    expect(revalidatePath).toHaveBeenCalledWith("/meetings/m1");
  });

  it("moveTaskStatus", async () => {
    await moveTaskStatus("t1", "done");
    expect(prisma.task.update).toHaveBeenCalledWith({
      where: { id: "t1" },
      data: expect.objectContaining({ status: "done", completed_at: expect.any(Date) }),
      select: { project_id: true, meeting_id: true, onboarding_id: true },
    });
    expect(revalidatePath).toHaveBeenCalledWith("/meetings/m1");
  });

  it("moveTaskStatus ignores an unknown status", async () => {
    await moveTaskStatus("t1", "archived" as never);
    expect(prisma.task.update).not.toHaveBeenCalled();
  });
});

describe("moveTaskStatus without tasks.manage", () => {
  it("lets someone tick off their own onboarding checklist step", async () => {
    signedIn("new-hire", []);
    vi.mocked(prisma.task.findFirst).mockResolvedValue({ id: "t1" } as never);
    vi.mocked(prisma.task.update).mockResolvedValue({
      project_id: null,
      meeting_id: null,
      onboarding_id: "o1",
    } as never);

    await moveTaskStatus("t1", "done");
    expect(prisma.task.findFirst).toHaveBeenCalledWith({
      where: { id: "t1", assignee_id: "new-hire", onboarding_id: { not: null } },
      select: { id: true },
    });
    expect(prisma.task.update).toHaveBeenCalled();
    expect(revalidatePath).toHaveBeenCalledWith("/onboarding/o1");
  });

  it("does nothing for any other task", async () => {
    signedIn("new-hire", []);
    vi.mocked(prisma.task.findFirst).mockResolvedValue(null);
    await moveTaskStatus("t1", "done");
    expect(prisma.task.update).not.toHaveBeenCalled();
  });
});
