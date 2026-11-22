// Create any template role (src/lib/permissions.ts) that doesn't exist yet.
//
// Add-only and safe for production: an existing role is never changed, so
// permission edits made on the Roles page survive. (`db:seed`, by contrast,
// overwrites every template role's permissions; don't run it on production.)
//
// Run it with the target database's env, e.g. on the server:
//   npx tsc src/lib/permissions.ts --outDir .seed-build --module es2022 \
//     --target es2022 --moduleResolution bundler --skipLibCheck
//   node --env-file=.env.local scripts/add-missing-roles.mjs
// or against the test project:  npm run roles:add-missing
import { PrismaClient } from "@prisma/client";
import { ROLE_TEMPLATES } from "../.seed-build/permissions.js";

const url = process.env.DATABASE_URL ?? "";
const ref = url.match(/postgres\.([a-z0-9]+)[:@]/)?.[1] ?? "unknown project";
console.log(`Database project: ${ref}`);

const prisma = new PrismaClient();
const existing = new Set(
  (await prisma.role.findMany({ select: { name: true } })).map((r) => r.name),
);

let created = 0;
for (const t of ROLE_TEMPLATES) {
  if (existing.has(t.name)) {
    console.log(`  = ${t.name} (exists, left unchanged)`);
    continue;
  }
  await prisma.role.create({
    data: { name: t.name, is_admin: t.is_admin, permissions: t.permissions },
  });
  created++;
  console.log(`  + ${t.name} (${t.is_admin ? "admin" : `${t.permissions.length} permissions`})`);
}

console.log(`\nCreated ${created} role(s).`);
await prisma.$disconnect();
