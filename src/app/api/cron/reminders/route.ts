import { NextResponse, type NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { isCronAuthorized } from "@/lib/cron";
import { istToday } from "@/lib/format";
import { loadDigestInputs } from "@/lib/digest-data";
import {
  digestFor,
  digestSubject,
  renderDigestHtml,
  renderDigestText,
} from "@/lib/digest";
import { createMailer, mailConfig } from "@/lib/mailer";

export const dynamic = "force-dynamic";

type SkipReason = "opted_out" | "no_email" | "nothing_due" | "already_sent";

/**
 * Sends today's reminder digests. Called once a day by a scheduler
 * (.github/workflows/reminders.yml) with `Authorization: Bearer <CRON_SECRET>`.
 * Not behind login (see src/lib/supabase/middleware.ts); the secret is the
 * only way in.
 *
 * `?dry=1` sends nothing and returns what would go to whom.
 *
 * Each person's day is claimed in digest_log *before* sending, so overlapping
 * or repeated runs never email anyone twice; a failed send releases the claim
 * so the next run retries it.
 */
export async function POST(request: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    return NextResponse.json(
      { error: "Reminders aren't set up: CRON_SECRET is not configured." },
      { status: 503 },
    );
  }
  if (!isCronAuthorized(request.headers.get("authorization"), secret)) {
    return NextResponse.json({ error: "Not authorized" }, { status: 401 });
  }

  const dry = request.nextUrl.searchParams.get("dry") === "1";
  const appUrl = process.env.APP_URL;
  const config = mailConfig();
  if (!appUrl || (!dry && !config)) {
    return NextResponse.json(
      { error: "Reminders aren't set up: APP_URL and the SMTP_* settings are required." },
      { status: 503 },
    );
  }

  const day = istToday();
  const { people, source } = await loadDigestInputs(day);
  const mailer = config && !dry ? createMailer(config) : null;

  const skipped: Record<SkipReason, number> = {
    opted_out: 0,
    no_email: 0,
    nothing_due: 0,
    already_sent: 0,
  };
  const preview: { id: string; name: string; subject: string; items: string[] }[] = [];
  const failures: { id: string; error: string }[] = [];
  let sent = 0;

  for (const person of people) {
    if (!person.emailDigest) {
      skipped.opted_out++;
      continue;
    }
    if (!person.email) {
      skipped.no_email++;
      continue;
    }
    const sections = digestFor(person, source, day);
    if (sections.length === 0) {
      skipped.nothing_due++;
      continue;
    }
    const subject = digestSubject(sections);
    const itemCount = sections.reduce((n, s) => n + s.items.length, 0);

    if (dry) {
      preview.push({
        id: person.id,
        name: person.name,
        subject,
        items: sections.flatMap((s) => s.items.map((i) => `${s.title}: ${i.text}`)),
      });
      continue;
    }

    const claim = await prisma.digestLog.createMany({
      data: [{ profile_id: person.id, day, item_count: itemCount }],
      skipDuplicates: true,
    });
    if (claim.count === 0) {
      skipped.already_sent++;
      continue;
    }

    try {
      await mailer!.send({
        to: person.email,
        subject,
        text: renderDigestText(person.name, sections, appUrl),
        html: renderDigestHtml(person.name, sections, appUrl),
      });
      sent++;
    } catch (err) {
      await prisma.digestLog
        .delete({ where: { profile_id_day: { profile_id: person.id, day } } })
        .catch(() => {});
      // The provider's message only; never the credentials.
      failures.push({
        id: person.id,
        error: err instanceof Error ? err.message.slice(0, 200) : "Unknown error",
      });
    }
  }

  return NextResponse.json(
    {
      day,
      dry,
      ...(dry ? { wouldSend: preview.length, preview } : { sent }),
      skipped,
      failed: failures.length,
      ...(failures.length ? { failures } : {}),
    },
    // A failure turns the scheduled run red, so it gets noticed.
    { status: failures.length ? 502 : 200 },
  );
}
