import {
  expect,
  test,
  type APIRequestContext,
  type APIResponse,
} from "@playwright/test";

// The app reads and writes everything through Prisma, so Supabase's Data API
// must expose nothing — not to the public anon key, and not to a signed-in
// employee using their own access token (which the browser can read). If it
// did, any employee could bypass their role, e.g. read payment milestones
// straight from /rest/v1 without the finance.view permission.
// supabase/setup.sql enforces this; src/lib/data-api-lockdown.test.ts guards
// the file itself. This checks the applied result on the test project.

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

// `roles` and `profiles` always hold rows on the test project (seeded roles,
// the fixture admin), so they prove reads return nothing rather than nothing
// happening to be there.
const TABLES = [
  "roles",
  "profiles",
  "companies",
  "contacts",
  "inquiries",
  "projects",
  "tasks",
  "payment_milestones",
  "time_entries",
  "documents",
  "social_posts",
  "google_accounts",
];

/** Denied outright, or an empty result — either way no data came back. */
async function expectNoRows(res: APIResponse, label: string) {
  if (!res.ok()) return;
  const body = await res.json();
  expect(body, `${label} returned data through the Data API`).toEqual([]);
}

async function signInAsFixtureAdmin(
  request: APIRequestContext,
): Promise<string> {
  const res = await request.post(`${SUPABASE_URL}/auth/v1/token?grant_type=password`, {
    headers: { apikey: ANON_KEY },
    data: {
      email: process.env.TEST_ADMIN_EMAIL,
      password: process.env.TEST_ADMIN_PASSWORD,
    },
  });
  expect(res.ok()).toBe(true);
  return (await res.json()).access_token;
}

test("the anon key reads nothing from any app table", async ({ request }) => {
  for (const table of TABLES) {
    const res = await request.get(`${SUPABASE_URL}/rest/v1/${table}?select=*&limit=1`, {
      headers: { apikey: ANON_KEY },
    });
    await expectNoRows(res, `anon → ${table}`);
  }
});

test("a signed-in employee's token reads and writes nothing directly", async ({ request }) => {
  // Even the admin's token: an admin acts through the app, which authorises
  // in server code. The Data API has no notion of these roles at all.
  const token = await signInAsFixtureAdmin(request);
  const headers = { apikey: ANON_KEY, Authorization: `Bearer ${token}` };

  for (const table of TABLES) {
    const res = await request.get(`${SUPABASE_URL}/rest/v1/${table}?select=*&limit=1`, {
      headers,
    });
    await expectNoRows(res, `authenticated → ${table}`);
  }

  const insert = await request.post(`${SUPABASE_URL}/rest/v1/companies`, {
    headers: { ...headers, Prefer: "return=minimal" },
    data: { name: "E2E data-api lockdown probe" },
  });
  expect(insert.ok(), "authenticated insert into companies succeeded").toBe(false);

  const files = await request.post(`${SUPABASE_URL}/storage/v1/object/list/documents`, {
    headers,
    data: { prefix: "", limit: 1 },
  });
  await expectNoRows(files, "authenticated → storage documents bucket");
});
