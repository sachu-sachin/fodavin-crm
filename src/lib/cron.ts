import "server-only";
import { createHash, timingSafeEqual } from "node:crypto";

/**
 * Checks a scheduled job's `Authorization: Bearer <CRON_SECRET>` header.
 * Both sides are hashed first so the comparison is constant-time whatever
 * the lengths, and a missing secret never authorises anything.
 */
export function isCronAuthorized(
  authorization: string | null,
  secret: string | undefined,
): boolean {
  if (!secret || !authorization?.startsWith("Bearer ")) return false;
  const given = createHash("sha256").update(authorization.slice(7)).digest();
  const expected = createHash("sha256").update(secret).digest();
  return timingSafeEqual(given, expected);
}
