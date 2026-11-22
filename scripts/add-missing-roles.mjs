// Bring template roles (src/lib/permissions.ts) onto a database without
// undoing anything done on the Roles page.
//
// - Creates any template role that doesn't exist yet.
// - With `--grant perm1,perm2`, also adds those permissions to the existing
//   template roles whose template includes them. Nothing is ever removed and
//   no other permission is touched, so it is safe for production. (`db:seed`,
//   by contrast, overwrites every template role's permissions; don't run it
//   on production.)
//
// Run it with the target database's env, e.g. on the server:
//   npx tsc src/lib/permissions.ts --outDir .seed-build --module es2022 \
//     --target es2022 --moduleResolution bundler --skipLibCheck
//   node --env-file=.env.local scripts/add-missing-roles.mjs --grant attendance.manage_team
// or against the test project:  npm run roles:add-missing -- --grant ...
import { PrismaClient } from "@prisma/client";
import { PERMISSIONS, ROLE_TEMPLATES } from "../.seed-build/permissions.js";

const grantArg = process.argv.indexOf("--grant");
const toGrant =
  grantArg === -1 ? [] : (process.argv[grantArg + 1] ?? "").split(",").map((p) => p.trim()).filter(Boolean);
const unknown = toGrant.filter((p) => !PERMISSIONS.includes(p));
if (unknown.length) {
  console.error(`Unknown permission(s): ${unknown.join(", ")}`);
  process.exit(1);
}

const url = process.env.DATABASE_URL ?? "";
const ref = url.match(/postgres\.([a-z0-9]+)[:@]/)?.[1] ?? "unknown project";
console.log(`Database project: ${ref}`);

const prisma = new PrismaClient();
const existing = new Map(
  (await prisma.role.findMany({ select: { id: true, name: true, permissions: true } })).map((r) => [r.name, r]),
);

let created = 0;
let granted = 0;
for (const t of ROLE_TEMPLATES) {
  const role = existing.get(t.name);
  if (!role) {
    await prisma.role.create({
      data: { name: t.name, is_admin: t.is_admin, permissions: t.permissions },
    });
    created++;
    console.log(`  + ${t.name} (${t.is_admin ? "admin" : `${t.permissions.length} permissions`})`);
    continue;
  }
  const add = toGrant.filter((p) => t.permissions.includes(p) && !role.permissions.includes(p));
  if (add.length) {
    await prisma.role.update({
      where: { id: role.id },
      data: { permissions: [...role.permissions, ...add] },
    });
    granted += add.length;
    console.log(`  ~ ${t.name}: added ${add.join(", ")}`);
  } else {
    console.log(`  = ${t.name} (unchanged)`);
  }
}

console.log(`\nCreated ${created} role(s), granted ${granted} permission(s).`);
await prisma.$disconnect();
