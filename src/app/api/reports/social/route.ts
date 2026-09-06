import { NextResponse, type NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { can, getSessionProfile } from "@/lib/auth";
import { csvResponse, rowsToCsv } from "@/lib/csv";
import {
  SOCIAL_PLATFORMS,
  POST_CATEGORIES,
  POST_STATUSES,
  type SocialPlatform,
  type PostCategory,
  type PostStatus,
} from "@/lib/types";
import { formatDateTimeIST } from "@/lib/format";
import type { Prisma } from "@prisma/client";

const label = (list: { value: string; label: string }[], v: string) =>
  list.find((o) => o.value === v)?.label ?? v;

export async function GET(request: NextRequest) {
  const session = await getSessionProfile();
  if (!session || !can(session, "social.view")) {
    return NextResponse.json({ error: "Not authorized" }, { status: 403 });
  }

  const params = request.nextUrl.searchParams;
  const platform = params.get("platform");
  const category = params.get("category");
  const status = params.get("status");
  const assignee = params.get("assignee");

  const where: Prisma.SocialPostWhereInput = {
    ...(platform ? { platform: platform as SocialPlatform } : {}),
    ...(category ? { category: category as PostCategory } : {}),
    ...(status ? { status: status as PostStatus } : {}),
    ...(assignee ? { assignee_id: assignee } : {}),
  };

  const [posts, companies, profiles] = await Promise.all([
    prisma.socialPost.findMany({ where, orderBy: { created_at: "desc" } }),
    prisma.company.findMany({ select: { id: true, name: true } }),
    prisma.profile.findMany({ select: { id: true, full_name: true, email: true } }),
  ]);

  const companyName = new Map(companies.map((c) => [c.id, c.name]));
  const assigneeName = new Map(
    profiles.map((p) => [p.id, p.full_name || p.email?.split("@")[0] || "User"]),
  );

  const csv = rowsToCsv(
    ["Title", "Platform", "Category", "Status", "Assignee", "Company", "Scheduled"],
    posts.map((p) => [
      p.title,
      label(SOCIAL_PLATFORMS, p.platform),
      p.category ? label(POST_CATEGORIES, p.category) : null,
      label(POST_STATUSES, p.status),
      p.assignee_id ? (assigneeName.get(p.assignee_id) ?? null) : null,
      p.company_id ? (companyName.get(p.company_id) ?? null) : null,
      p.scheduled_at ? formatDateTimeIST(p.scheduled_at.toISOString()) : null,
    ]),
  );

  return csvResponse("social-posts.csv", csv);
}
