import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({
  redirect: vi.fn((path: string) => {
    throw new Error(`REDIRECT:${path}`);
  }),
}));

vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(),
}));

vi.mock("@/lib/prisma", () => ({
  prisma: { profile: { findUnique: vi.fn() } },
}));

const { redirect } = await import("next/navigation");
const { createClient } = await import("@/lib/supabase/server");
const { prisma } = await import("@/lib/prisma");
const { signIn, signOut } = await import("./auth");

function form(fields: Record<string, string>): FormData {
  const fd = new FormData();
  for (const [k, v] of Object.entries(fields)) fd.set(k, v);
  return fd;
}

function mockSupabase({
  signInError = null as { message: string } | null,
  userId = "user-1",
}: { signInError?: { message: string } | null; userId?: string } = {}) {
  const client = {
    auth: {
      signInWithPassword: vi.fn().mockResolvedValue({
        data: signInError ? { user: null } : { user: { id: userId } },
        error: signInError,
      }),
      signOut: vi.fn().mockResolvedValue({ error: null }),
    },
  };
  vi.mocked(createClient).mockResolvedValue(client as never);
  return client;
}

beforeEach(() => vi.clearAllMocks());

describe("signIn", () => {
  it("requires both an email and a password", async () => {
    const result = await signIn({}, form({ email: "", password: "" }));
    expect(result.error).toMatch(/email and password/i);
  });

  it("reports a generic error on invalid credentials (no user enumeration)", async () => {
    mockSupabase({ signInError: { message: "Invalid login credentials" } });
    const result = await signIn({}, form({ email: "a@b.com", password: "wrong" }));
    expect(result.error).toBe("Invalid email or password.");
  });

  it("signs a deactivated user back out and reports deactivation", async () => {
    const client = mockSupabase({ userId: "u1" });
    vi.mocked(prisma.profile.findUnique).mockResolvedValue({ is_active: false } as never);

    const result = await signIn({}, form({ email: "a@b.com", password: "correct" }));

    expect(client.auth.signOut).toHaveBeenCalled();
    expect(result.error).toMatch(/deactivated/i);
  });

  it("redirects home on a successful, active sign-in", async () => {
    mockSupabase({ userId: "u1" });
    vi.mocked(prisma.profile.findUnique).mockResolvedValue({ is_active: true } as never);

    await expect(signIn({}, form({ email: "a@b.com", password: "correct" }))).rejects.toThrow("REDIRECT:/");
  });

  it("redirects home even when the profile row doesn't exist yet", async () => {
    // e.g. the DB trigger that creates the profile hasn't run — sign-in
    // shouldn't hard-fail just because the profile lookup came back empty.
    mockSupabase({ userId: "u1" });
    vi.mocked(prisma.profile.findUnique).mockResolvedValue(null);

    await expect(signIn({}, form({ email: "a@b.com", password: "correct" }))).rejects.toThrow("REDIRECT:/");
  });
});

describe("signOut", () => {
  it("signs out of Supabase and redirects to /login", async () => {
    const client = mockSupabase();
    await expect(signOut()).rejects.toThrow("REDIRECT:/login");
    expect(client.auth.signOut).toHaveBeenCalled();
    expect(redirect).toHaveBeenCalledWith("/login");
  });
});
