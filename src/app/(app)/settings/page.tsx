import { requirePermission } from "@/lib/auth";
import { getConnectedAccount } from "@/lib/google/drive";
import { SUPABASE_MAX_BYTES, isGoogleConfigured } from "@/lib/google/config";
import { PageHeader } from "@/components/page-header";
import { GoogleDriveCard } from "@/components/google-drive-card";

export const dynamic = "force-dynamic";

export default async function SettingsPage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  await requirePermission("settings.manage");

  const [account, params] = await Promise.all([
    getConnectedAccount(),
    searchParams,
  ]);

  const notice = typeof params.google === "string" ? params.google : undefined;

  return (
    <div>
      <PageHeader
        title="Settings"
        description="Integrations and workspace configuration. Admins only."
      />
      <div className="grid gap-6 lg:grid-cols-2">
        <GoogleDriveCard
          connected={!!account}
          email={account?.email ?? null}
          folderName={account?.folder_name ?? null}
          folderId={account?.folder_id ?? null}
          configured={isGoogleConfigured()}
          notice={notice}
          supabaseMaxLabel={`${SUPABASE_MAX_BYTES / 1024 / 1024}MB`}
        />
      </div>
    </div>
  );
}
