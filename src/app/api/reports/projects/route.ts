import { NextResponse, type NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { can, getSessionProfile } from "@/lib/auth";
import { csvResponse, rowsToCsv } from "@/lib/csv";
import {
  PROJECT_TYPES,
  PROJECT_PHASES,
  PROJECT_STATUSES,
  type ProjectType,
  type ProjectPhase,
  type ProjectStatus,
} from "@/lib/types";
import type { Prisma } from "@prisma/client";

const label = (list: { value: string; label: string }[], v: string) =>
  list.find((o) => o.value === v)?.label ?? v;

export async function GET(request: NextRequest) {
  const session = await getSessionProfile();
  if (!session || !can(session, "projects.view")) {
    return NextResponse.json({ error: "Not authorized" }, { status: 403 });
  }

  const params = request.nextUrl.searchParams;
  const status = params.get("status");
  const type = params.get("type");
  const phase = params.get("phase");
  const companyId = params.get("company");

  const where: Prisma.ProjectWhereInput = {
    ...(status ? { status: status as ProjectStatus } : {}),
    ...(type ? { type: type as ProjectType } : {}),
    ...(phase ? { phase: phase as ProjectPhase } : {}),
    ...(companyId ? { company_id: companyId } : {}),
  };

  const projects = await prisma.project.findMany({
    where,
    include: { company: { select: { name: true } } },
    orderBy: { created_at: "desc" },
  });

  const csv = rowsToCsv(
    ["Name", "Company", "Type", "Phase", "Status", "Budget"],
    projects.map((p) => [
      p.name,
      p.company?.name ?? "Internal",
      label(PROJECT_TYPES, p.type),
      label(PROJECT_PHASES, p.phase),
      label(PROJECT_STATUSES, p.status),
      p.budget ? Number(p.budget) : null,
    ]),
  );

  return csvResponse("projects.csv", csv);
}
