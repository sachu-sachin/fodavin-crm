// Global test environment. Values are fixed test fixtures, never real
// secrets — this file is committed and none of these are usable outside
// the test run.
process.env.GOOGLE_TOKEN_ENC_KEY ??=
  "OlNILIrC7wPeFALGRXg9z+5hlW11AM7pYt3sEnNmfaM=";
process.env.NEXT_PUBLIC_SUPABASE_URL ??= "https://test-project.supabase.co";
process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ??= "test-anon-key";
process.env.SUPABASE_SERVICE_ROLE_KEY ??= "test-service-role-key";
process.env.APP_URL ??= "http://localhost:3000";
