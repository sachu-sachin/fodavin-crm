import type { Permission } from "@/lib/permissions";

export interface NavItem {
  href: string;
  label: string;
  /** Hidden unless the session holds this permission. Always shown if unset. */
  permission?: Permission;
  // Inline SVG path data (lucide-style 24x24, stroke) to avoid an icon dep.
  icon: string;
}

export const ADMIN_NAV_ITEMS: NavItem[] = [
  {
    href: "/employees",
    permission: "employees.manage",
    label: "Employees",
    icon: "M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z",
  },
  {
    href: "/roles",
    permission: "roles.manage",
    label: "Roles",
    icon: "M12 15a3 3 0 100-6 3 3 0 000 6zm7.4-3a7.4 7.4 0 01-.13 1.36l1.53 1.2-1.5 2.6-1.8-.73a7.4 7.4 0 01-2.36 1.37L14.4 21h-3l-.27-1.93a7.4 7.4 0 01-2.36-1.37l-1.8.73-1.5-2.6 1.53-1.2A7.4 7.4 0 014.6 12c0-.46.05-.92.13-1.36L3.2 9.44l1.5-2.6 1.8.73a7.4 7.4 0 012.36-1.37L9.6 3h3l.27 1.93a7.4 7.4 0 012.36 1.37l1.8-.73 1.5 2.6-1.53 1.2c.08.44.13.9.13 1.36z",
  },
  {
    href: "/settings",
    permission: "settings.manage",
    label: "Settings",
    icon: "M10 6H5a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z",
  },
];

export const NAV_ITEMS: NavItem[] = [
  {
    href: "/",
    label: "Dashboard",
    icon: "M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6",
  },
  {
    href: "/announcements",
    label: "Announcements",
    icon: "M11 5.882V19.24a1.76 1.76 0 01-3.417.592l-2.147-6.15M18 13a3 3 0 100-6M5.436 13.683A4.001 4.001 0 017 6h1.832c4.1 0 7.625-1.234 9.168-3v14c-1.543-1.766-5.067-3-9.168-3H7a3.988 3.988 0 01-1.564-.317z",
  },
  {
    href: "/crm",
    permission: "clients.view",
    label: "Clients",
    icon: "M17 20h5v-2a4 4 0 00-3-3.87M9 20H4v-2a4 4 0 013-3.87m6-1.13a4 4 0 10-4-4 4 4 0 004 4zm6 0a4 4 0 10-3-6.7",
  },
  {
    href: "/pipeline",
    permission: "pipeline.view",
    label: "Pipeline",
    icon: "M3 6h18M3 12h18M3 18h18",
  },
  {
    href: "/projects",
    permission: "projects.view",
    label: "Projects",
    icon: "M3 7a2 2 0 012-2h4l2 2h8a2 2 0 012 2v8a2 2 0 01-2 2H5a2 2 0 01-2-2V7z",
  },
  {
    href: "/tasks",
    permission: "tasks.view",
    label: "Tasks",
    icon: "M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-3 7l2 2 4-4",
  },
  {
    href: "/meetings",
    permission: "meetings.view",
    label: "Meetings",
    icon: "M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z",
  },
  {
    href: "/finance",
    permission: "finance.view",
    label: "Finance",
    icon: "M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V6m0 2v8m0 0v2m0-2c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z",
  },
  {
    href: "/timesheet",
    permission: "timesheet.log",
    label: "Timesheet",
    icon: "M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z",
  },
  {
    href: "/social",
    permission: "social.view",
    label: "Social",
    icon: "M15 8a3 3 0 10-2.977-2.63l-4.94 2.47a3 3 0 100 4.319l4.94 2.47a3 3 0 10.895-1.789l-4.94-2.47a3.027 3.027 0 000-.74l4.94-2.47C13.456 7.68 14.19 8 15 8z",
  },
  {
    href: "/team",
    permission: "team.view",
    label: "Team",
    icon: "M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197",
  },
  {
    href: "/onboarding",
    permission: "onboarding.view",
    label: "Onboarding",
    icon: "M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4",
  },
];
