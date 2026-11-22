import { PrismaClient } from "@prisma/client";
import { createClient } from "@supabase/supabase-js";
import { E2E_PREFIX } from "./helpers";

/**
 * Safety net, not the primary cleanup path: each spec should clean up after
 * itself. This exists so a test that fails partway through (before its own
 * cleanup runs) doesn't leave junk in the test database permanently. Only
 * ever touches rows whose name/title starts with E2E_PREFIX.
 */
export default async function globalTeardown() {
  const prisma = new PrismaClient();
  try {
    // Children first — most FKs here cascade or set-null on delete, but
    // being explicit avoids relying on that to happen in the right order.
    await prisma.task.deleteMany({ where: { title: { startsWith: E2E_PREFIX } } });
    await prisma.paymentMilestone.deleteMany({ where: { label: { startsWith: E2E_PREFIX } } });
    await prisma.socialPost.deleteMany({ where: { title: { startsWith: E2E_PREFIX } } });
    // Cascades attendees; any action items were already swept above by title.
    await prisma.meeting.deleteMany({ where: { title: { startsWith: E2E_PREFIX } } });
    await prisma.announcement.deleteMany({ where: { title: { startsWith: E2E_PREFIX } } });
    // An onboarding cascades its checklist tasks; then the templates.
    await prisma.onboarding.deleteMany({ where: { template: { name: { startsWith: E2E_PREFIX } } } });
    await prisma.onboardingTemplate.deleteMany({ where: { name: { startsWith: E2E_PREFIX } } });
    await prisma.inquiry.deleteMany({ where: { title: { startsWith: E2E_PREFIX } } });
    // Cascades to that project's own tasks/milestones/documents/time entries.
    await prisma.project.deleteMany({ where: { name: { startsWith: E2E_PREFIX } } });
    await prisma.contact.deleteMany({ where: { full_name: { startsWith: E2E_PREFIX } } });
    await prisma.company.deleteMany({ where: { name: { startsWith: E2E_PREFIX } } });
    await prisma.role.deleteMany({ where: { name: { startsWith: E2E_PREFIX } } });
    await prisma.holiday.deleteMany({ where: { name: { startsWith: E2E_PREFIX } } });

    // The fixture admin's own attendance and leave only ever come from the
    // attendance spec (this is the test project), and today's check-in must
    // be gone before the next run or "Check in" won't be offered again.
    const fixture = await prisma.profile.findFirst({
      where: { email: process.env.TEST_ADMIN_EMAIL },
      select: { id: true },
    });
    if (fixture) {
      await prisma.attendance.deleteMany({ where: { profile_id: fixture.id } });
      await prisma.leaveRequest.deleteMany({ where: { profile_id: fixture.id } });
      await prisma.dailyReport.deleteMany({ where: { profile_id: fixture.id } });
    }

    // Employees are Supabase Auth users first, profiles second (a DB trigger
    // creates/deletes the profile in step with the auth user). Deleting the
    // profile row directly would leave an orphaned, permanently-undeletable-
    // by-Prisma auth user behind, so this goes through the Admin API instead.
    //
    // CRITICAL: exclude the fixture admin account. It previously named itself
    // "E2E Test Admin", which matched this exact filter — teardown ran (it
    // runs even after a *failed* test/setup) and deleted the very admin
    // global-setup had just logged in as, on every failed attempt. The
    // fixture is now named without the E2E_PREFIX, but this exclusion stays
    // as a second line of defense against that class of bug recurring.
    const testEmployees = await prisma.profile.findMany({
      where: {
        full_name: { startsWith: E2E_PREFIX },
        email: { not: process.env.TEST_ADMIN_EMAIL },
      },
      select: { id: true },
    });
    if (testEmployees.length > 0) {
      const admin = createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.SUPABASE_SERVICE_ROLE_KEY!,
        { auth: { autoRefreshToken: false, persistSession: false } },
      );
      for (const emp of testEmployees) {
        await admin.auth.admin.deleteUser(emp.id).catch(() => {});
      }
    }
  } finally {
    await prisma.$disconnect();
  }
}
