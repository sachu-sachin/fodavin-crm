// Role-based access control.
//
// Permissions are plain "<resource>.<action>" strings stored on the Role as a
// text[]. The catalogue below is the single source of truth: the roles admin
// screen renders from it, and every guard checks against it.
//
// `Role.is_admin` is kept as a super-flag that implies every permission. It
// guarantees there is always a way back in — an admin can't lock the team out
// of role management by unticking the wrong box.

export const PERMISSIONS = [
  "clients.view",
  "clients.manage",
  "clients.delete",

  "pipeline.view",
  "pipeline.manage",
  "pipeline.delete",

  "projects.view",
  "projects.manage",
  "projects.delete",

  "tasks.view",
  "tasks.manage",

  "meetings.view",
  "meetings.manage",

  "announcements.manage",

  "onboarding.view",
  "onboarding.manage",

  "finance.view",
  "finance.manage",

  "documents.view",
  "documents.upload",
  "documents.delete",

  "timesheet.log",
  "timesheet.view_all",
  "timesheet.manage_all",

  "social.view",
  "social.manage",

  "team.view",

  "employees.manage",
  "roles.manage",
  "settings.manage",
] as const;

export type Permission = (typeof PERMISSIONS)[number];

const PERMISSION_SET = new Set<string>(PERMISSIONS);

export function isPermission(value: string): value is Permission {
  return PERMISSION_SET.has(value);
}

export interface PermissionMeta {
  value: Permission;
  label: string;
  /** Why this matters — shown under the checkbox in the roles editor. */
  hint?: string;
  /** Flagged in the UI as commercially sensitive. */
  sensitive?: boolean;
}

export interface PermissionGroup {
  key: string;
  label: string;
  description: string;
  permissions: PermissionMeta[];
}

export const PERMISSION_GROUPS: PermissionGroup[] = [
  {
    key: "clients",
    label: "Clients",
    description: "The company and contact directory.",
    permissions: [
      { value: "clients.view", label: "View clients & contacts" },
      { value: "clients.manage", label: "Add and edit clients & contacts" },
      {
        value: "clients.delete",
        label: "Delete clients",
        hint: "Also deletes their contacts and client-level documents.",
      },
    ],
  },
  {
    key: "pipeline",
    label: "Sales pipeline",
    description: "Inquiries, follow-ups and lead sources.",
    permissions: [
      {
        value: "pipeline.view",
        label: "View the pipeline",
        hint: "Includes estimated budgets on inquiry cards.",
        sensitive: true,
      },
      { value: "pipeline.manage", label: "Add, edit and move inquiries" },
      { value: "pipeline.delete", label: "Delete inquiries" },
    ],
  },
  {
    key: "projects",
    label: "Projects",
    description: "Delivery records, hosting details and renewals.",
    permissions: [
      { value: "projects.view", label: "View projects" },
      { value: "projects.manage", label: "Create and edit projects" },
      {
        value: "projects.delete",
        label: "Delete projects",
        hint: "Also deletes tasks, milestones, documents and logged hours.",
      },
    ],
  },
  {
    key: "tasks",
    label: "Tasks",
    description: "The delivery boards.",
    permissions: [
      { value: "tasks.view", label: "View task boards" },
      { value: "tasks.manage", label: "Create, edit, assign and move tasks" },
    ],
  },
  {
    key: "meetings",
    label: "Meetings",
    description: "Meeting notes, decisions and attendees.",
    permissions: [
      {
        value: "meetings.view",
        label: "View meetings",
        hint: "Includes each meeting's action items.",
      },
      {
        value: "meetings.manage",
        label: "Schedule, edit and delete meetings",
        hint: "Adding action items also needs “Create, edit, assign and move tasks”.",
      },
    ],
  },
  {
    key: "announcements",
    label: "Announcements",
    description: "Company notices and policies. Everyone can read the ones meant for them.",
    permissions: [
      {
        value: "announcements.manage",
        label: "Post, edit and delete announcements",
        hint: "Also shows who has read or acknowledged each one.",
      },
    ],
  },
  {
    key: "onboarding",
    label: "Onboarding",
    description: "New-joiner checklists. Everyone can always see their own.",
    permissions: [
      { value: "onboarding.view", label: "See everyone's onboarding progress" },
      {
        value: "onboarding.manage",
        label: "Start onboardings and edit checklist templates",
        hint: "Ticking items off uses the task permissions, like any task.",
      },
    ],
  },
  {
    key: "finance",
    label: "Finance",
    description:
      "Budgets, payment milestones, outstanding money and effective rates.",
    permissions: [
      {
        value: "finance.view",
        label: "View money",
        hint: "Project budgets, what clients owe, and profitability rates.",
        sensitive: true,
      },
      {
        value: "finance.manage",
        label: "Manage payment milestones",
        sensitive: true,
      },
    ],
  },
  {
    key: "documents",
    label: "Documents",
    description: "Files in storage and Google Drive.",
    permissions: [
      { value: "documents.view", label: "View and open documents" },
      { value: "documents.upload", label: "Upload files and add links" },
      {
        value: "documents.delete",
        label: "Delete documents",
        hint: "Removes uploaded files from storage and Google Drive for real.",
      },
    ],
  },
  {
    key: "timesheet",
    label: "Timesheets",
    description: "Logged hours.",
    permissions: [
      { value: "timesheet.log", label: "Log their own hours" },
      {
        value: "timesheet.view_all",
        label: "View everyone's timesheets",
        sensitive: true,
      },
      { value: "timesheet.manage_all", label: "Edit everyone's timesheets" },
    ],
  },
  {
    key: "social",
    label: "Social & content",
    description: "The content calendar and workflow board.",
    permissions: [
      { value: "social.view", label: "View the content calendar" },
      { value: "social.manage", label: "Create and schedule posts" },
    ],
  },
  {
    key: "admin",
    label: "Administration",
    description: "Team and workspace configuration.",
    permissions: [
      { value: "team.view", label: "View the team directory" },
      {
        value: "employees.manage",
        label: "Manage employees",
        hint: "Create accounts, assign roles, reset passwords, deactivate.",
        sensitive: true,
      },
      { value: "roles.manage", label: "Manage roles & permissions", sensitive: true },
      {
        value: "settings.manage",
        label: "Manage integrations",
        hint: "Includes connecting and disconnecting Google Drive.",
        sensitive: true,
      },
    ],
  },
];

export const PERMISSION_LABELS = Object.fromEntries(
  PERMISSION_GROUPS.flatMap((g) => g.permissions).map((p) => [p.value, p.label]),
) as Record<Permission, string>;

/**
 * Implied permissions: granting a write also grants the matching read, so a
 * role can't end up able to edit something it can't see.
 */
const IMPLIES: Partial<Record<Permission, Permission[]>> = {
  "clients.manage": ["clients.view"],
  "clients.delete": ["clients.view", "clients.manage"],
  "pipeline.manage": ["pipeline.view"],
  "pipeline.delete": ["pipeline.view", "pipeline.manage"],
  "projects.manage": ["projects.view"],
  "projects.delete": ["projects.view", "projects.manage"],
  "tasks.manage": ["tasks.view"],
  "meetings.manage": ["meetings.view"],
  "onboarding.manage": ["onboarding.view"],
  "finance.manage": ["finance.view"],
  "documents.upload": ["documents.view"],
  "documents.delete": ["documents.view"],
  "timesheet.manage_all": ["timesheet.view_all", "timesheet.log"],
  "timesheet.view_all": ["timesheet.log"],
  "social.manage": ["social.view"],
  "employees.manage": ["team.view"],
};

/** Expand a stored permission list into the full effective set. */
export function expandPermissions(granted: readonly string[]): Set<Permission> {
  const result = new Set<Permission>();
  for (const raw of granted) {
    if (!isPermission(raw)) continue;
    result.add(raw);
    for (const implied of IMPLIES[raw] ?? []) result.add(implied);
  }
  return result;
}

/** Everything — what `is_admin` resolves to. */
export function allPermissions(): Set<Permission> {
  return new Set(PERMISSIONS);
}

// -- Role templates -----------------------------------------------------------

/**
 * Starting points for the default roles. Deliberately conservative on money:
 * delivery staff can do their job without seeing budgets, client owings or
 * profitability, which is the norm in an agency and the main reason to have
 * granular roles at all.
 */
export const ROLE_TEMPLATES: {
  name: string;
  is_admin: boolean;
  permissions: Permission[];
  summary: string;
}[] = [
  {
    name: "Admin",
    is_admin: true,
    permissions: [...PERMISSIONS],
    summary: "Full access, including employees, roles and integrations.",
  },
  {
    name: "Project Manager",
    is_admin: false,
    summary: "Runs delivery and client relationships, including money.",
    permissions: [
      "clients.view", "clients.manage",
      "pipeline.view", "pipeline.manage", "pipeline.delete",
      "projects.view", "projects.manage",
      "tasks.view", "tasks.manage",
      "meetings.view", "meetings.manage",
      "announcements.manage",
      "onboarding.view", "onboarding.manage",
      "finance.view", "finance.manage",
      "documents.view", "documents.upload", "documents.delete",
      "timesheet.log", "timesheet.view_all", "timesheet.manage_all",
      "social.view", "social.manage",
      "team.view",
    ],
  },
  {
    name: "Frontend Developer",
    is_admin: false,
    summary: "Delivery work. No access to budgets or client owings.",
    permissions: [
      "clients.view",
      "projects.view",
      "tasks.view", "tasks.manage",
      "meetings.view",
      "documents.view", "documents.upload",
      "timesheet.log",
      "team.view",
    ],
  },
  {
    name: "Backend Developer",
    is_admin: false,
    summary: "Delivery work. No access to budgets or client owings.",
    permissions: [
      "clients.view",
      "projects.view",
      "tasks.view", "tasks.manage",
      "meetings.view",
      "documents.view", "documents.upload",
      "timesheet.log",
      "team.view",
    ],
  },
  {
    name: "UI/UX Designer",
    is_admin: false,
    summary: "Design delivery. No access to budgets or client owings.",
    permissions: [
      "clients.view",
      "projects.view",
      "tasks.view", "tasks.manage",
      "meetings.view",
      "documents.view", "documents.upload",
      "timesheet.log",
      "team.view",
    ],
  },
  {
    name: "QA Engineer",
    is_admin: false,
    summary: "Testing and bug reporting.",
    permissions: [
      "projects.view",
      "tasks.view", "tasks.manage",
      "meetings.view",
      "documents.view",
      "timesheet.log",
      "team.view",
    ],
  },
  {
    name: "Marketing",
    is_admin: false,
    summary: "Content and inbound leads. No delivery or money access.",
    permissions: [
      "clients.view",
      "pipeline.view", "pipeline.manage",
      "social.view", "social.manage",
      "meetings.view",
      "documents.view", "documents.upload",
      "timesheet.log",
      "team.view",
    ],
  },
  {
    name: "Accounts",
    is_admin: false,
    summary: "Money only — invoicing, payments and outstanding balances.",
    permissions: [
      "clients.view",
      "projects.view",
      "finance.view", "finance.manage",
      "documents.view", "documents.upload",
      "timesheet.log", "timesheet.view_all",
      "team.view",
    ],
  },
];
