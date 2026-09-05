import { describe, expect, it } from "vitest";
import { daysBetween, renewalStatus } from "./renewals";

describe("daysBetween", () => {
  it("is zero for the same day", () => {
    expect(daysBetween("2026-01-01", "2026-01-01")).toBe(0);
  });

  it("is positive when `to` is after `from`", () => {
    expect(daysBetween("2026-01-01", "2026-01-11")).toBe(10);
  });

  it("is negative when `to` is before `from`", () => {
    expect(daysBetween("2026-01-11", "2026-01-01")).toBe(-10);
  });

  it("handles a month/year boundary", () => {
    expect(daysBetween("2025-12-30", "2026-01-02")).toBe(3);
  });
});

describe("renewalStatus", () => {
  const today = "2026-01-15";

  it("is 'expired' with a singular label for exactly one day ago", () => {
    const status = renewalStatus("2026-01-14", today);
    expect(status).toEqual({ state: "expired", daysLeft: -1, label: "Expired yesterday" });
  });

  it("is 'expired' with a plural label for multiple days ago", () => {
    const status = renewalStatus("2026-01-05", today);
    expect(status.state).toBe("expired");
    expect(status.daysLeft).toBe(-10);
    expect(status.label).toBe("Expired 10 days ago");
  });

  it("is 'due' with 'Expires today' when the expiry is today", () => {
    const status = renewalStatus(today, today);
    expect(status).toEqual({ state: "due", daysLeft: 0, label: "Expires today" });
  });

  it("is 'due' with 'Expires tomorrow' for exactly one day out", () => {
    const status = renewalStatus("2026-01-16", today);
    expect(status).toEqual({ state: "due", daysLeft: 1, label: "Expires tomorrow" });
  });

  it("is 'due' inside the renewal window (<= 30 days)", () => {
    const status = renewalStatus("2026-02-14", today); // 30 days out
    expect(status.state).toBe("due");
    expect(status.daysLeft).toBe(30);
    expect(status.label).toBe("In 30 days");
  });

  it("is 'ok' just past the renewal window (31 days)", () => {
    const status = renewalStatus("2026-02-15", today); // 31 days out
    expect(status.state).toBe("ok");
    expect(status.daysLeft).toBe(31);
    expect(status.label).toBe("In 31 days");
  });

  it("is 'ok' far in the future", () => {
    const status = renewalStatus("2027-01-15", today);
    expect(status.state).toBe("ok");
    expect(status.daysLeft).toBe(365);
  });
});
