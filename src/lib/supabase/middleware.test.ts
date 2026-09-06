import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

// -- Mocks --------------------------------------------------------------------
// These tests exist for one reason: the entire app's data-access control
// rests on getSessionProfile() trusting VERIFIED_USER_HEADER, which only
// this middleware is allowed to set (see src/lib/auth.ts). If a client
// could forge that header and have it survive to a Server Component, that
// would be a full account-impersonation hole — Prisma talks straight to
// Postgres with no row-level security of its own. So: prove a forged header
// never survives, and that the real one always overwrites it.

vi.mock("@supabase/ssr", () => ({
  createServerClient: vi.fn(),
}));

const { createServerClient } = await import("@supabase/ssr");
const { updateSession } = await import("./middleware");
const { VERIFIED_USER_HEADER } = await import("./verified-user-header");

function mockUser(id: string | null) {
  vi.mocked(createServerClient).mockReturnValue({
    auth: {
      getUser: vi.fn().mockResolvedValue({ data: { user: id ? { id } : null } }),
    },
  } as never);
}

function requestWithForgedHeader(path: string, forgedUserId: string) {
  return new NextRequest(`http://localhost:3000${path}`, {
    headers: { [VERIFIED_USER_HEADER]: forgedUserId },
  });
}

// NextResponse.next({ request: { headers } }) can't literally hand the
// modified request to the caller (middleware runs before the real request
// object exists) — it communicates the override via these response headers,
// which Next.js's own server reads to build the forwarded request. This is
// documented, stable framework behavior, not an internal implementation
// detail of this app.
function forwardedHeader(response: Response, name: string) {
  return response.headers.get(`x-middleware-request-${name}`);
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("updateSession", () => {
  it("never forwards a client-forged header when the request is unauthenticated", async () => {
    mockUser(null);
    const request = requestWithForgedHeader("/login", "victim-user-id");

    const response = await updateSession(request);

    expect(forwardedHeader(response, VERIFIED_USER_HEADER)).not.toBe(
      "victim-user-id",
    );
  });

  it("redirects an unauthenticated request to /login for a protected route, forged header or not", async () => {
    mockUser(null);
    const request = requestWithForgedHeader("/crm", "victim-user-id");

    const response = await updateSession(request);

    expect(response.status).toBe(307);
    expect(response.headers.get("location")).toContain("/login");
  });

  it("overwrites a forged header with the real verified id when authenticated", async () => {
    mockUser("real-user-id");
    const request = requestWithForgedHeader("/crm", "victim-user-id");

    const response = await updateSession(request);

    expect(forwardedHeader(response, VERIFIED_USER_HEADER)).toBe(
      "real-user-id",
    );
  });

  it("sets the verified header to the real user id when no header was sent at all", async () => {
    mockUser("real-user-id");
    const request = new NextRequest("http://localhost:3000/crm");

    const response = await updateSession(request);

    expect(forwardedHeader(response, VERIFIED_USER_HEADER)).toBe(
      "real-user-id",
    );
  });
});
