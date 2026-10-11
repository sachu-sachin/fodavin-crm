import { describe, expect, it } from "vitest";
import { splitMeetings, toMeetingListItem } from "./meetings";

const at = (iso: string) => ({ id: iso, starts_at: iso });

describe("splitMeetings", () => {
  const today = "2026-03-10";

  it("counts a meeting from earlier today as current, not past", () => {
    // 09:00 IST on the 10th = 03:30 UTC.
    const { upcoming, past } = splitMeetings([at("2026-03-10T03:30:00.000Z")], today);
    expect(upcoming).toHaveLength(1);
    expect(past).toHaveLength(0);
  });

  it("puts late yesterday evening (IST) in the past", () => {
    // 23:30 IST on the 9th = 18:00 UTC on the 9th.
    const { upcoming, past } = splitMeetings([at("2026-03-09T18:00:00.000Z")], today);
    expect(upcoming).toHaveLength(0);
    expect(past).toHaveLength(1);
  });

  it("treats just after midnight IST as today", () => {
    // 00:05 IST on the 10th = 18:35 UTC on the 9th.
    const { upcoming } = splitMeetings([at("2026-03-09T18:35:00.000Z")], today);
    expect(upcoming).toHaveLength(1);
  });

  it("orders upcoming soonest first and past most recent first", () => {
    const { upcoming, past } = splitMeetings(
      [
        at("2026-03-12T05:00:00.000Z"),
        at("2026-03-01T05:00:00.000Z"),
        at("2026-03-11T05:00:00.000Z"),
        at("2026-03-05T05:00:00.000Z"),
      ],
      today,
    );
    expect(upcoming.map((m) => m.starts_at)).toEqual([
      "2026-03-11T05:00:00.000Z",
      "2026-03-12T05:00:00.000Z",
    ]);
    expect(past.map((m) => m.starts_at)).toEqual([
      "2026-03-05T05:00:00.000Z",
      "2026-03-01T05:00:00.000Z",
    ]);
  });
});

describe("toMeetingListItem", () => {
  it("flattens relations and counts into plain serialisable fields", () => {
    const item = toMeetingListItem({
      id: "m1",
      title: "Kickoff",
      type: "client",
      starts_at: new Date("2026-03-10T10:00:00Z"),
      company_id: "c1",
      project_id: null,
      company: { name: "Acme" },
      project: null,
      _count: { attendees: 3, action_items: 2 },
    });
    expect(item).toEqual({
      id: "m1",
      title: "Kickoff",
      type: "client",
      starts_at: "2026-03-10T10:00:00.000Z",
      company_id: "c1",
      company_name: "Acme",
      project_id: null,
      project_name: null,
      attendee_count: 3,
      open_action_count: 2,
    });
  });
});
