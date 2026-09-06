import { NextResponse, type NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { can, getSessionProfile } from "@/lib/auth";
import { csvResponse, rowsToCsv } from "@/lib/csv";
import { formatDateKey } from "@/lib/format";
import type { Prisma } from "@prisma/client";

export async function GET(request: NextRequest) {
  const session = await getSessionProfile();
  if (!session || !can(session, "clients.view")) {
    return NextResponse.json({ error: "Not authorized" }, { status: 403 });
  }

  const params = request.nextUrl.searchParams;
  const industry = params.get("industry");
  const search = params.get("q");

  const where: Prisma.CompanyWhereInput = {
    ...(industry ? { industry } : {}),
    ...(search ? { name: { contains: search, mode: "insensitive" } } : {}),
  };

  const companies = await prisma.company.findMany({
    where,
    include: { _count: { select: { contacts: true, projects: true } } },
    orderBy: { created_at: "desc" },
  });

  const csv = rowsToCsv(
    ["Name", "Industry", "Website", "Contacts", "Projects", "Added"],
    companies.map((c) => [
      c.name,
      c.industry,
      c.website,
      c._count.contacts,
      c._count.projects,
      formatDateKey(c.created_at.toISOString().slice(0, 10)),
    ]),
  );

  return csvResponse("clients.csv", csv);
}
