"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { NAV_ITEMS, ADMIN_NAV_ITEMS, type NavItem } from "@/lib/nav";
import { cn } from "@/lib/utils";

function NavLink({ item, active }: { item: NavItem; active: boolean }) {
  return (
    <Link
      href={item.href}
      className={cn(
        "flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors",
        active
          ? "bg-primary/10 text-primary"
          : "text-muted-foreground hover:bg-muted hover:text-foreground",
      )}
    >
      <svg
        className="h-4 w-4 shrink-0"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth={2}
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <path d={item.icon} />
      </svg>
      {item.label}
    </Link>
  );
}

export function AppSidebar({
  permissions,
  hiddenHrefs = [],
}: {
  permissions: string[];
  /** Links switched off for this person regardless of permissions. */
  hiddenHrefs?: string[];
}) {
  const pathname = usePathname();

  // The nav is a convenience, not the access boundary — every page and action
  // re-checks server-side. This just avoids showing links that dead-end.
  const held = new Set(permissions);
  const hidden = new Set(hiddenHrefs);
  const visible = (item: NavItem) =>
    !hidden.has(item.href) && (!item.permission || held.has(item.permission));
  const mainItems = NAV_ITEMS.filter(visible);
  const adminItems = ADMIN_NAV_ITEMS.filter(visible);

  // The most specific link wins, so /pipeline/calls lights up "Call list"
  // rather than both it and "Pipeline".
  const matches = (href: string) =>
    href === "/" ? pathname === "/" : pathname === href || pathname.startsWith(`${href}/`);
  const best = [...mainItems, ...adminItems]
    .filter((i) => matches(i.href))
    .sort((a, b) => b.href.length - a.href.length)[0]?.href;
  const isActive = (href: string) => href === best;

  return (
    <aside className="hidden w-60 shrink-0 border-r bg-card md:flex md:flex-col">
      <div className="flex h-14 items-center gap-2 border-b px-4">
        <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary text-sm font-bold text-primary-foreground">
          F
        </div>
        <span className="font-semibold">Fodavin OS</span>
      </div>
      <nav className="flex-1 space-y-1 p-3">
        {mainItems.map((item) => (
          <NavLink key={item.href} item={item} active={isActive(item.href)} />
        ))}

        {adminItems.length > 0 && (
          <>
            <p className="px-3 pb-1 pt-4 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Admin
            </p>
            {adminItems.map((item) => (
              <NavLink
                key={item.href}
                item={item}
                active={isActive(item.href)}
              />
            ))}
          </>
        )}
      </nav>
    </aside>
  );
}
