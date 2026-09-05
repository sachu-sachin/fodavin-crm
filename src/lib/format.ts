// India-first formatting helpers.
// Everything is rendered in IST (Asia/Kolkata) with locale en-IN and currency
// INR. Fixing the timezone + locale makes server and client output identical,
// which also eliminates React hydration mismatches for dates/times.

export const IST_TZ = "Asia/Kolkata";
const LOCALE = "en-IN";

// India has no DST, so the offset is always +05:30 — safe to hardcode.
const IST_OFFSET = "+05:30";

const MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

// --- Currency (₹) -----------------------------------------------------------

const inr = new Intl.NumberFormat(LOCALE, {
  style: "currency",
  currency: "INR",
  maximumFractionDigits: 0,
});

export function formatINR(n: number | null | undefined): string | null {
  if (n == null) return null;
  return inr.format(n);
}

// --- Display formatters (always IST) ----------------------------------------

export function formatTimeIST(iso: string): string {
  return new Date(iso).toLocaleTimeString(LOCALE, {
    timeZone: IST_TZ,
    hour: "numeric",
    minute: "2-digit",
  });
}

export function formatDateIST(iso: string): string {
  return new Date(iso).toLocaleDateString(LOCALE, {
    timeZone: IST_TZ,
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

export function formatDateShortIST(iso: string): string {
  return new Date(iso).toLocaleDateString(LOCALE, {
    timeZone: IST_TZ,
    day: "numeric",
    month: "short",
  });
}

export function formatDateTimeIST(iso: string): string {
  return new Date(iso).toLocaleString(LOCALE, {
    timeZone: IST_TZ,
    weekday: "short",
    day: "numeric",
    month: "short",
    hour: "numeric",
    minute: "2-digit",
  });
}

export function monthYearLabel(year: number, month: number): string {
  return `${MONTHS[month]} ${year}`;
}

// --- Date keys / inputs (IST) -----------------------------------------------

const keyFmt = new Intl.DateTimeFormat("en-CA", {
  timeZone: IST_TZ,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

/** "YYYY-MM-DD" for the given instant, in IST. */
export function istDateKey(d: Date | string): string {
  return keyFmt.format(typeof d === "string" ? new Date(d) : d);
}

/** Today in IST as "YYYY-MM-DD". */
export function istToday(): string {
  return keyFmt.format(new Date());
}

/**
 * Format a bare "YYYY-MM-DD" date key for display.
 * Anchored at noon IST so the day can't drift across the date boundary.
 */
export function formatDateKey(key: string): string {
  return formatDateShortIST(`${key}T12:00:00${IST_OFFSET}`);
}

const inputFmt = new Intl.DateTimeFormat("en-CA", {
  timeZone: IST_TZ,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  hour12: false,
});

/** ISO instant -> "YYYY-MM-DDTHH:mm" IST wall time for <input datetime-local>. */
export function toISTInputValue(iso: string | null | undefined): string {
  if (!iso) return "";
  const parts = inputFmt.formatToParts(new Date(iso));
  const g = (t: string) => parts.find((p) => p.type === t)?.value ?? "00";
  const hour = g("hour") === "24" ? "00" : g("hour");
  return `${g("year")}-${g("month")}-${g("day")}T${hour}:${g("minute")}`;
}

/** Parse a datetime-local value ("YYYY-MM-DDTHH:mm") as IST wall time. */
export function parseISTInput(value: string): Date | null {
  const v = value.trim();
  if (!v) return null;
  const withSeconds = v.length === 16 ? `${v}:00` : v;
  const d = new Date(`${withSeconds}${IST_OFFSET}`);
  return Number.isNaN(d.getTime()) ? null : d;
}

/** Build an instant from an IST date key + hour/minute. */
export function istInstant(dateKey: string, hour: number, minute: number): Date {
  const p = (n: number) => String(n).padStart(2, "0");
  return new Date(`${dateKey}T${p(hour)}:${p(minute)}:00${IST_OFFSET}`);
}
