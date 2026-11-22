// Import the old Excel records (attendance, tasks, daily plans / EOD notes)
// for Praveen and Nagulan, from the JSON made by scripts/legacy/extract.py.
//
//   node --env-file=<env file> scripts/legacy/import.mjs <legacy.json>          # dry run
//   node --env-file=<env file> scripts/legacy/import.mjs <legacy.json> --apply  # write
//
// Safe to run more than once: an attendance day or daily report that already
// exists is left as it is (never overwritten), and each task carries its old
// sheet reference, so it's only created once. Only ever adds rows.
import { readFileSync } from "node:fs";
import { PrismaClient } from "@prisma/client";

const [file] = process.argv.slice(2).filter((a) => !a.startsWith("--"));
const apply = process.argv.includes("--apply");
if (!file) {
  console.error("Usage: node --env-file=<env> scripts/legacy/import.mjs <legacy.json> [--apply]");
  process.exit(1);
}

const data = JSON.parse(readFileSync(file, "utf8"));
const ref = (process.env.DATABASE_URL ?? "").match(/postgres\.([a-z0-9]+)[:@]/)?.[1] ?? "unknown";
console.log(`Database project: ${ref} · ${apply ? "APPLYING" : "dry run (add --apply to write)"}`);

const prisma = new PrismaClient();
const IST = "+05:30";
const dbDate = (key) => new Date(`${key}T00:00:00Z`);
const at = (key, hhmm) => (hhmm ? new Date(`${key}T${hhmm}:00${IST}`) : null);
const marker = (r) => `(Imported from the old task sheet: ${r})`;

// -- Who is who ---------------------------------------------------------------
const people = {};
for (const key of ["praveen", "nagulan"]) {
  const matches = await prisma.profile.findMany({
    where: { full_name: { contains: key, mode: "insensitive" } },
    select: { id: true, full_name: true, is_active: true },
  });
  if (matches.length !== 1) {
    console.error(`Expected exactly one profile named like "${key}", found ${matches.length}. Nothing imported.`);
    process.exit(1);
  }
  people[key] = matches[0].id;
  console.log(`  ${key} -> ${matches[0].full_name}${matches[0].is_active ? "" : " (inactive)"}`);
}

// -- Attendance ---------------------------------------------------------------
const existingDays = new Set(
  (
    await prisma.attendance.findMany({
      where: { profile_id: { in: Object.values(people) } },
      select: { profile_id: true, work_date: true },
    })
  ).map((a) => `${a.profile_id}|${a.work_date.toISOString().slice(0, 10)}`),
);
const attendance = data.attendance
  .filter((a) => !existingDays.has(`${people[a.person]}|${a.date}`))
  .map((a) => ({
    profile_id: people[a.person],
    work_date: dbDate(a.date),
    check_in: at(a.date, a.check_in),
    check_out: a.check_in && a.check_out && a.check_out > a.check_in ? at(a.date, a.check_out) : null,
    status: a.status,
    remarks: a.remarks,
  }));

// -- Tasks --------------------------------------------------------------------
const existingTasks = await prisma.task.findMany({
  where: { assignee_id: { in: Object.values(people) }, description: { contains: "(Imported from the old task sheet:" } },
  select: { description: true },
});
const imported = new Set(existingTasks.map((t) => t.description.match(/old task sheet: ([^)]+)\)/)?.[1]));
const tasks = data.tasks
  .filter((t) => !imported.has(t.ref))
  .map((t) => {
    const day = t.start_date ?? t.due_date;
    const started = t.status !== "todo" && day ? at(day, t.start_time) : null;
    const finished =
      t.status === "done" && day && t.end_time && (!t.start_time || t.end_time > t.start_time)
        ? at(day, t.end_time)
        : null;
    return {
      title: t.title,
      description: `${t.description}\n\n${marker(t.ref)}`,
      type: "general",
      status: t.status,
      priority: t.priority,
      workstream: t.workstream,
      assignee_id: people[t.person],
      due_date: t.due_date ? dbDate(t.due_date) : null,
      allocated_hours: t.allocated_hours,
      actual_hours: t.actual_hours,
      started_at: started,
      completed_at: finished,
    };
  });

// -- Daily reports ------------------------------------------------------------
const existingReports = new Set(
  (
    await prisma.dailyReport.findMany({
      where: { profile_id: { in: Object.values(people) } },
      select: { profile_id: true, report_date: true, kind: true },
    })
  ).map((r) => `${r.profile_id}|${r.report_date.toISOString().slice(0, 10)}|${r.kind}`),
);
const reports = data.reports
  .filter((r) => !existingReports.has(`${people[r.person]}|${r.date}|${r.kind}`))
  .map((r) => ({
    profile_id: people[r.person],
    report_date: dbDate(r.date),
    kind: r.kind,
    plan: r.plan ?? null,
    completed: r.completed ?? null,
    submitted_at: at(r.date, r.kind === "morning" ? "10:00" : "18:00"),
  }));

console.log(
  `To add: ${attendance.length} attendance days (of ${data.attendance.length}), ` +
    `${tasks.length} tasks (of ${data.tasks.length}), ${reports.length} daily reports (of ${data.reports.length}).`,
);

if (apply) {
  await prisma.$transaction([
    prisma.attendance.createMany({ data: attendance }),
    prisma.task.createMany({ data: tasks }),
    prisma.dailyReport.createMany({ data: reports }),
  ]);
  console.log("Done.");
}
await prisma.$disconnect();
