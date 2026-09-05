# Fodavin Business OS -- Lean Master Plan

## Executive Summary
For a small, 5-person agency with zero budget, building a sprawling all-in-one OS from scratch is a massive resource drain. This lean master plan focuses on building a hyper-focused **Custom Web App MVP** that solves the core agency problems (CRM and Task Management) while costing $0 to host and maintain.

**Platform Strategy:** A custom Responsive Web Application built entirely on modern, serverless free tiers. Complex modules like Finance, HR, and Ticketing are delegated to existing free-tier SaaS tools until the agency has the budget and manpower to build custom replacements.

---

## 1. The Tech Stack (Zero-Cost Architecture)

We are eliminating Docker, custom Node backends, and complex hosting. The entire application will run on robust, generously free infrastructure.

**Frontend & Logic:**
- **Next.js (React):** Handles both the frontend UI and secure server-side logic (Server Actions).
- **TypeScript:** For reliable, bug-free code.
- **Tailwind CSS + shadcn/ui:** For extremely fast, beautiful, and accessible UI components without the need for a designer.

**Data layer:**
- **Prisma (ORM):** Type-safe access to Postgres for all application data. Connects via the Supabase pooler; authorization is enforced in server code.
- **Supabase (Free Tier):**
  - *Auth:* Email + password (accounts are admin-created; no public sign-up).
  - *Database:* Serverless PostgreSQL for all data storage.
  - *Storage:* Free bucket for uploading client files or assets.
  - *Row Level Security (RLS):* Kept enabled as a safety net over the public `anon` key (PostgREST), even though Prisma is the primary access path.

**Hosting:**
- **Vercel (Free Tier):** One-click deployment directly from GitHub. Automatic CI/CD built-in.

---

## 2. In-Scope Modules (The MVP Build)

Fodavin is a **website & app development agency**, so every module is shaped
around dev delivery — not a generic CRM.

### 2.1. Admin & Access (Employees + Roles)
- **Employees:** Only an **Admin** can create employee accounts (email + password). The employee then logs in directly with those credentials. Public sign-up is disabled.
- **Roles:** Admin-defined roles (Admin, Project Manager, UI/UX Designer, Frontend Developer, Backend Developer, QA, Marketing, …). A role may carry the **admin** flag.
- **Permission model — "Admin vs. team":** Admins manage employees, roles and settings. Every other employee has full access to the actual work (clients, inquiries, projects, tasks).

### 2.2. CRM (Client Directory)
- **Companies & Contacts:** A unified database of all clients.
- **Notes & Logs:** A simple text area for logging meeting notes and next steps.
- **Project Inquiries Pipeline:** A Kanban board (New → Contacted → Proposal Sent → Won/Lost) where each inquiry is typed by work (Website / Web App / Mobile App / E-commerce / Branding / Maintenance) with an estimated budget.

### 2.3. Projects & Tasks (dev-shaped)
- **Projects:** Typed (Website / Web App / Mobile App / E-commerce / Branding / Maintenance) and tracked through a **dev lifecycle** — Discovery → Design → Development → QA → Launch → Maintenance.
- **Dev metadata per project:** tech stack, repo URL, staging URL, production/live URL, domain & registrar, hosting provider, quoted budget, start date, launch deadline.
- **Task Board:** A Kanban board (To Do / In Progress / Review / Done). Each task has a **discipline** (Design / Frontend / Backend / Bug / Content / DevOps) and is assigned to an employee.
- **Team Directory:** Everyone at Fodavin, with their role.

### 2.4. Internal Operations — Social / Content
- **Content calendar:** A month calendar is the primary view — every post sits on its scheduled day, colour-coded by category. Click any day to add a post (date pre-filled); click a post to edit. A **Board** tab gives the Idea → Drafting → Needs Approval → Scheduled → Published workflow with drag-and-drop.
- **Per post:** platform (Instagram / Facebook / LinkedIn / X / TikTok / YouTube), **category** (Brand Awareness / Services / Educational / Interactive / Fun / Promotion / Testimonial), caption, asset link, optional client, **assignee**, **scheduled date/time**, and a **reminder**.
- **Auto weekly plan:** "Generate 7-day plan" creates a balanced week — one post per platform (LinkedIn / Instagram / Facebook / YouTube) every day, each weekday carrying a theme (Monday Motivation, Tech Tip Tuesday, Work Showcase Wednesday, Interactive Thursday, BTS Friday, Client Success Saturday, Sunday Spotlight). Re-running only fills empty slots. Custom posts can be added on any date.
- **Reminders:** a "Reminders due" surface highlights posts needing attention (in-app for now; email/push can be added later via Supabase `pg_cron`).

---

## 3. Out-of-Scope (The "Glue" Stack)

Do not waste engineering hours building these right now. Use these free tools alongside your custom CRM:

- **Finance (Invoicing/Accounting/GST):** Use **Zoho Books** (free plan for Indian businesses under ₹25L turnover; GST-compliant invoicing and e-invoicing) or **Vyapar**. Avoid Wave Accounting — it no longer serves businesses outside the US/Canada and cannot handle GST.
  > The app tracks **payment milestones** per project (what a client owes and when) so "who owes us what" lives beside the delivery work. Issuing the actual GST invoice, filing returns and bookkeeping stay in Zoho Books — the app stores only the invoice number for cross-reference.
- **Knowledge Base & Docs:** Use **Notion** (Free tier covers small teams nicely).
- **Communication:** Use **Discord** or **Slack** free tiers.
- **Password Vault:** Use **Bitwarden** (Free for basic sharing, extremely cheap for orgs).
- **Ticketing/Support:** Use a shared inbox (like a Google Group `support@fodavin.com`) until ticket volume justifies a dedicated free tool like HubSpot Service Hub or Freshdesk.

---

## 4. Security & Permissions
- **Authentication:** Supabase Auth with **email + password**. Accounts are created by an admin via the Admin API (service-role key, server-only); there is no public sign-up. The first admin is bootstrapped with `scripts/create-admin.mjs`.
- **Authorization:** Supabase Row Level Security (RLS) with an **"Admin vs. team"** model:
  - Any authenticated employee: full CRUD on companies, contacts, inquiries, projects and tasks.
  - **Admins only** (role has `is_admin = true`): create/manage employees, assign roles, and create/edit roles. Enforced by an `is_admin()` SQL helper used in the RLS policies for `profiles` and `roles`.

---

## 5. Development Roadmap

### Phase 1: Foundation + Access Control ✅ (done)
- Scaffolded Next.js + Tailwind + shadcn/ui, connected Supabase.
- Full schema with roles, RLS and the dev-tailored project/task/inquiry tables.
- Email + password login; **admin-only Employees & Roles management**.
- App shell (sidebar, admin-gated nav), dashboard, team directory.

### Phase 2: CRM Core ✅ (done)
- Companies & Contacts CRUD (list / add / edit / detail).
- **Project Inquiries** Kanban (New → Contacted → Proposal Sent → Won/Lost), typed by work + estimated budget, with drag-and-drop between stages.

### Phase 3: Projects & Tasks ✅ (done)
- Project dashboard with the dev metadata (repo, staging/live URLs, domain, hosting, tech stack, launch date) and lifecycle phase.
- Per-project and global task boards (To Do / In Progress / Review / Done) with discipline, assignee, due dates, and drag-and-drop.
- Deploy to Vercel for live testing — moved to Phase 4.

### Phase 4: Convert & Deploy ✅ (done)
- One-click "Convert to project" on an inquiry creates a Project carrying over client, work type, budget and notes, and marks the inquiry won.
- Vercel deploy guide + environment variable setup documented in the README.

---

## 6. Long-Term Vision
Once this MVP is generating value (and saving time) for the team, you can slowly start replacing the "Glue" stack. 
- *Next Step:* Build a Client Portal where clients can log in (via Supabase Auth) and see their project status, completely removing the need for external progress emails.