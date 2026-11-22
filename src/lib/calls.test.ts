import { describe, expect, it } from "vitest";
import { stageAfterCall } from "./calls";

describe("stageAfterCall", () => {
  it("moves a new lead to contacted once someone picks up", () => {
    expect(stageAfterCall("new", "connected")).toBe("contacted");
    expect(stageAfterCall("contacted", "connected")).toBeNull();
  });

  it("marks interest from the early stages only", () => {
    expect(stageAfterCall("new", "interested")).toBe("interested");
    expect(stageAfterCall("follow_up", "interested")).toBe("interested");
    expect(stageAfterCall("proposal_sent", "interested")).toBeNull();
  });

  it("a call-back request means follow up", () => {
    expect(stageAfterCall("contacted", "call_back")).toBe("follow_up");
    expect(stageAfterCall("negotiation", "call_back")).toBeNull();
  });

  it("not interested closes an open lead", () => {
    expect(stageAfterCall("negotiation", "not_interested")).toBe("not_interested");
  });

  it("attempts that didn't connect leave the stage alone", () => {
    for (const o of ["no_answer", "busy", "wrong_number"] as const) {
      expect(stageAfterCall("new", o)).toBeNull();
    }
  });

  it("never touches a closed lead", () => {
    for (const s of ["won", "lost", "not_interested"] as const) {
      expect(stageAfterCall(s, "interested")).toBeNull();
      expect(stageAfterCall(s, "not_interested")).toBeNull();
    }
  });
});
