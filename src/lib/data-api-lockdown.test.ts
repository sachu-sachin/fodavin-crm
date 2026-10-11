import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

// Static guard over supabase/setup.sql. All app data goes through Prisma, so
// Supabase's Data API (reachable with the public anon key, or an employee's
// own access token) must expose nothing — any policy or grant for
// anon/authenticated would bypass the role permissions in permissions.ts.
// e2e/data-api.spec.ts checks the same thing against a real project.

const setupSql = readFileSync(
  path.resolve(__dirname, "../../supabase/setup.sql"),
  "utf8",
)
  .split(/\r?\n/)
  .map((line) => line.replace(/--.*$/, ""))
  .join("\n");

describe("supabase/setup.sql keeps the Data API out of app data", () => {
  it("creates no RLS policies", () => {
    expect(setupSql).not.toMatch(/create\s+policy/i);
  });

  it("grants nothing to the anon or authenticated roles", () => {
    expect(setupSql).not.toMatch(/\bgrant\b[^;]*\b(anon|authenticated)\b/i);
  });

  it("enables RLS on every public table, not a hand-maintained list", () => {
    expect(setupSql).toMatch(/from\s+pg_tables\s+where\s+schemaname\s*=\s*'public'/i);
    expect(setupSql).toMatch(/enable\s+row\s+level\s+security/i);
  });

  it("adds updated_at triggers to every table with that column, not a hand-maintained list", () => {
    expect(setupSql).toMatch(/information_schema\.columns[\s\S]*column_name\s*=\s*'updated_at'/i);
    expect(setupSql).not.toMatch(/foreach\s+t\s+in\s+array\s+(?:array\s*)?\[[^\]]*\]\s*loop\s*execute\s+format\(\s*'drop trigger/i);
  });

  it("revokes existing and future table access from anon and authenticated", () => {
    expect(setupSql).toMatch(
      /revoke\s+all\s+on\s+all\s+tables\s+in\s+schema\s+public\s+from\s+anon,\s*authenticated/i,
    );
    expect(setupSql).toMatch(
      /alter\s+default\s+privileges[^;]*revoke\s+all\s+on\s+tables\s+from\s+anon,\s*authenticated/i,
    );
  });
});
