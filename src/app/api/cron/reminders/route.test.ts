import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import type { DigestPerson, DigestSource } from "@/lib/digest";

vi.mock("@/lib/prisma", () => ({
  prisma: { digestLog: { createMany: vi.fn(), delete: vi.fn() } },
}));
vi.mock("@/lib/digest-data", () => ({ loadDigestInputs: vi.fn() }));
vi.mock("@/lib/mailer", () => ({ mailConfig: vi.fn(), createMailer: vi.fn() }));
vi.mock("@/lib/format", async (orig) => ({
  ...(await orig<typeof import("@/lib/format")>()),
  istToday: () => "2026-03-10",
}));

const { prisma } = await import("@/lib/prisma");
const { loadDigestInputs } = await import("@/lib/digest-data");
const { mailConfig, createMailer } = await import("@/lib/mailer");
const { POST } = await import("./route");

const SECRET = "test-cron-secret";
const send = vi.fn();

function person(id: string, over: Partial<DigestPerson> = {}): DigestPerson {
  return {
    id,
    name: id,
    email: `${id}@example.com`,
    roleIds: [],
    permissions: new Set(),
    emailDigest: true,
    ...over,
  };
}

/** One task due today for each of these people. */
function sourceFor(...ids: string[]): DigestSource {
  return {
    tasks: ids.map((id) => ({
      id: `t-${id}`,
      title: `Task for ${id}`,
      due: "2026-03-10",
      assigneeId: id,
      href: "/tasks",
      context: null,
    })),
    meetings: [],
    followUps: [],
    posts: [],
    policies: [],
  };
}

function call(opts: { auth?: string | null; dry?: boolean } = {}) {
  const headers: Record<string, string> = {};
  const auth = opts.auth === undefined ? `Bearer ${SECRET}` : opts.auth;
  if (auth) headers.authorization = auth;
  return POST(
    new NextRequest(`http://localhost/api/cron/reminders${opts.dry ? "?dry=1" : ""}`, {
      method: "POST",
      headers,
    }),
  );
}

beforeEach(() => {
  vi.resetAllMocks();
  vi.stubEnv("CRON_SECRET", SECRET);
  vi.stubEnv("APP_URL", "https://os.example.com");
  vi.mocked(mailConfig).mockReturnValue({
    host: "smtp.example.com",
    port: 587,
    user: "u",
    pass: "p",
    from: "OS <os@example.com>",
  });
  vi.mocked(createMailer).mockReturnValue({ send, close: vi.fn() } as never);
  vi.mocked(prisma.digestLog.createMany).mockResolvedValue({ count: 1 });
  vi.mocked(prisma.digestLog.delete).mockResolvedValue({} as never);
});

afterEach(() => vi.unstubAllEnvs());

describe("POST /api/cron/reminders", () => {
  it("refuses everything when CRON_SECRET isn't configured", async () => {
    vi.stubEnv("CRON_SECRET", "");
    const res = await call();
    expect(res.status).toBe(503);
    expect(loadDigestInputs).not.toHaveBeenCalled();
  });

  it("rejects a missing or wrong secret", async () => {
    expect((await call({ auth: null })).status).toBe(401);
    expect((await call({ auth: "Bearer nope" })).status).toBe(401);
    expect(loadDigestInputs).not.toHaveBeenCalled();
  });

  it("needs SMTP settings to send, but not for a dry run", async () => {
    vi.mocked(mailConfig).mockReturnValue(null);
    vi.mocked(loadDigestInputs).mockResolvedValue({ people: [], source: sourceFor() });
    expect((await call()).status).toBe(503);
    expect((await call({ dry: true })).status).toBe(200);
  });

  it("dry run previews who would get what, sending and recording nothing", async () => {
    vi.mocked(loadDigestInputs).mockResolvedValue({
      people: [person("asha"), person("ravi")],
      source: sourceFor("asha"),
    });
    const res = await call({ dry: true });
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body).toMatchObject({
      day: "2026-03-10",
      dry: true,
      wouldSend: 1,
      preview: [
        {
          id: "asha",
          subject: "Fodavin OS — today: 1 task",
          items: ["Your tasks: Task for asha"],
        },
      ],
      skipped: { nothing_due: 1 },
    });
    expect(send).not.toHaveBeenCalled();
    expect(prisma.digestLog.createMany).not.toHaveBeenCalled();
  });

  it("claims the day, then sends one email per person with something due", async () => {
    vi.mocked(loadDigestInputs).mockResolvedValue({
      people: [
        person("asha"),
        person("off", { emailDigest: false }),
        person("noemail", { email: null }),
        person("idle"),
      ],
      source: sourceFor("asha", "off", "noemail"),
    });
    const res = await call();
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body).toMatchObject({
      sent: 1,
      skipped: { opted_out: 1, no_email: 1, nothing_due: 1, already_sent: 0 },
      failed: 0,
    });
    expect(prisma.digestLog.createMany).toHaveBeenCalledWith({
      data: [{ profile_id: "asha", day: "2026-03-10", item_count: 1 }],
      skipDuplicates: true,
    });
    expect(send).toHaveBeenCalledTimes(1);
    const mail = send.mock.calls[0][0];
    expect(mail.to).toBe("asha@example.com");
    expect(mail.subject).toBe("Fodavin OS — today: 1 task");
    expect(mail.text).toContain("https://os.example.com/tasks");
    expect(mail.html).toContain("Task for asha");
  });

  it("doesn't email anyone already sent to today", async () => {
    vi.mocked(loadDigestInputs).mockResolvedValue({ people: [person("asha")], source: sourceFor("asha") });
    vi.mocked(prisma.digestLog.createMany).mockResolvedValue({ count: 0 });
    const body = await (await call()).json();
    expect(body).toMatchObject({ sent: 0, skipped: { already_sent: 1 } });
    expect(send).not.toHaveBeenCalled();
  });

  it("releases the claim when sending fails, so a re-run retries, and answers 502", async () => {
    vi.mocked(loadDigestInputs).mockResolvedValue({
      people: [person("asha"), person("ravi")],
      source: sourceFor("asha", "ravi"),
    });
    send.mockRejectedValueOnce(new Error("535 Authentication failed")).mockResolvedValueOnce(undefined);
    const res = await call();
    const body = await res.json();

    expect(res.status).toBe(502);
    expect(body).toMatchObject({
      sent: 1,
      failed: 1,
      failures: [{ id: "asha", error: "535 Authentication failed" }],
    });
    expect(prisma.digestLog.delete).toHaveBeenCalledWith({
      where: { profile_id_day: { profile_id: "asha", day: "2026-03-10" } },
    });
  });
});
