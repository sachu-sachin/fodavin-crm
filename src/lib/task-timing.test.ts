import { describe, expect, it } from "vitest";
import { hoursVariance, timingForStatusChange, type TaskTiming } from "./task-timing";

const at = (iso: string) => new Date(iso);
const base: TaskTiming = { status: "todo", started_at: null, completed_at: null, actual_hours: null };

describe("timingForStatusChange", () => {
  it("does nothing when the status doesn't change", () => {
    expect(timingForStatusChange(base, "todo", at("2026-11-23T05:00:00Z"))).toEqual({});
  });

  it("stamps the start the first time work begins", () => {
    const now = at("2026-11-23T04:30:00Z");
    expect(timingForStatusChange(base, "in_progress", now)).toEqual({ started_at: now });
    const started = { ...base, status: "in_progress" as const, started_at: at("2026-11-22T04:00:00Z") };
    expect(timingForStatusChange(started, "review", now)).toEqual({});
  });

  it("stamps completion and fills actual hours for same-day work", () => {
    const started = { ...base, status: "in_progress" as const, started_at: at("2026-11-23T04:30:00Z") }; // 10:00 IST
    const now = at("2026-11-23T07:45:00Z"); // 13:15 IST
    expect(timingForStatusChange(started, "done", now)).toEqual({ completed_at: now, actual_hours: 3.25 });
  });

  it("leaves actual hours alone across days or when already entered", () => {
    const overnight = { ...base, status: "in_progress" as const, started_at: at("2026-11-22T10:00:00Z") };
    const now = at("2026-11-23T07:00:00Z");
    expect(timingForStatusChange(overnight, "done", now)).toEqual({ completed_at: now });

    const entered = { ...base, status: "in_progress" as const, started_at: at("2026-11-23T04:30:00Z"), actual_hours: 2 };
    expect(timingForStatusChange(entered, "done", now)).toEqual({ completed_at: now });
  });

  it("straight from To do to Done stamps both, with no hours", () => {
    const now = at("2026-11-23T07:00:00Z");
    expect(timingForStatusChange(base, "done", now)).toEqual({ started_at: now, completed_at: now });
  });

  it("clears completion when a done task is reopened", () => {
    const done = { status: "done" as const, started_at: at("2026-11-23T04:30:00Z"), completed_at: at("2026-11-23T07:00:00Z"), actual_hours: 2.5 };
    expect(timingForStatusChange(done, "in_progress", at("2026-11-24T04:00:00Z"))).toEqual({ completed_at: null });
  });
});

describe("hoursVariance", () => {
  it("is allocated minus actual", () => {
    expect(hoursVariance(4, 5.5)).toBe(-1.5);
    expect(hoursVariance(null, 2)).toBeNull();
  });
});
