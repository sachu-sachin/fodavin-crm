import { describe, expect, it } from "vitest";
import { allPermissions } from "./permissions";
import {
  digestFor,
  digestSubject,
  digestSummary,
  escapeHtml,
  renderDigestHtml,
  renderDigestText,
  type DigestPerson,
  type DigestSource,
} from "./digest";

const today = "2026-03-10";

const me: DigestPerson = {
  id: "me",
  name: "Asha",
  email: "asha@example.com",
  roleIds: ["dev"],
  permissions: new Set(),
  emailDigest: true,
};

const empty: DigestSource = { tasks: [], meetings: [], followUps: [], posts: [], policies: [] };

describe("digestFor", () => {
  it("is empty when nothing is due for the person", () => {
    expect(digestFor(me, empty, today)).toEqual([]);
  });

  it("lists only their tasks, overdue first, flagged as urgent", () => {
    const sections = digestFor(
      me,
      {
        ...empty,
        tasks: [
          { id: "t1", title: "Due today", due: today, assigneeId: "me", href: "/projects/p1", context: "Site" },
          { id: "t2", title: "Late", due: "2026-03-07", assigneeId: "me", href: "/tasks", context: null },
          { id: "t3", title: "Someone else's", due: today, assigneeId: "other", href: "/tasks", context: null },
        ],
      },
      today,
    );
    expect(sections).toHaveLength(1);
    expect(sections[0].items).toEqual([
      { text: "Late", detail: "Overdue since 7 Mar", href: "/tasks", urgent: true },
      { text: "Due today", detail: "Due today · Site", href: "/projects/p1", urgent: false },
    ]);
  });

  it("lists only meetings they're attending, in time order", () => {
    const sections = digestFor(
      me,
      {
        ...empty,
        meetings: [
          { id: "m2", title: "Review", startsAt: "2026-03-10T10:30:00.000Z", attendeeIds: ["me"], context: null },
          { id: "m1", title: "Standup", startsAt: "2026-03-10T04:00:00.000Z", attendeeIds: ["me", "x"], context: "Acme" },
          { id: "m3", title: "Not mine", startsAt: "2026-03-10T05:00:00.000Z", attendeeIds: ["x"], context: null },
        ],
      },
      today,
    );
    expect(sections[0].key).toBe("meetings");
    expect(sections[0].items.map((i) => [i.text, i.href])).toEqual([
      ["Standup", "/meetings/m1"],
      ["Review", "/meetings/m2"],
    ]);
    expect(sections[0].items[0].detail).toMatch(/9:30\s?am · Acme/i); // 04:00Z = 09:30 IST
  });

  it("gives pipeline follow-ups only to people who manage the pipeline", () => {
    const src = {
      ...empty,
      followUps: [{ id: "i1", title: "Acme redesign", due: "2026-03-09", context: "Acme" }],
    };
    expect(digestFor(me, src, today)).toEqual([]);
    const manager = { ...me, permissions: allPermissions() };
    const [section] = digestFor(manager, src, today);
    expect(section).toMatchObject({ key: "followUps", items: [{ urgent: true, href: "/pipeline" }] });
  });

  it("describes social posts by platform, scheduled time and reminder", () => {
    const [section] = digestFor(
      me,
      {
        ...empty,
        posts: [
          { id: "s1", title: "Tech tip", platform: "linkedin", assigneeId: "me", scheduledAt: "2026-03-10T03:30:00.000Z", reminderDue: true },
        ],
      },
      today,
    );
    expect(section.items[0].detail).toMatch(/^LinkedIn · scheduled 9:00\s?am · reminder due$/i);
  });

  it("asks for unacknowledged policies addressed to them, and nothing else", () => {
    const [section] = digestFor(
      me,
      {
        ...empty,
        policies: [
          { id: "a1", title: "Leave policy", audienceRoleIds: [], readBy: new Set() },
          { id: "a2", title: "Already read", audienceRoleIds: [], readBy: new Set(["me"]) },
          { id: "a3", title: "For designers", audienceRoleIds: ["design"], readBy: new Set() },
          { id: "a4", title: "For devs", audienceRoleIds: ["dev"], readBy: new Set() },
        ],
      },
      today,
    );
    expect(section.items.map((i) => i.text)).toEqual(["Leave policy", "For devs"]);
    expect(section.items[0].href).toBe("/announcements#announcement-a1");
  });
});

describe("summary and subject", () => {
  const sections = digestFor(
    { ...me, permissions: allPermissions() },
    {
      tasks: [
        { id: "t1", title: "A", due: "2026-03-01", assigneeId: "me", href: "/tasks", context: null },
        { id: "t2", title: "B", due: today, assigneeId: "me", href: "/tasks", context: null },
      ],
      meetings: [{ id: "m1", title: "M", startsAt: "2026-03-10T04:00:00.000Z", attendeeIds: ["me"], context: null }],
      followUps: [],
      posts: [],
      policies: [{ id: "a1", title: "P", audienceRoleIds: [], readBy: new Set() }],
    },
    today,
  );

  it("counts each section with correct plurals", () => {
    expect(digestSummary(sections)).toBe("2 tasks (1 overdue), 1 meeting, 1 policy to acknowledge");
  });

  it("builds the subject from the summary", () => {
    expect(digestSubject(sections)).toBe(
      "Fodavin OS — today: 2 tasks (1 overdue), 1 meeting, 1 policy to acknowledge",
    );
  });
});

describe("rendering", () => {
  const sections = digestFor(
    me,
    {
      ...empty,
      tasks: [
        { id: "t1", title: `<script>alert("x")</script> & co`, due: today, assigneeId: "me", href: "/projects/p1", context: null },
      ],
    },
    today,
  );

  it("escapes HTML special characters", () => {
    expect(escapeHtml(`<a href="x">'&'</a>`)).toBe("&lt;a href=&quot;x&quot;&gt;&#39;&amp;&#39;&lt;/a&gt;");
  });

  it("never puts a task title into the HTML email unescaped", () => {
    const html = renderDigestHtml("Asha", sections, "https://os.example.com/");
    expect(html).not.toContain("<script>");
    expect(html).toContain("&lt;script&gt;alert(&quot;x&quot;)&lt;/script&gt; &amp; co");
    expect(html).toContain('href="https://os.example.com/projects/p1"');
  });

  it("writes a plain-text version with full links, tolerating a trailing slash on APP_URL", () => {
    const text = renderDigestText("Asha", sections, "https://os.example.com/");
    expect(text).toContain("Hi Asha,");
    expect(text).toContain("YOUR TASKS");
    expect(text).toContain("https://os.example.com/projects/p1");
    expect(text).not.toContain("example.com//");
    expect(text).toContain("turn these emails off");
  });
});
