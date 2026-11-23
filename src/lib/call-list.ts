// The Business Executive's call list: which lead to call next, plus the
// helpers for importing a pasted list of leads. Pure functions.

import { CALL_OUTCOMES, type CallOutcome } from "@/lib/calls";

export type QueueBucket = "overdue" | "today" | "new" | "later" | "no_date";

export const BUCKET_LABELS: Record<QueueBucket, string> = {
  overdue: "Overdue follow-ups",
  today: "Follow up today",
  new: "New: never called",
  no_date: "No follow-up date",
  later: "Follow up later",
};

/** Order the buckets are worked in. */
export const BUCKET_ORDER: QueueBucket[] = ["overdue", "today", "new", "no_date", "later"];

export interface QueueLead {
  next_follow_up: string | null; // YYYY-MM-DD
  calls: number;
  created_at: string; // ISO
}

/** Which bucket an open lead belongs in today. */
export function bucketOf(lead: QueueLead, today: string): QueueBucket {
  if (lead.next_follow_up && lead.next_follow_up < today) return "overdue";
  if (lead.next_follow_up === today) return "today";
  if (lead.calls === 0) return "new";
  if (!lead.next_follow_up) return "no_date";
  return "later";
}

/**
 * The call list in working order: by bucket, then oldest follow-up first,
 * then oldest lead first (so nothing sits untouched at the bottom).
 */
export function sortQueue<T extends QueueLead>(leads: T[], today: string): (T & { bucket: QueueBucket })[] {
  return leads
    .map((l) => ({ ...l, bucket: bucketOf(l, today) }))
    .sort(
      (a, b) =>
        BUCKET_ORDER.indexOf(a.bucket) - BUCKET_ORDER.indexOf(b.bucket) ||
        (a.next_follow_up ?? "9999").localeCompare(b.next_follow_up ?? "9999") ||
        a.created_at.localeCompare(b.created_at),
    );
}

/** Count today's calls by outcome. */
export function callTally(outcomes: CallOutcome[]): { total: number; by: Record<CallOutcome, number> } {
  const by = Object.fromEntries(CALL_OUTCOMES.map((o) => [o, 0])) as Record<CallOutcome, number>;
  for (const o of outcomes) by[o]++;
  return { total: outcomes.length, by };
}

/** One line for the EOD report, e.g. "Calls today: 42 (connected 18, interested 5, …)". */
export function callSummaryLine(t: ReturnType<typeof callTally>): string {
  if (t.total === 0) return "";
  const parts = CALL_OUTCOMES.filter((o) => t.by[o] > 0).map((o) => `${o.replace(/_/g, " ")} ${t.by[o]}`);
  return `Calls today: ${t.total} (${parts.join(", ")})`;
}

// -- Importing a pasted list -------------------------------------------------------

/**
 * Digits only, keeping the last 10 for Indian numbers, so "+91 98765 43210",
 * "098765-43210" and "9876543210" are the same lead. Null when too short to
 * be a phone number.
 */
export function normalisePhone(raw: string | null | undefined): string | null {
  const digits = String(raw ?? "").replace(/\D/g, "");
  if (digits.length < 8) return null;
  return digits.length > 10 ? digits.slice(-10) : digits;
}

export const IMPORT_COLUMNS = ["title", "contact_name", "phone", "email", "notes"] as const;
export type ImportColumn = (typeof IMPORT_COLUMNS)[number];
export type ImportRow = Record<ImportColumn, string>;

/** Header words people use in their sheets, mapped to our columns. */
const HEADER_ALIASES: Record<string, ImportColumn> = {
  business: "title",
  "business name": "title",
  company: "title",
  "company name": "title",
  name: "title",
  lead: "title",
  title: "title",
  shop: "title",
  contact: "contact_name",
  "contact name": "contact_name",
  "contact person": "contact_name",
  person: "contact_name",
  owner: "contact_name",
  phone: "phone",
  "phone number": "phone",
  mobile: "phone",
  "mobile number": "phone",
  number: "phone",
  contact_no: "phone",
  "contact no": "phone",
  "contact number": "phone",
  whatsapp: "phone",
  email: "email",
  "email id": "email",
  mail: "email",
  notes: "notes",
  note: "notes",
  remarks: "notes",
  address: "notes",
  area: "notes",
  category: "notes",
};

/** Split one CSV line, honouring "quoted, fields". */
function splitCsv(line: string): string[] {
  const out: string[] = [];
  let cur = "";
  let quoted = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (quoted) {
      if (ch === '"' && line[i + 1] === '"') {
        cur += '"';
        i++;
      } else if (ch === '"') quoted = false;
      else cur += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === ",") {
      out.push(cur);
      cur = "";
    } else cur += ch;
  }
  out.push(cur);
  return out;
}

/**
 * Parse rows copied from Excel / Google Sheets (tab-separated) or a CSV file.
 * A header row is recognised by its words; without one the columns are read
 * as: name, contact, phone, email, notes. Extra unknown columns go into notes.
 */
export function parseLeadSheet(text: string): { rows: ImportRow[]; errors: string[] } {
  const lines = text.replace(/\r/g, "").split("\n").filter((l) => l.trim());
  if (lines.length === 0) return { rows: [], errors: [] };
  const tabbed = lines[0].includes("\t");
  const split = (l: string) => (tabbed ? l.split("\t") : splitCsv(l)).map((c) => c.trim());

  const first = split(lines[0]).map((h) => h.toLowerCase().replace(/[:*]/g, "").trim());
  const mapped = first.map((h) => HEADER_ALIASES[h]);
  const hasHeader = mapped.filter(Boolean).length >= Math.min(2, first.length);
  const columns: (ImportColumn | null)[] = hasHeader ? mapped.map((m) => m ?? null) : [...IMPORT_COLUMNS];
  const extraNames = hasHeader ? first : [];

  const rows: ImportRow[] = [];
  const errors: string[] = [];
  lines.slice(hasHeader ? 1 : 0).forEach((line, i) => {
    const cells = split(line);
    const row: ImportRow = { title: "", contact_name: "", phone: "", email: "", notes: "" };
    const extras: string[] = [];
    cells.forEach((cell, c) => {
      if (!cell) return;
      const col = columns[c];
      if (col && !row[col]) row[col] = cell;
      else if (col === "notes") row.notes += `; ${cell}`;
      else extras.push(extraNames[c] ? `${extraNames[c]}: ${cell}` : cell);
    });
    if (extras.length) row.notes = [row.notes, ...extras].filter(Boolean).join("; ");
    if (!row.title) row.title = row.contact_name || row.phone;
    if (!row.title) {
      errors.push(`Row ${i + 1 + (hasHeader ? 1 : 0)}: no name or phone, skipped.`);
      return;
    }
    rows.push(row);
  });
  return { rows, errors };
}
