/**
 * Request header the middleware (`updateSession`) sets to the id it just
 * verified against Supabase's auth server, so `getSessionProfile()` doesn't
 * have to pay for a second identical network round trip. In its own file
 * (rather than `middleware.ts`) so Server Components can import just the
 * constant without pulling in `next/server`.
 */
export const VERIFIED_USER_HEADER = "x-verified-user-id";
