import { describe, expect, it } from "vitest";
import {
  bucketOf,
  callSummaryLine,
  callTally,
  normalisePhone,
  parseLeadSheet,
  sortQueue,
} from "./call-list";

const today = "2026-11-23";
const lead = (next_follow_up: string | null, calls: number, created_at = "2026-11-01T00:00:00Z") => ({
  next_follow_up,
  calls,
  created_at,
});

describe("bucketOf / sortQueue", () => {
  it("puts overdue, then today's, then never-called leads first", () => {
    expect(bucketOf(lead("2026-11-20", 2), today)).toBe("overdue");
    expect(bucketOf(lead(today, 0), today)).toBe("today");
    expect(bucketOf(lead(null, 0), today)).toBe("new");
    expect(bucketOf(lead(null, 3), today)).toBe("no_date");
    expect(bucketOf(lead("2026-12-01", 1), today)).toBe("later");
  });

  it("orders by bucket, then oldest follow-up, then oldest lead", () => {
    const q = sortQueue(
      [
        { id: "later", ...lead("2026-12-01", 1) },
        { id: "new-recent", ...lead(null, 0, "2026-11-20T00:00:00Z") },
        { id: "overdue-2", ...lead("2026-11-22", 1) },
        { id: "new-old", ...lead(null, 0, "2026-11-02T00:00:00Z") },
        { id: "overdue-1", ...lead("2026-11-10", 1) },
        { id: "today", ...lead(today, 1) },
      ],
      today,
    );
    expect(q.map((x) => x.id)).toEqual(["overdue-1", "overdue-2", "today", "new-old", "new-recent", "later"]);
  });
});

describe("call tally", () => {
  it("counts outcomes and writes the EOD line", () => {
    const t = callTally(["connected", "no_answer", "connected", "interested"]);
    expect(t.total).toBe(4);
    expect(t.by.connected).toBe(2);
    expect(callSummaryLine(t)).toBe("Calls today: 4 (connected 2, interested 1, no answer 1)");
    expect(callSummaryLine(callTally([]))).toBe("");
  });
});

describe("normalisePhone", () => {
  it("treats the usual ways of writing an Indian number as the same", () => {
    expect(normalisePhone("+91 98765 43210")).toBe("9876543210");
    expect(normalisePhone("098765-43210")).toBe("9876543210");
    expect(normalisePhone("9876543210")).toBe("9876543210");
    expect(normalisePhone("0422 2345678")).toBe("4222345678");
    expect(normalisePhone("12345")).toBeNull();
    expect(normalisePhone(null)).toBeNull();
  });
});

describe("parseLeadSheet", () => {
  it("reads rows pasted from Excel with a header, mapping common column names", () => {
    const text = [
      "Business Name\tContact Person\tMobile\tArea\tEmail",
      "Sri Dental Care\tDr. Priya\t98765 43210\tRS Puram\tpriya@example.com",
      "Kovai Gym\t\t+91 90000 11111\tGandhipuram\t",
    ].join("\n");
    const { rows, errors } = parseLeadSheet(text);
    expect(errors).toEqual([]);
    expect(rows).toEqual([
      { title: "Sri Dental Care", contact_name: "Dr. Priya", phone: "98765 43210", email: "priya@example.com", notes: "RS Puram" },
      { title: "Kovai Gym", contact_name: "", phone: "+91 90000 11111", email: "", notes: "Gandhipuram" },
    ]);
  });

  it("reads CSV with quotes and no header in the default column order", () => {
    const { rows } = parseLeadSheet('"Anand Jewellers, Main Road",Anand,9876500000,,Wants a site\n');
    expect(rows[0]).toEqual({
      title: "Anand Jewellers, Main Road",
      contact_name: "Anand",
      phone: "9876500000",
      email: "",
      notes: "Wants a site",
    });
  });

  it("uses the phone as the name when there is none, and skips empty rows", () => {
    const { rows, errors } = parseLeadSheet("Name\tPhone\n\t9876511111\n\t\n");
    expect(rows[0].title).toBe("9876511111");
    expect(rows).toHaveLength(1);
    expect(errors).toEqual([]);
  });

  it("reports rows with neither a name nor a phone", () => {
    const { rows, errors } = parseLeadSheet("Name\tPhone\tEmail\n\t\tx@y.com\n");
    expect(rows).toHaveLength(0);
    expect(errors[0]).toMatch(/Row 2/);
  });
});
