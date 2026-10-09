import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("next/navigation", () => ({
  redirect: vi.fn((path: string) => {
    throw new Error(`REDIRECT:${path}`);
  }),
}));
vi.mock("@/lib/auth", () => ({ getSessionProfile: vi.fn() }));
vi.mock("@/lib/prisma", () => ({ prisma: { profile: { update: vi.fn() } } }));

const { getSessionProfile } = await import("@/lib/auth");
const { prisma } = await import("@/lib/prisma");
const { setEmailDigest } = await import("./account");

beforeEach(() => vi.resetAllMocks());

describe("setEmailDigest", () => {
  it("sends a signed-out caller to login", async () => {
    vi.mocked(getSessionProfile).mockResolvedValue(null);
    await expect(setEmailDigest(false)).rejects.toThrow("REDIRECT:/login");
    expect(prisma.profile.update).not.toHaveBeenCalled();
  });

  it("changes only the caller's own setting", async () => {
    vi.mocked(getSessionProfile).mockResolvedValue({ userId: "me" } as never);
    await setEmailDigest(false);
    expect(prisma.profile.update).toHaveBeenCalledWith({
      where: { id: "me" },
      data: { email_digest: false },
    });
  });

  it("treats anything but a real true as off", async () => {
    vi.mocked(getSessionProfile).mockResolvedValue({ userId: "me" } as never);
    await setEmailDigest("yes" as never);
    expect(vi.mocked(prisma.profile.update).mock.calls[0][0].data).toEqual({ email_digest: false });
  });
});
