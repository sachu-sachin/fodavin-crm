import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("next/navigation", () => ({
  redirect: vi.fn((p: string) => {
    throw new Error(`REDIRECT:${p}`);
  }),
}));
vi.mock("@/lib/auth", () => ({
  authorize: vi.fn(),
  getSessionProfile: vi.fn(),
  DENIED_MESSAGE: "You don't have permission to do that.",
}));
vi.mock("@/lib/attendance-data", () => ({
  canManageAttendanceOf: vi.fn(),
  getHolidayKeys: vi.fn(),
  getWorkRules: vi.fn(),
}));
vi.mock("@/lib/format", async (orig) => ({
  ...(await orig<typeof import("@/lib/format")>()),
  istToday: vi.fn(() => "2026-11-23"),
}));
vi.mock("@/lib/prisma", () => ({
  prisma: {
    attendance: {
      findUnique: vi.fn(),
      findMany: vi.fn(),
      upsert: vi.fn(),
      update: vi.fn(),
      updateMany: vi.fn(),
      deleteMany: vi.fn(),
    },
    leaveRequest: {
      findFirst: vi.fn(),
      findUnique: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      updateMany: vi.fn(),
    },
    workSettings: { upsert: vi.fn() },
    holiday: { upsert: vi.fn(), deleteMany: vi.fn() },
    $transaction: vi.fn(),
  },
}));

const { getSessionProfile, authorize, DENIED_MESSAGE } = await import("@/lib/auth");
const { canManageAttendanceOf, getHolidayKeys, getWorkRules } = await import("@/lib/attendance-data");
const { prisma } = await import("@/lib/prisma");
const { DEFAULT_RULES } = await import("@/lib/attendance");
const {
  checkIn,
  checkOut,
  saveAttendance,
  requestLeave,
  cancelLeave,
  decideLeave,
  saveWorkSettings,
} = await import("./attendance");

function form(fields: Record<string, string>): FormData {
  const fd = new FormData();
  for (const [k, v] of Object.entries(fields)) fd.set(k, v);
  return fd;
}

const DAY = new Date("2026-11-23T00:00:00Z");

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(getSessionProfile).mockResolvedValue({
    userId: "me",
    permissions: new Set(),
    roleIds: [],
    isAdmin: false,
    profile: null,
  } as never);
  vi.mocked(getWorkRules).mockResolvedValue(DEFAULT_RULES);
  vi.mocked(getHolidayKeys).mockResolvedValue(new Set());
});

describe("checkIn / checkOut", () => {
  it("checks in once per day", async () => {
    vi.mocked(prisma.attendance.findUnique).mockResolvedValue(null);
    expect(await checkIn()).toEqual({ success: "Checked in." });
    expect(prisma.attendance.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { profile_id_work_date: { profile_id: "me", work_date: DAY } },
      }),
    );

    vi.mocked(prisma.attendance.findUnique).mockResolvedValue({ check_in: new Date() } as never);
    expect((await checkIn()).error).toMatch(/already checked in/);
  });

  it("needs a check-in before checking out, and only once", async () => {
    vi.mocked(prisma.attendance.findUnique).mockResolvedValue(null);
    expect((await checkOut()).error).toMatch(/Check in first/);

    vi.mocked(prisma.attendance.findUnique).mockResolvedValue({
      check_in: new Date(),
      check_out: new Date(),
    } as never);
    expect((await checkOut()).error).toMatch(/already checked out/);

    vi.mocked(prisma.attendance.findUnique).mockResolvedValue({
      check_in: new Date(),
      check_out: null,
    } as never);
    expect(await checkOut()).toEqual({ success: "Checked out." });
  });
});

describe("saveAttendance", () => {
  const valid = { profile_id: "p1", date: "2026-11-20", check_in: "09:05", check_out: "18:00", status: "present" };

  it("refuses people outside the lead's team", async () => {
    vi.mocked(canManageAttendanceOf).mockResolvedValue(false);
    expect(await saveAttendance({}, form(valid))).toEqual({ error: DENIED_MESSAGE });
    expect(prisma.attendance.upsert).not.toHaveBeenCalled();
  });

  it("validates times, order, future days and status", async () => {
    vi.mocked(canManageAttendanceOf).mockResolvedValue(true);
    expect((await saveAttendance({}, form({ ...valid, check_in: "9am" }))).error).toMatch(/09:30/);
    expect((await saveAttendance({}, form({ ...valid, check_out: "08:00" }))).error).toMatch(/after check-in/);
    expect((await saveAttendance({}, form({ ...valid, date: "2026-11-24" }))).error).toMatch(/future/);
    expect((await saveAttendance({}, form({ ...valid, status: "partying" }))).error).toMatch(/Unknown status/);
    expect((await saveAttendance({}, form({ ...valid, check_in: "" }))).error).toMatch(/check-in time/);
  });

  it("upserts the day with IST times and detaches it from any leave", async () => {
    vi.mocked(canManageAttendanceOf).mockResolvedValue(true);
    expect(await saveAttendance({}, form({ ...valid, remarks: "Client visit" }))).toEqual({ success: "Saved." });
    const call = vi.mocked(prisma.attendance.upsert).mock.calls[0][0] as {
      update: { check_in: Date; leave_id: null; marked_by: string; remarks: string };
    };
    expect(call.update.check_in.toISOString()).toBe("2026-11-20T03:35:00.000Z");
    expect(call.update.leave_id).toBeNull();
    expect(call.update.marked_by).toBe("me");
    expect(call.update.remarks).toBe("Client visit");
  });

  it("removes the record when everything is cleared", async () => {
    vi.mocked(canManageAttendanceOf).mockResolvedValue(true);
    await saveAttendance({}, form({ profile_id: "p1", date: "2026-11-20" }));
    expect(prisma.attendance.deleteMany).toHaveBeenCalled();
    expect(prisma.attendance.upsert).not.toHaveBeenCalled();
  });
});

describe("requestLeave", () => {
  it("validates the request", async () => {
    expect((await requestLeave({}, form({ type: "x", start_date: "2026-11-25" }))).error).toMatch(/leave type/);
    expect(
      (await requestLeave({}, form({ type: "sick", start_date: "2026-11-25", end_date: "2026-11-24" }))).error,
    ).toMatch(/before the start/);
    expect(
      (
        await requestLeave(
          {},
          form({ type: "sick", start_date: "2026-11-25", end_date: "2026-11-26", half_day: "on" }),
        )
      ).error,
    ).toMatch(/single day/);
  });

  it("refuses overlapping leave", async () => {
    vi.mocked(prisma.leaveRequest.findFirst).mockResolvedValue({ id: "l0" } as never);
    expect((await requestLeave({}, form({ type: "sick", start_date: "2026-11-25" }))).error).toMatch(/already/);
    expect(prisma.leaveRequest.create).not.toHaveBeenCalled();
  });

  it("creates a pending request for the caller", async () => {
    vi.mocked(prisma.leaveRequest.findFirst).mockResolvedValue(null);
    const r = await requestLeave({}, form({ type: "casual", start_date: "2026-11-25", reason: "Family" }));
    expect(r.success).toBeTruthy();
    expect(prisma.leaveRequest.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ profile_id: "me", type: "casual", reason: "Family", half_day: false }),
    });
  });

  it("lets people withdraw only their own pending requests", async () => {
    await cancelLeave(form({ id: "l1" }));
    expect(prisma.leaveRequest.updateMany).toHaveBeenCalledWith({
      where: { id: "l1", profile_id: "me", status: "pending" },
      data: { status: "cancelled" },
    });
  });
});

describe("decideLeave", () => {
  const leave = {
    id: "l1",
    profile_id: "p1",
    type: "sick",
    half_day: false,
    status: "pending",
    // Fri 20 – Mon 23 Nov 2026; Sunday 22 is a weekly off.
    start_date: new Date("2026-11-20T00:00:00Z"),
    end_date: new Date("2026-11-23T00:00:00Z"),
  };

  it("refuses someone who isn't the person's lead", async () => {
    vi.mocked(prisma.leaveRequest.findUnique).mockResolvedValue(leave as never);
    vi.mocked(canManageAttendanceOf).mockResolvedValue(false);
    expect(await decideLeave({}, form({ id: "l1", decision: "approve" }))).toEqual({ error: DENIED_MESSAGE });
  });

  it("approving marks working days, skipping weekly offs and days already worked", async () => {
    vi.mocked(prisma.leaveRequest.findUnique).mockResolvedValue(leave as never);
    vi.mocked(canManageAttendanceOf).mockResolvedValue(true);
    vi.mocked(prisma.attendance.findMany).mockResolvedValue([
      { work_date: new Date("2026-11-21T00:00:00Z") },
    ] as never);

    expect(await decideLeave({}, form({ id: "l1", decision: "approve" }))).toEqual({ success: "Leave approved." });
    const days = vi
      .mocked(prisma.attendance.upsert)
      .mock.calls.map((c) => (c[0] as { create: { work_date: Date; status: string } }).create);
    expect(days.map((d) => d.work_date.toISOString().slice(0, 10))).toEqual(["2026-11-20", "2026-11-23"]);
    expect(days.every((d) => d.status === "sick_leave")).toBe(true);
    expect(prisma.leaveRequest.update).toHaveBeenCalledWith({
      where: { id: "l1" },
      data: expect.objectContaining({ status: "approved", decided_by: "me" }),
    });
  });

  it("won't decide twice, and cancels only approved leave", async () => {
    vi.mocked(canManageAttendanceOf).mockResolvedValue(true);
    vi.mocked(prisma.leaveRequest.findUnique).mockResolvedValue({ ...leave, status: "rejected" } as never);
    expect((await decideLeave({}, form({ id: "l1", decision: "approve" }))).error).toMatch(/already been decided/);
    expect((await decideLeave({}, form({ id: "l1", decision: "cancel" }))).error).toMatch(/Only approved/);

    vi.mocked(prisma.leaveRequest.findUnique).mockResolvedValue({ ...leave, status: "approved" } as never);
    expect(await decideLeave({}, form({ id: "l1", decision: "cancel" }))).toEqual({ success: "Leave cancelled." });
    expect(prisma.attendance.deleteMany).toHaveBeenCalledWith({ where: { leave_id: "l1", check_in: null } });
  });
});

describe("saveWorkSettings", () => {
  it("needs attendance.manage_all", async () => {
    vi.mocked(authorize).mockResolvedValue(null);
    expect(await saveWorkSettings({}, form({}))).toEqual({ error: DENIED_MESSAGE });
  });

  it("validates and saves", async () => {
    vi.mocked(authorize).mockResolvedValue({ userId: "me" } as never);
    const bad = form({ shift_start: "18:00", shift_end: "09:00", late_grace_minutes: "10", standard_hours: "8" });
    expect((await saveWorkSettings({}, bad)).error).toMatch(/end after/);

    const good = form({ shift_start: "09:30", shift_end: "18:30", late_grace_minutes: "15", standard_hours: "8" });
    good.append("weekly_offs", "0");
    good.append("weekly_offs", "9");
    expect((await saveWorkSettings({}, good)).success).toBeTruthy();
    expect(prisma.workSettings.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        update: expect.objectContaining({ shift_start: "09:30", weekly_offs: [0], late_grace_minutes: 15 }),
      }),
    );
  });
});
