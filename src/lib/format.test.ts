import { describe, expect, it, vi } from "vitest";
import {
  formatDateIST,
  formatDateKey,
  formatDateShortIST,
  formatDateTimeIST,
  formatINR,
  formatTimeIST,
  istDateKey,
  istInstant,
  istToday,
  monthYearLabel,
  parseISTInput,
  toISTInputValue,
} from "./format";

describe("formatINR", () => {
  it("returns null for null/undefined", () => {
    expect(formatINR(null)).toBeNull();
    expect(formatINR(undefined)).toBeNull();
  });

  it("formats zero", () => {
    expect(formatINR(0)).toBe("₹0");
  });

  it("formats with Indian digit grouping and no decimals", () => {
    // en-IN groups as 1,00,000 not 100,000.
    expect(formatINR(100000)).toBe("₹1,00,000");
    expect(formatINR(1234567)).toBe("₹12,34,567");
  });

  it("rounds off fractional amounts (maximumFractionDigits: 0)", () => {
    expect(formatINR(999.9)).toBe("₹1,000");
  });
});

describe("istDateKey / istToday", () => {
  it("converts a UTC instant that rolls into the next IST day", () => {
    // 20:00 UTC + 5:30 = 01:30 the next calendar day in IST.
    expect(istDateKey("2026-01-01T20:00:00Z")).toBe("2026-01-02");
  });

  it("keeps the same day when the IST offset doesn't cross midnight", () => {
    expect(istDateKey("2026-01-01T10:00:00Z")).toBe("2026-01-01");
  });

  it("accepts a Date object as well as a string", () => {
    expect(istDateKey(new Date("2026-06-15T00:00:00Z"))).toBe("2026-06-15");
  });

  it("istToday matches a manually computed IST key for a fixed clock", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-03-10T20:30:00Z")); // -> 2026-03-11 IST
    expect(istToday()).toBe("2026-03-11");
    vi.useRealTimers();
  });
});

describe("formatDateKey", () => {
  it("formats a bare date key as 'D MMM'", () => {
    expect(formatDateKey("2026-01-15")).toBe("15 Jan");
  });

  it("is anchored at noon IST so it can't drift to the adjacent day", () => {
    // Directly exercises the anchoring: formatDateShortIST at T12:00+05:30
    // on the same key should agree with formatDateKey.
    expect(formatDateKey("2026-12-31")).toBe(
      formatDateShortIST("2026-12-31T12:00:00+05:30"),
    );
  });
});

describe("monthYearLabel", () => {
  it("renders the month name and year", () => {
    expect(monthYearLabel(2026, 0)).toBe("January 2026");
    expect(monthYearLabel(2026, 11)).toBe("December 2026");
  });
});

describe("toISTInputValue / parseISTInput round trip", () => {
  it("returns '' for a missing value", () => {
    expect(toISTInputValue(null)).toBe("");
    expect(toISTInputValue(undefined)).toBe("");
  });

  it("round-trips an ISO instant through the datetime-local format", () => {
    const iso = "2026-05-20T09:15:00Z"; // 14:45 IST
    const local = toISTInputValue(iso);
    expect(local).toBe("2026-05-20T14:45");

    const parsed = parseISTInput(local);
    expect(parsed?.toISOString()).toBe(new Date(iso).toISOString());
  });

  it("parseISTInput returns null for an empty value", () => {
    expect(parseISTInput("")).toBeNull();
    expect(parseISTInput("   ")).toBeNull();
  });

  it("parseISTInput returns null for a garbage value", () => {
    expect(parseISTInput("not-a-date")).toBeNull();
  });
});

describe("istInstant", () => {
  it("builds the same instant as an explicit IST-offset ISO string", () => {
    const built = istInstant("2026-07-04", 9, 5);
    expect(built.toISOString()).toBe(
      new Date("2026-07-04T09:05:00+05:30").toISOString(),
    );
  });

  it("pads single-digit hour/minute", () => {
    const built = istInstant("2026-01-01", 1, 2);
    expect(built.toISOString()).toBe(
      new Date("2026-01-01T01:02:00+05:30").toISOString(),
    );
  });
});

describe("display formatters don't throw and carry the expected fields", () => {
  const iso = "2026-08-15T10:00:00Z"; // 15:30 IST

  it("formatTimeIST includes hour and minute", () => {
    expect(formatTimeIST(iso)).toMatch(/\d{1,2}:\d{2}/);
  });

  it("formatDateIST includes day, short month and year", () => {
    expect(formatDateIST(iso)).toContain("2026");
    expect(formatDateIST(iso)).toContain("Aug");
  });

  it("formatDateTimeIST includes a weekday and time", () => {
    const out = formatDateTimeIST(iso);
    expect(out).toContain("Aug");
    expect(out).toMatch(/\d{1,2}:\d{2}/);
  });
});
