"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { authorize, DENIED_MESSAGE } from "@/lib/auth";
import type { Permission } from "@/lib/permissions";
import { purgeDocumentFiles } from "@/lib/document-files";
import type {
  ProjectType,
  ProjectPhase,
  ProjectStatus,
  TaskType,
  TaskStatus,
} from "@/lib/types";

export type ProjectState = { error?: string; success?: string };

async function requireUserId(
  permission: Permission,
): Promise<string | null> {
  const session = await authorize(permission);
  return session?.userId ?? null;
}

const PROJECT_TYPE = new Set<ProjectType>([
  "website",
  "web_app",
  "mobile_app",
  "ecommerce",
  "branding",
  "maintenance",
]);
const PROJECT_PHASE = new Set<ProjectPhase>([
  "discovery",
  "design",
  "development",
  "qa",
  "launch",
  "maintenance",
]);
const PROJECT_STATUS = new Set<ProjectStatus>([
  "active",
  "on_hold",
  "completed",
  "archived",
]);
const TASK_TYPE = new Set<TaskType>([
  "design",
  "frontend",
  "backend",
  "bug",
  "content",
  "devops",
  "general",
]);
const TASK_STATUS = new Set<TaskStatus>([
  "todo",
  "in_progress",
  "review",
  "done",
]);

function str(v: FormDataEntryValue | null): string | null {
  const s = String(v ?? "").trim();
  return s ? s : null;
}

function parseDate(v: FormDataEntryValue | null): Date | null {
  const s = String(v ?? "").trim();
  if (!s) return null;
  const d = new Date(s);
  return Number.isNaN(d.getTime()) ? null : d;
}

function parseBudget(v: FormDataEntryValue | null): number | null | "invalid" {
  const s = String(v ?? "").trim();
  if (!s) return null;
  const n = Number(s.replace(/,/g, ""));
  return Number.isFinite(n) && n >= 0 ? n : "invalid";
}

function parseTechStack(v: FormDataEntryValue | null): string[] {
  return String(v ?? "")
    .split(",")
    .map((t) => t.trim())
    .filter(Boolean);
}

// -- Projects -----------------------------------------------------------------

function projectDataFromForm(formData: FormData) {
  const budget = parseBudget(formData.get("budget"));
  if (budget === "invalid") return { error: "Budget must be a number." as const };

  const type = String(formData.get("type") ?? "website") as ProjectType;
  const phase = String(formData.get("phase") ?? "discovery") as ProjectPhase;
  const status = String(formData.get("status") ?? "active") as ProjectStatus;

  return {
    data: {
      name: String(formData.get("name") ?? "").trim(),
      type: PROJECT_TYPE.has(type) ? type : "website",
      phase: PROJECT_PHASE.has(phase) ? phase : "discovery",
      status: PROJECT_STATUS.has(status) ? status : "active",
      company_id: str(formData.get("company_id")),
      description: str(formData.get("description")),
      tech_stack: parseTechStack(formData.get("tech_stack")),
      repo_url: str(formData.get("repo_url")),
      staging_url: str(formData.get("staging_url")),
      production_url: str(formData.get("production_url")),
      domain: str(formData.get("domain")),
      registrar: str(formData.get("registrar")),
      hosting_provider: str(formData.get("hosting_provider")),
      domain_expiry: parseDate(formData.get("domain_expiry")),
      hosting_expiry: parseDate(formData.get("hosting_expiry")),
      budget,
      start_date: parseDate(formData.get("start_date")),
      launch_date: parseDate(formData.get("launch_date")),
    },
  };
}

export async function createProject(
  _prev: ProjectState,
  formData: FormData,
): Promise<ProjectState> {
  const userId = await requireUserId("projects.manage");
  if (!userId) return { error: DENIED_MESSAGE };
  const parsed = projectDataFromForm(formData);
  if ("error" in parsed) return { error: parsed.error };
  if (!parsed.data.name) return { error: "Project name is required." };

  await prisma.project.create({
    data: { ...parsed.data, created_by: userId },
  });
  revalidatePath("/projects");
  return { success: `${parsed.data.name} created.` };
}

export async function updateProject(
  _prev: ProjectState,
  formData: FormData,
): Promise<ProjectState> {
  if (!(await requireUserId("projects.manage"))) return { error: DENIED_MESSAGE };
  const id = String(formData.get("id") ?? "");
  const parsed = projectDataFromForm(formData);
  if ("error" in parsed) return { error: parsed.error };
  if (!parsed.data.name) return { error: "Project name is required." };

  await prisma.project.update({ where: { id }, data: parsed.data });
  revalidatePath("/projects");
  revalidatePath(`/projects/${id}`);
  return { success: "Project updated." };
}

export async function deleteProject(formData: FormData): Promise<void> {
  if (!(await requireUserId("projects.delete"))) return;
  const id = String(formData.get("id") ?? "");
  if (!id) return;

  // Deleting the project cascades its documents at the database level, which
  // would strand the actual files in Drive and the storage bucket. Remove
  // those first so the cascade doesn't leave anything orphaned.
  const documents = await prisma.document.findMany({
    where: { project_id: id },
    select: { source: true, storage_path: true, drive_file_id: true },
  });
  await purgeDocumentFiles(documents);

  await prisma.project.delete({ where: { id } });
  revalidatePath("/projects");
  revalidatePath("/");
  redirect("/projects");
}

// -- Tasks --------------------------------------------------------------------

export async function createTask(
  _prev: ProjectState,
  formData: FormData,
): Promise<ProjectState> {
  const userId = await requireUserId("tasks.manage");
  if (!userId) return { error: DENIED_MESSAGE };
  const projectId = String(formData.get("project_id") ?? "");
  const title = String(formData.get("title") ?? "").trim();
  if (!projectId) return { error: "Pick a project." };
  if (!title) return { error: "Task title is required." };

  const type = String(formData.get("type") ?? "general") as TaskType;
  const status = String(formData.get("status") ?? "todo") as TaskStatus;

  await prisma.task.create({
    data: {
      project_id: projectId,
      title,
      description: str(formData.get("description")),
      type: TASK_TYPE.has(type) ? type : "general",
      status: TASK_STATUS.has(status) ? status : "todo",
      assignee_id: str(formData.get("assignee_id")),
      due_date: parseDate(formData.get("due_date")),
      created_by: userId,
    },
  });

  revalidatePath("/tasks");
  revalidatePath(`/projects/${projectId}`);
  return { success: `Task "${title}" added.` };
}

export async function updateTask(
  _prev: ProjectState,
  formData: FormData,
): Promise<ProjectState> {
  if (!(await requireUserId("tasks.manage"))) return { error: DENIED_MESSAGE };
  const id = String(formData.get("id") ?? "");
  const projectId = String(formData.get("project_id") ?? "");
  const title = String(formData.get("title") ?? "").trim();
  if (!title) return { error: "Task title is required." };

  const type = String(formData.get("type") ?? "general") as TaskType;
  const status = String(formData.get("status") ?? "todo") as TaskStatus;

  await prisma.task.update({
    where: { id },
    data: {
      title,
      description: str(formData.get("description")),
      type: TASK_TYPE.has(type) ? type : "general",
      status: TASK_STATUS.has(status) ? status : "todo",
      assignee_id: str(formData.get("assignee_id")),
      due_date: parseDate(formData.get("due_date")),
    },
  });

  revalidatePath("/tasks");
  if (projectId) revalidatePath(`/projects/${projectId}`);
  return { success: "Task updated." };
}

export async function deleteTask(formData: FormData): Promise<void> {
  if (!(await requireUserId("tasks.manage"))) return;
  const id = String(formData.get("id") ?? "");
  const projectId = String(formData.get("project_id") ?? "");
  await prisma.task.delete({ where: { id } });
  revalidatePath("/tasks");
  if (projectId) revalidatePath(`/projects/${projectId}`);
}

/** Move a task to a different status column (Kanban DnD). */
export async function moveTaskStatus(
  id: string,
  status: TaskStatus,
): Promise<void> {
  if (!(await requireUserId("tasks.manage"))) return;
  if (!TASK_STATUS.has(status)) return;
  const task = await prisma.task.update({
    where: { id },
    data: { status },
    select: { project_id: true },
  });
  revalidatePath("/tasks");
  if (task.project_id) revalidatePath(`/projects/${task.project_id}`);
}
