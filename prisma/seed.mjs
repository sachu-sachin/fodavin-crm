// Seed the default dev-agency roles and their permission sets.
// Idempotent — safe to re-run.  Run with:  npm run db:seed
//
// Existing roles keep their name and admin flag, but have their permissions
// refreshed from the template. That makes this the way to adopt new
// permissions after an upgrade; hand-tuned roles not in the template list are
// left completely alone.
import { PrismaClient } from "@prisma/client";
// Compiled from src/lib/permissions.ts by the db:seed script, so the
// catalogue has exactly one source of truth.
import { ROLE_TEMPLATES } from "../.seed-build/permissions.js";

const prisma = new PrismaClient();

for (const template of ROLE_TEMPLATES) {
  await prisma.role.upsert({
    where: { name: template.name },
    update: {
      is_admin: template.is_admin,
      permissions: template.permissions,
    },
    create: {
      name: template.name,
      is_admin: template.is_admin,
      permissions: template.permissions,
    },
  });
  console.log(
    `  ${template.name.padEnd(20)} ${template.is_admin ? "admin (all)" : `${template.permissions.length} permissions`}`,
  );
}

console.log(`\n✅ Seeded ${ROLE_TEMPLATES.length} roles.`);
await prisma.$disconnect();
