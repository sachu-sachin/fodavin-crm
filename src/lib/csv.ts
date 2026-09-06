import "server-only";

function escapeCell(value: string | number | null): string {
  const s = value === null ? "" : String(value);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

/** Builds an RFC 4180-ish CSV string from a header row and data rows. */
export function rowsToCsv(
  headers: string[],
  rows: (string | number | null)[][],
): string {
  const lines = [headers, ...rows].map((row) =>
    row.map(escapeCell).join(","),
  );
  return lines.join("\r\n") + "\r\n";
}

export function csvResponse(filename: string, csv: string): Response {
  return new Response(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${filename}"`,
    },
  });
}
