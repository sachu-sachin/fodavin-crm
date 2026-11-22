// Lead calls: outcomes, and how a logged call moves the lead through the
// pipeline. Pure functions, shared by the server actions and the tests.

import { CLOSED_INQUIRY_STAGES, type InquiryStage } from "@/lib/types";

export const CALL_DIRECTIONS = ["outgoing", "incoming"] as const;
export type CallDirection = (typeof CALL_DIRECTIONS)[number];

export const CALL_OUTCOMES = [
  "connected",
  "interested",
  "call_back",
  "no_answer",
  "busy",
  "not_interested",
  "wrong_number",
] as const;
export type CallOutcome = (typeof CALL_OUTCOMES)[number];

export const CALL_OUTCOME_LABELS: Record<CallOutcome, string> = {
  connected: "Connected",
  interested: "Interested",
  call_back: "Asked to call back",
  no_answer: "No answer",
  busy: "Busy / switched off",
  not_interested: "Not interested",
  wrong_number: "Wrong number",
};

export function isCallOutcome(v: string): v is CallOutcome {
  return (CALL_OUTCOMES as readonly string[]).includes(v);
}

export function isCallDirection(v: string): v is CallDirection {
  return (CALL_DIRECTIONS as readonly string[]).includes(v);
}

/** Stages a call never changes: the lead is already closed. */
export const CLOSED_STAGES: readonly InquiryStage[] = CLOSED_INQUIRY_STAGES;

const EARLY: readonly InquiryStage[] = ["new", "contacted", "follow_up"];

/**
 * The stage a lead should be in after a call, or null to leave it.
 * Only ever moves a lead forward through the early stages, never touches a
 * closed one, and never moves it back from proposal or negotiation.
 */
export function stageAfterCall(stage: InquiryStage, outcome: CallOutcome): InquiryStage | null {
  if (CLOSED_STAGES.includes(stage)) return null;
  switch (outcome) {
    case "not_interested":
      return "not_interested";
    case "interested":
      return EARLY.includes(stage) ? "interested" : null;
    case "call_back":
      return stage === "new" || stage === "contacted" ? "follow_up" : null;
    case "connected":
      return stage === "new" ? "contacted" : null;
    default:
      // No answer, busy, wrong number: an attempt, not contact.
      return null;
  }
}
