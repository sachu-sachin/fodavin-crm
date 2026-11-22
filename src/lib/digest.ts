// The daily reminder digest: what goes into each person's email, and how it
// reads. Pure — the database work lives in src/lib/digest-data.ts — so every
// rule here is unit-tested directly.

import type { Permission } from "@/lib/permissions";
import { SOCIAL_PLATFORMS, type SocialPlatform } from "@/lib/types";
import { formatDateKey, formatTimeIST } from "@/lib/format";

export interface DigestPerson {
  id: string;
  name: string;
  email: string | null;
  /** Main role first, then additional ones. */
  roleIds: string[];
  permissions: Set<Permission>;
  emailDigest: boolean;
}

/** Everything that might go into anyone's digest today, already fetched. */
export interface DigestSource {
  tasks: {
    id: string;
    title: string;
    /** "YYYY-MM-DD". */
    due: string;
    assigneeId: string;
    href: string;
    context: string | null;
  }[];
  meetings: {
    id: string;
    title: string;
    /** ISO instant. */
    startsAt: string;
    attendeeIds: string[];
    context: string | null;
  }[];
  followUps: {
    id: string;
    title: string;
    /** "YYYY-MM-DD". */
    due: string;
    context: string | null;
  }[];
  posts: {
    id: string;
    title: string;
    platform: SocialPlatform;
    assigneeId: string;
    /** ISO instant of the scheduled slot, if any. */
    scheduledAt: string | null;
    /** True when its reminder time has passed. */
    reminderDue: boolean;
  }[];
  policies: {
    id: string;
    title: string;
    audienceRoleIds: string[];
    /** Profile ids who have acknowledged it. */
    readBy: Set<string>;
  }[];
}

export interface DigestItem {
  text: string;
  detail: string | null;
  /** App path, e.g. "/meetings/…". */
  href: string;
  urgent: boolean;
}

export type DigestSectionKey = "tasks" | "meetings" | "followUps" | "posts" | "policies";

export interface DigestSection {
  key: DigestSectionKey;
  title: string;
  items: DigestItem[];
}

const PLATFORM_LABEL = Object.fromEntries(
  SOCIAL_PLATFORMS.map((p) => [p.value, p.label]),
) as Record<SocialPlatform, string>;

/** This person's sections for `today` ("YYYY-MM-DD", IST). Empty ones are left out. */
export function digestFor(
  person: DigestPerson,
  src: DigestSource,
  today: string,
): DigestSection[] {
  const sections: DigestSection[] = [];

  const tasks = src.tasks
    .filter((t) => t.assigneeId === person.id)
    .sort((a, b) => a.due.localeCompare(b.due) || a.title.localeCompare(b.title))
    .map((t) => {
      const overdue = t.due < today;
      return {
        text: t.title,
        detail: [overdue ? `Overdue since ${formatDateKey(t.due)}` : "Due today", t.context]
          .filter(Boolean)
          .join(" · "),
        href: t.href,
        urgent: overdue,
      };
    });
  if (tasks.length) sections.push({ key: "tasks", title: "Your tasks", items: tasks });

  const meetings = src.meetings
    .filter((m) => m.attendeeIds.includes(person.id))
    .sort((a, b) => a.startsAt.localeCompare(b.startsAt))
    .map((m) => ({
      text: m.title,
      detail: [formatTimeIST(m.startsAt), m.context].filter(Boolean).join(" · "),
      href: `/meetings/${m.id}`,
      urgent: false,
    }));
  if (meetings.length) sections.push({ key: "meetings", title: "Today's meetings", items: meetings });

  // Inquiries have no owner, so follow-ups go to whoever runs the pipeline.
  if (person.permissions.has("pipeline.manage")) {
    const followUps = src.followUps
      .slice()
      .sort((a, b) => a.due.localeCompare(b.due))
      .map((f) => {
        const overdue = f.due < today;
        return {
          text: f.title,
          detail: [overdue ? `Overdue since ${formatDateKey(f.due)}` : "Due today", f.context]
            .filter(Boolean)
            .join(" · "),
          href: "/pipeline",
          urgent: overdue,
        };
      });
    if (followUps.length) {
      sections.push({ key: "followUps", title: "Follow-ups to chase", items: followUps });
    }
  }

  const posts = src.posts
    .filter((p) => p.assigneeId === person.id)
    .sort((a, b) => (a.scheduledAt ?? "").localeCompare(b.scheduledAt ?? ""))
    .map((p) => ({
      text: p.title,
      detail: [
        PLATFORM_LABEL[p.platform],
        p.scheduledAt ? `scheduled ${formatTimeIST(p.scheduledAt)}` : null,
        p.reminderDue ? "reminder due" : null,
      ]
        .filter(Boolean)
        .join(" · "),
      href: "/social",
      urgent: false,
    }));
  if (posts.length) sections.push({ key: "posts", title: "Social posts", items: posts });

  const policies = src.policies
    .filter(
      (p) =>
        !p.readBy.has(person.id) &&
        (p.audienceRoleIds.length === 0 ||
          person.roleIds.some((id) => p.audienceRoleIds.includes(id))),
    )
    .map((p) => ({
      text: p.title,
      detail: "Please confirm you've read it",
      href: `/announcements#announcement-${p.id}`,
      urgent: false,
    }));
  if (policies.length) {
    sections.push({ key: "policies", title: "Policies to acknowledge", items: policies });
  }

  return sections;
}

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

/** e.g. "3 tasks (2 overdue), 1 meeting, 1 policy to acknowledge". */
export function digestSummary(sections: DigestSection[]): string {
  return sections
    .map((s) => {
      const n = s.items.length;
      switch (s.key) {
        case "tasks": {
          const overdue = s.items.filter((i) => i.urgent).length;
          return plural(n, "task") + (overdue ? ` (${overdue} overdue)` : "");
        }
        case "meetings":
          return plural(n, "meeting");
        case "followUps":
          return plural(n, "follow-up");
        case "posts":
          return plural(n, "social post");
        case "policies":
          return `${plural(n, "policy", "policies")} to acknowledge`;
      }
    })
    .join(", ");
}

export function digestSubject(sections: DigestSection[]): string {
  return `Fodavin OS — today: ${digestSummary(sections)}`;
}

export function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

const link = (appUrl: string, href: string) => `${appUrl.replace(/\/$/, "")}${href}`;

export function renderDigestText(
  name: string,
  sections: DigestSection[],
  appUrl: string,
): string {
  const lines = [`Hi ${name},`, "", `Here's what needs you today: ${digestSummary(sections)}.`];
  for (const s of sections) {
    lines.push("", s.title.toUpperCase());
    for (const i of s.items) {
      lines.push(`- ${i.text}${i.detail ? ` (${i.detail})` : ""}`, `  ${link(appUrl, i.href)}`);
    }
  }
  lines.push(
    "",
    `Open Fodavin OS: ${link(appUrl, "/")}`,
    "You can turn these emails off from the menu under your name.",
  );
  return lines.join("\n");
}

export function renderDigestHtml(
  name: string,
  sections: DigestSection[],
  appUrl: string,
): string {
  const body = sections
    .map(
      (s) => `
    <h2 style="font-size:15px;margin:24px 0 8px">${escapeHtml(s.title)}</h2>
    <ul style="margin:0;padding-left:20px">${s.items
      .map(
        (i) => `
      <li style="margin:0 0 6px">
        <a href="${escapeHtml(link(appUrl, i.href))}" style="color:#2563eb;text-decoration:none">${escapeHtml(i.text)}</a>${
          i.detail
            ? ` <span style="color:${i.urgent ? "#dc2626" : "#6b7280"}">— ${escapeHtml(i.detail)}</span>`
            : ""
        }
      </li>`,
      )
      .join("")}
    </ul>`,
    )
    .join("");

  return `<!doctype html>
<html><body style="font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;font-size:14px;line-height:1.5;color:#111827;max-width:560px;margin:0 auto;padding:16px">
  <p>Hi ${escapeHtml(name)},</p>
  <p>Here's what needs you today: <strong>${escapeHtml(digestSummary(sections))}</strong>.</p>${body}
  <p style="margin-top:28px"><a href="${escapeHtml(link(appUrl, "/"))}" style="color:#2563eb">Open Fodavin OS</a></p>
  <p style="color:#6b7280;font-size:12px">You can turn these emails off from the menu under your name.</p>
</body></html>`;
}
