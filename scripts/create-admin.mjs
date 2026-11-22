// Bootstrap the first admin account.
//
// Employees are normally created by an admin from within the app — but the
// very first admin has to be created out-of-band. Run this once:
//
//   node --env-file=.env.local scripts/create-admin.mjs \
//     admin@fodavin.com "StrongPassword123" "Founder Name"
//
// Requires NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY and
// DATABASE_URL in that env file, with the schema pushed and roles seeded.

import { createClient } from "@supabase/supabase-js";
import { PrismaClient } from "@prisma/client";

const [, , email, password, fullName] = process.argv;

if (!email || !password) {
  console.error(
    'Usage: node --env-file=.env.local scripts/create-admin.mjs <email> <password> "<Full Name>"',
  );
  process.exit(1);
}

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!url || !serviceKey) {
  console.error(
    "Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in the environment.",
  );
  process.exit(1);
}

const admin = createClient(url, serviceKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});

// Read the role with Prisma: supabase/setup.sql locks the Data API out of
// every app table (Finding 11 in docs/testing.md), so admin.from("roles")
// is refused even with the service key.
const prisma = new PrismaClient();
const role = await prisma.role.findUnique({
  where: { name: "Admin" },
  select: { id: true },
});
await prisma.$disconnect();

if (!role) {
  console.error("Could not find the 'Admin' role. Did you run db:push and the seed?");
  process.exit(1);
}

const { data, error } = await admin.auth.admin.createUser({
  email,
  password,
  email_confirm: true,
  user_metadata: { full_name: fullName ?? email.split("@")[0], role_id: role.id },
});

if (error) {
  console.error("Failed to create admin:", error.message);
  process.exit(1);
}

console.log(`✅ Admin created: ${data.user.email}`);
console.log("   You can now sign in at /login with this email and password.");
