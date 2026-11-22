// Domain types mirroring the Supabase schema (supabase/migrations/0001_init.sql).
// Regenerate with `supabase gen types typescript` once the project is linked.

export type InquiryStage =
  | "new"
  | "contacted"
  | "proposal_sent"
  | "won"
  | "lost";

export type InquiryType =
  | "website"
  | "web_app"
  | "mobile_app"
  | "ecommerce"
  | "branding"
  | "maintenance"
  | "other";

export type InquirySource =
  | "referral"
  | "website"
  | "social"
  | "cold_outreach"
  | "marketplace"
  | "repeat_client"
  | "event"
  | "other";

export type ProjectType =
  | "website"
  | "web_app"
  | "mobile_app"
  | "ecommerce"
  | "branding"
  | "maintenance";

export type ProjectPhase =
  | "discovery"
  | "design"
  | "development"
  | "qa"
  | "launch"
  | "maintenance";

export type ProjectStatus = "active" | "on_hold" | "completed" | "archived";

export type DocumentSource = "upload" | "drive_upload" | "drive" | "link";

export type DocumentKind =
  | "proposal"
  | "contract"
  | "invoice"
  | "design"
  | "spec"
  | "handover"
  | "other";

export type MilestoneStatus = "pending" | "invoiced" | "paid";

export type TaskStatus = "todo" | "in_progress" | "review" | "done";

export type TaskType =
  | "design"
  | "frontend"
  | "backend"
  | "bug"
  | "content"
  | "devops"
  | "general";

export type MeetingType = "internal" | "client" | "standup" | "review";

export type AnnouncementCategory =
  | "general"
  | "policy"
  | "holiday"
  | "event"
  | "urgent";

export type SocialPlatform =
  | "instagram"
  | "facebook"
  | "linkedin"
  | "twitter"
  | "tiktok"
  | "youtube"
  | "other";

export type PostStatus =
  | "idea"
  | "draft"
  | "needs_approval"
  | "scheduled"
  | "published"
  | "cancelled";

export type PostCategory =
  | "brand_awareness"
  | "services"
  | "educational"
  | "interactive"
  | "fun"
  | "promotion"
  | "testimonial";

export interface Role {
  id: string;
  name: string;
  is_admin: boolean;
  permissions: string[];
  created_at: string;
}

export interface Profile {
  id: string;
  full_name: string | null;
  email: string | null;
  avatar_url: string | null;
  role_id: string | null;
  is_active: boolean;
  /** Receives the daily reminder email. */
  email_digest: boolean;
  /** Their managing lead, if any. */
  reports_to_id: string | null;
  created_at: string;
}

/** Profile joined with its role (as returned by select with a role relation). */
export interface ProfileWithRole extends Profile {
  role: Pick<Role, "id" | "name" | "is_admin"> | null;
  /** Roles held on top of the main one (present when loaded with ROLES_INCLUDE). */
  extra_roles?: { role: Pick<Role, "id" | "name" | "is_admin"> }[];
}

export interface Company {
  id: string;
  name: string;
  website: string | null;
  industry: string | null;
  gstin: string | null;
  notes: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface Contact {
  id: string;
  company_id: string | null;
  full_name: string;
  email: string | null;
  phone: string | null;
  role_title: string | null;
  notes: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface Inquiry {
  id: string;
  title: string;
  company_id: string | null;
  contact_id: string | null;
  contact_name: string | null;
  type: InquiryType;
  source: InquirySource | null;
  budget: number | null;
  stage: InquiryStage;
  position: number;
  /** "YYYY-MM-DD" (IST). */
  next_follow_up: string | null;
  lost_reason: string | null;
  notes: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface Project {
  id: string;
  name: string;
  type: ProjectType;
  company_id: string | null;
  inquiry_id: string | null;
  description: string | null;
  phase: ProjectPhase;
  status: ProjectStatus;
  tech_stack: string[];
  repo_url: string | null;
  staging_url: string | null;
  production_url: string | null;
  domain: string | null;
  registrar: string | null;
  hosting_provider: string | null;
  /** "YYYY-MM-DD" (IST). */
  domain_expiry: string | null;
  /** "YYYY-MM-DD" (IST). */
  hosting_expiry: string | null;
  budget: number | null;
  start_date: string | null;
  launch_date: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface Task {
  id: string;
  project_id: string | null;
  title: string;
  description: string | null;
  type: TaskType;
  status: TaskStatus;
  assignee_id: string | null;
  /** Set when the task is an action item from a meeting. */
  meeting_id: string | null;
  /** Set when the task is an item on someone's onboarding checklist. */
  onboarding_id: string | null;
  position: number;
  due_date: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
  priority: "low" | "medium" | "high" | "urgent";
  /** e.g. "Meta Ads", "SEO", "Editing". */
  workstream: string | null;
  allocated_hours: number | null;
  actual_hours: number | null;
  /** ISO instants, stamped as the status moves. */
  started_at: string | null;
  completed_at: string | null;
}

export interface Meeting {
  id: string;
  title: string;
  type: MeetingType;
  /** ISO instant. */
  starts_at: string;
  duration_minutes: number | null;
  location: string | null;
  company_id: string | null;
  project_id: string | null;
  agenda: string | null;
  notes: string | null;
  decisions: string | null;
  /** Profile ids of the team members attending. */
  attendee_ids: string[];
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface Announcement {
  id: string;
  title: string;
  body: string;
  category: AnnouncementCategory;
  pinned: boolean;
  requires_ack: boolean;
  /** Empty means everyone. */
  audience_role_ids: string[];
  /** ISO instant. */
  publish_at: string;
  /** ISO instant. */
  expires_at: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

/** One step of an onboarding template, as edited in the template dialog. */
export interface OnboardingTemplateItemData {
  title: string;
  description: string | null;
  assign_to_new_hire: boolean;
  /** A specific team member; ignored when assign_to_new_hire. */
  assignee_id: string | null;
  /** Days after the start date; negative is before day one. */
  due_offset_days: number;
}

export interface OnboardingTemplateData {
  id: string;
  name: string;
  description: string | null;
  items: OnboardingTemplateItemData[];
  updated_at: string;
}

/** A meeting as shown in lists (meetings page, client/project pages, dashboard). */
export interface MeetingListItem {
  id: string;
  title: string;
  type: MeetingType;
  /** ISO instant. */
  starts_at: string;
  company_id: string | null;
  company_name: string | null;
  project_id: string | null;
  project_name: string | null;
  attendee_count: number;
  open_action_count: number;
}

export interface DocumentRecord {
  id: string;
  name: string;
  source: DocumentSource;
  kind: DocumentKind;
  storage_path: string | null;
  url: string | null;
  drive_file_id: string | null;
  mime_type: string | null;
  size_bytes: number | null;
  company_id: string | null;
  project_id: string | null;
  notes: string | null;
  uploaded_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface TimeEntry {
  id: string;
  profile_id: string;
  project_id: string;
  /** "YYYY-MM-DD" (IST). */
  work_date: string;
  hours: number;
  note: string | null;
  created_at: string;
  updated_at: string;
}

/** Sanity bound for a single person-day. */
export const MAX_HOURS_PER_DAY = 24;

/**
 * How far ahead a domain/hosting renewal starts showing on the dashboard.
 * 30 days is enough notice to reach the client, get approval and pay before
 * anything lapses.
 */
export const RENEWAL_WINDOW_DAYS = 30;

export interface PaymentMilestone {
  id: string;
  project_id: string;
  label: string;
  amount: number;
  status: MilestoneStatus;
  /** "YYYY-MM-DD" (IST). */
  due_date: string | null;
  /** "YYYY-MM-DD" (IST). */
  paid_on: string | null;
  invoice_no: string | null;
  notes: string | null;
  position: number;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface SocialPost {
  id: string;
  title: string;
  content: string | null;
  platform: SocialPlatform;
  category: PostCategory | null;
  status: PostStatus;
  company_id: string | null;
  assignee_id: string | null;
  scheduled_at: string | null;
  reminder_at: string | null;
  link_url: string | null;
  notes: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

// -- Display labels -----------------------------------------------------------

export const INQUIRY_STAGES: { value: InquiryStage; label: string }[] = [
  { value: "new", label: "New" },
  { value: "contacted", label: "Contacted" },
  { value: "proposal_sent", label: "Proposal Sent" },
  { value: "won", label: "Won" },
  { value: "lost", label: "Lost" },
];

export const INQUIRY_SOURCES: { value: InquirySource; label: string }[] = [
  { value: "referral", label: "Referral" },
  { value: "website", label: "Website / Inbound" },
  { value: "social", label: "Social Media" },
  { value: "cold_outreach", label: "Cold Outreach" },
  { value: "marketplace", label: "Marketplace (Upwork etc.)" },
  { value: "repeat_client", label: "Repeat Client" },
  { value: "event", label: "Event / Networking" },
  { value: "other", label: "Other" },
];

export const INQUIRY_TYPES: { value: InquiryType; label: string }[] = [
  { value: "website", label: "Website" },
  { value: "web_app", label: "Web App" },
  { value: "mobile_app", label: "Mobile App" },
  { value: "ecommerce", label: "E-commerce" },
  { value: "branding", label: "Branding" },
  { value: "maintenance", label: "Maintenance" },
  { value: "other", label: "Other" },
];

/** Stages where an inquiry is still live and needs chasing. */
export const OPEN_INQUIRY_STAGES: InquiryStage[] = [
  "new",
  "contacted",
  "proposal_sent",
];

export const PROJECT_TYPES: { value: ProjectType; label: string }[] = [
  { value: "website", label: "Website" },
  { value: "web_app", label: "Web App" },
  { value: "mobile_app", label: "Mobile App" },
  { value: "ecommerce", label: "E-commerce" },
  { value: "branding", label: "Branding / Design" },
  { value: "maintenance", label: "Maintenance / Retainer" },
];

export const PROJECT_PHASES: { value: ProjectPhase; label: string }[] = [
  { value: "discovery", label: "Discovery" },
  { value: "design", label: "Design" },
  { value: "development", label: "Development" },
  { value: "qa", label: "QA" },
  { value: "launch", label: "Launch" },
  { value: "maintenance", label: "Maintenance" },
];

export const PROJECT_STATUSES: { value: ProjectStatus; label: string }[] = [
  { value: "active", label: "Active" },
  { value: "on_hold", label: "On Hold" },
  { value: "completed", label: "Completed" },
  { value: "archived", label: "Archived" },
];

export const DOCUMENT_KINDS: { value: DocumentKind; label: string }[] = [
  { value: "proposal", label: "Proposal" },
  { value: "contract", label: "Contract / SOW" },
  { value: "invoice", label: "Invoice" },
  { value: "design", label: "Design" },
  { value: "spec", label: "Spec / Requirements" },
  { value: "handover", label: "Handover" },
  { value: "other", label: "Other" },
];

export const DOCUMENT_KIND_MAP = Object.fromEntries(
  DOCUMENT_KINDS.map((k) => [k.value, k.label]),
) as Record<DocumentKind, string>;

export const MILESTONE_STATUSES: {
  value: MilestoneStatus;
  label: string;
  badge: string;
}[] = [
  {
    value: "pending",
    label: "Pending",
    badge: "bg-muted text-muted-foreground",
  },
  {
    value: "invoiced",
    label: "Invoiced",
    badge: "bg-amber-500/10 text-amber-600 dark:text-amber-400",
  },
  {
    value: "paid",
    label: "Paid",
    badge: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400",
  },
];

export const MILESTONE_STATUS_MAP = Object.fromEntries(
  MILESTONE_STATUSES.map((s) => [s.value, s]),
) as Record<MilestoneStatus, (typeof MILESTONE_STATUSES)[number]>;

/** Milestones we're still waiting to be paid for. */
export const UNPAID_MILESTONE_STATUSES: MilestoneStatus[] = [
  "pending",
  "invoiced",
];

export const TASK_STATUSES: { value: TaskStatus; label: string }[] = [
  { value: "todo", label: "To Do" },
  { value: "in_progress", label: "In Progress" },
  { value: "review", label: "Review" },
  { value: "done", label: "Done" },
];

export const TASK_TYPES: { value: TaskType; label: string }[] = [
  { value: "design", label: "Design" },
  { value: "frontend", label: "Frontend" },
  { value: "backend", label: "Backend" },
  { value: "bug", label: "Bug" },
  { value: "content", label: "Content" },
  { value: "devops", label: "DevOps" },
  { value: "general", label: "General" },
];

export const MEETING_TYPES: { value: MeetingType; label: string }[] = [
  { value: "internal", label: "Internal" },
  { value: "client", label: "Client" },
  { value: "standup", label: "Standup" },
  { value: "review", label: "Review" },
];

/** Durations offered in the meeting form, in minutes. */
export const MEETING_DURATIONS = [15, 30, 45, 60, 90, 120] as const;

export const ANNOUNCEMENT_CATEGORIES: {
  value: AnnouncementCategory;
  label: string;
  badge: string;
}[] = [
  { value: "general", label: "General", badge: "bg-muted text-muted-foreground" },
  {
    value: "policy",
    label: "Policy",
    badge: "bg-blue-500/10 text-blue-600 dark:text-blue-400",
  },
  {
    value: "holiday",
    label: "Holiday",
    badge: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400",
  },
  {
    value: "event",
    label: "Event",
    badge: "bg-violet-500/10 text-violet-600 dark:text-violet-400",
  },
  { value: "urgent", label: "Urgent", badge: "bg-destructive/10 text-destructive" },
];

export const ANNOUNCEMENT_CATEGORY_MAP = Object.fromEntries(
  ANNOUNCEMENT_CATEGORIES.map((c) => [c.value, c]),
) as Record<AnnouncementCategory, (typeof ANNOUNCEMENT_CATEGORIES)[number]>;

export const SOCIAL_PLATFORMS: { value: SocialPlatform; label: string }[] = [
  { value: "instagram", label: "Instagram" },
  { value: "facebook", label: "Facebook" },
  { value: "linkedin", label: "LinkedIn" },
  { value: "twitter", label: "X / Twitter" },
  { value: "tiktok", label: "TikTok" },
  { value: "youtube", label: "YouTube" },
  { value: "other", label: "Other" },
];

export const POST_STATUSES: { value: PostStatus; label: string }[] = [
  { value: "idea", label: "Idea" },
  { value: "draft", label: "Drafting" },
  { value: "needs_approval", label: "Needs Approval" },
  { value: "scheduled", label: "Scheduled" },
  { value: "published", label: "Published" },
  { value: "cancelled", label: "Cancelled" },
];

export const POST_CATEGORIES: {
  value: PostCategory;
  label: string;
  dot: string;
  badge: string;
}[] = [
  {
    value: "brand_awareness",
    label: "Brand Awareness",
    dot: "bg-blue-500",
    badge: "bg-blue-500/10 text-blue-600 dark:text-blue-400",
  },
  {
    value: "services",
    label: "Services",
    dot: "bg-emerald-500",
    badge: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400",
  },
  {
    value: "educational",
    label: "Educational",
    dot: "bg-amber-500",
    badge: "bg-amber-500/10 text-amber-600 dark:text-amber-400",
  },
  {
    value: "interactive",
    label: "Interactive",
    dot: "bg-violet-500",
    badge: "bg-violet-500/10 text-violet-600 dark:text-violet-400",
  },
  {
    value: "fun",
    label: "Fun",
    dot: "bg-pink-500",
    badge: "bg-pink-500/10 text-pink-600 dark:text-pink-400",
  },
  {
    value: "promotion",
    label: "Promotion",
    dot: "bg-orange-500",
    badge: "bg-orange-500/10 text-orange-600 dark:text-orange-400",
  },
  {
    value: "testimonial",
    label: "Testimonial",
    dot: "bg-teal-500",
    badge: "bg-teal-500/10 text-teal-600 dark:text-teal-400",
  },
];

export const POST_CATEGORY_MAP = Object.fromEntries(
  POST_CATEGORIES.map((c) => [c.value, c]),
) as Record<PostCategory, (typeof POST_CATEGORIES)[number]>;
