import { redirect } from "next/navigation";
import { getSessionProfile } from "@/lib/auth";
import { AppSidebar } from "@/components/app-sidebar";
import { UserMenu } from "@/components/user-menu";

export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await getSessionProfile();

  // Middleware guards too, but be defensive at the layout level.
  if (!session) redirect("/login");

  const { profile } = session;
  const name = profile?.full_name || profile?.email?.split("@")[0] || "User";
  const email = profile?.email || "";
  const roleName = profile?.role?.name ?? null;

  return (
    <div className="flex min-h-svh bg-muted/30">
      <AppSidebar permissions={[...session.permissions]} />
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex h-14 items-center justify-between border-b bg-card px-4 md:px-6">
          <div className="font-semibold md:hidden">Fodavin OS</div>
          <div className="ml-auto flex items-center gap-3">
            {roleName && (
              <span className="hidden text-sm text-muted-foreground sm:inline">
                {roleName}
              </span>
            )}
            <UserMenu
              name={name}
              email={email}
              avatarUrl={profile?.avatar_url}
            />
          </div>
        </header>
        <main className="flex-1 p-4 md:p-6">{children}</main>
      </div>
    </div>
  );
}
