import { beforeEach, describe, expect, it, vi } from "vitest";

// -- Mocks --------------------------------------------------------------------
// getSessionProfile spans three boundaries (Supabase auth, Prisma, and
// next/navigation's redirect), so each is stubbed independently. `redirect`
// is modeled the way Next.js really behaves: it throws to interrupt
// execution, so callers relying on "redirect() then keep going" would fail
// these tests exactly as they'd fail in production.

vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(),
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    profile: {
      findUnique: vi.fn(),
    },
  },
}));

vi.mock("next/navigation", () => ({
  redirect: vi.fn((path: string) => {
    throw new Error(`REDIRECT:${path}`);
  }),
}));

// getSessionProfile checks this header first (set by the middleware, after
// its own real getUser() call) before falling back to its own getUser()
// call — see the "pre-verified via header" describe block below. Mocked to
// return no header by default so every other test exercises the fallback
// path exactly as before this header existed.
vi.mock("next/headers", () => ({
  headers: vi.fn(),
}));

const { createClient } = await import("@/lib/supabase/server");
const { prisma } = await import("@/lib/prisma");
const { redirect } = await import("next/navigation");
const { headers } = await import("next/headers");
const {
  authorize,
  can,
  canAny,
  DENIED_MESSAGE,
  getSessionProfile,
  requireAdmin,
  requirePermission,
} = await import("./auth");

function mockUser(id: string | null) {
  vi.mocked(createClient).mockResolvedValue({
    auth: { getUser: vi.fn().mockResolvedValue({ data: { user: id ? { id } : null } }) },
  } as never);
}

function mockVerifiedHeader(id: string | null) {
  vi.mocked(headers).mockResolvedValue({
    get: (name: string) => (name === "x-verified-user-id" ? id : null),
  } as never);
}

function mockProfile(profile: unknown) {
  vi.mocked(prisma.profile.findUnique).mockResolvedValue(profile as never);
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(redirect).mockImplementation((path: string) => {
    throw new Error(`REDIRECT:${path}`);
  });
  mockVerifiedHeader(null);
});

describe("getSessionProfile", () => {
  it("returns null when there is no authenticated user", async () => {
    mockUser(null);
    expect(await getSessionProfile()).toBeNull();
    expect(prisma.profile.findUnique).not.toHaveBeenCalled();
  });

  it("returns a non-admin session with expanded permissions from the role", async () => {
    mockUser("user-1");
    mockProfile({
      id: "user-1",
      is_active: true,
      role: { id: "role-1", name: "Frontend Developer", is_admin: false, permissions: ["clients.view"] },
    });

    const session = await getSessionProfile();
    expect(session?.userId).toBe("user-1");
    expect(session?.isAdmin).toBe(false);
    expect(session?.permissions.has("clients.view")).toBe(true);
    expect(session?.permissions.has("clients.manage")).toBe(false);
  });

  it("grants every permission when the role is_admin", async () => {
    mockUser("admin-1");
    mockProfile({
      id: "admin-1",
      is_active: true,
      role: { id: "role-admin", name: "Admin", is_admin: true, permissions: [] },
    });

    const session = await getSessionProfile();
    expect(session?.isAdmin).toBe(true);
    expect(session?.permissions.has("roles.manage")).toBe(true);
    expect(session?.permissions.has("finance.view")).toBe(true);
  });

  it("treats a user with no profile row as a non-admin with no permissions", async () => {
    mockUser("orphan-1");
    mockProfile(null);

    const session = await getSessionProfile();
    expect(session?.profile).toBeNull();
    expect(session?.isAdmin).toBe(false);
    expect(session?.permissions.size).toBe(0);
  });

  it("force-signs-out a deactivated profile instead of serving it", async () => {
    mockUser("deactivated-1");
    mockProfile({ id: "deactivated-1", is_active: false, role: null });

    await expect(getSessionProfile()).rejects.toThrow("REDIRECT:/auth/signout?reason=deactivated");
    expect(redirect).toHaveBeenCalledWith("/auth/signout?reason=deactivated");
  });
});

describe("getSessionProfile with a pre-verified header", () => {
  // The middleware only ever sets this header to an id getUser() already
  // verified server-side for this exact request (src/lib/supabase/middleware.ts
  // strips any client-supplied copy first) — so trusting it here, and
  // skipping a second getUser() call, is safe.
  it("uses the header's id and never calls Supabase auth again", async () => {
    mockVerifiedHeader("user-1");
    mockUser(null); // if this were consulted, the session would be null
    mockProfile({
      id: "user-1",
      is_active: true,
      role: { is_admin: false, permissions: ["clients.view"] },
    });

    const session = await getSessionProfile();
    expect(session?.userId).toBe("user-1");
    expect(createClient).not.toHaveBeenCalled();
  });

  it("falls back to a real getUser() call when the header is absent", async () => {
    mockVerifiedHeader(null);
    mockUser("user-1");
    mockProfile({ id: "user-1", is_active: true, role: null });

    const session = await getSessionProfile();
    expect(session?.userId).toBe("user-1");
    expect(createClient).toHaveBeenCalled();
  });
});

describe("can / canAny", () => {
  const session = {
    userId: "u1",
    profile: null,
    isAdmin: false,
    permissions: new Set(["clients.view", "projects.view"] as const),
  };

  it("can() is true only for a held permission", () => {
    expect(can(session as never, "clients.view")).toBe(true);
    expect(can(session as never, "clients.manage")).toBe(false);
  });

  it("can() is false for a null session", () => {
    expect(can(null, "clients.view")).toBe(false);
  });

  it("canAny() is true if at least one permission matches", () => {
    expect(canAny(session as never, ["clients.manage", "projects.view"])).toBe(true);
  });

  it("canAny() is false if none match, and for a null session", () => {
    expect(canAny(session as never, ["clients.manage", "finance.view"])).toBe(false);
    expect(canAny(null, ["clients.view"])).toBe(false);
  });
});

describe("requireAdmin", () => {
  it("redirects to /login when signed out", async () => {
    mockUser(null);
    await expect(requireAdmin()).rejects.toThrow("REDIRECT:/login");
  });

  it("redirects to / when signed in but not an admin", async () => {
    mockUser("u1");
    mockProfile({ id: "u1", is_active: true, role: { is_admin: false, permissions: [] } });
    await expect(requireAdmin()).rejects.toThrow("REDIRECT:/");
  });

  it("returns the session when the caller is an admin", async () => {
    mockUser("admin-1");
    mockProfile({ id: "admin-1", is_active: true, role: { is_admin: true, permissions: [] } });
    const session = await requireAdmin();
    expect(session.isAdmin).toBe(true);
  });
});

describe("requirePermission", () => {
  it("redirects to /login when signed out", async () => {
    mockUser(null);
    await expect(requirePermission("clients.view")).rejects.toThrow("REDIRECT:/login");
  });

  it("redirects to / when the permission is missing", async () => {
    mockUser("u1");
    mockProfile({ id: "u1", is_active: true, role: { is_admin: false, permissions: [] } });
    await expect(requirePermission("finance.view")).rejects.toThrow("REDIRECT:/");
  });

  it("returns the session when the permission is held", async () => {
    mockUser("u1");
    mockProfile({ id: "u1", is_active: true, role: { is_admin: false, permissions: ["finance.view"] } });
    const session = await requirePermission("finance.view");
    expect(session.permissions.has("finance.view")).toBe(true);
  });
});

describe("authorize", () => {
  it("redirects to /login when signed out", async () => {
    mockUser(null);
    await expect(authorize("clients.manage")).rejects.toThrow("REDIRECT:/login");
  });

  it("returns null (no redirect) when signed in but lacking the permission", async () => {
    mockUser("u1");
    mockProfile({ id: "u1", is_active: true, role: { is_admin: false, permissions: [] } });
    const result = await authorize("clients.manage");
    expect(result).toBeNull();
    expect(redirect).not.toHaveBeenCalled();
  });

  it("returns the session when the permission is held", async () => {
    mockUser("u1");
    mockProfile({ id: "u1", is_active: true, role: { is_admin: false, permissions: ["clients.manage"] } });
    const result = await authorize("clients.manage");
    expect(result?.userId).toBe("u1");
  });
});

describe("DENIED_MESSAGE", () => {
  it("is a human-readable, non-empty string", () => {
    expect(typeof DENIED_MESSAGE).toBe("string");
    expect(DENIED_MESSAGE.length).toBeGreaterThan(0);
  });
});
