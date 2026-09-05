"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { createProject, updateProject } from "@/lib/actions/projects";
import {
  PROJECT_TYPES,
  PROJECT_PHASES,
  PROJECT_STATUSES,
  type Project,
} from "@/lib/types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogTrigger,
} from "@/components/ui/dialog";

const selectClass =
  "h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm shadow-sm";

export function ProjectFormDialog({
  project,
  companies,
  trigger,
}: {
  project?: Project;
  companies: { id: string; name: string }[];
  trigger: React.ReactElement;
}) {
  const isEdit = !!project;
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string>();
  const [pending, startTransition] = useTransition();

  function onAction(formData: FormData) {
    startTransition(async () => {
      const res = await (isEdit ? updateProject : createProject)({}, formData);
      if (res.error) {
        setError(res.error);
      } else {
        toast.success(res.success ?? "Saved");
        setError(undefined);
        setOpen(false);
      }
    });
  }

  return (
    // See company-form-dialog.tsx for why this is keyed by updated_at.
    <Dialog key={project?.updated_at ?? "new"} open={open} onOpenChange={setOpen}>
      <DialogTrigger render={trigger} />
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{isEdit ? "Edit project" : "New project"}</DialogTitle>
        </DialogHeader>
        <form
          action={onAction}
          className="max-h-[70vh] space-y-4 overflow-y-auto pr-1"
        >
          {isEdit && <input type="hidden" name="id" value={project.id} />}

          <div className="space-y-2">
            <Label htmlFor="name">Name</Label>
            <Input
              id="name"
              name="name"
              defaultValue={project?.name ?? ""}
              required
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <Field label="Type" htmlFor="type">
              <select
                id="type"
                name="type"
                className={selectClass}
                defaultValue={project?.type ?? "website"}
              >
                {PROJECT_TYPES.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Company" htmlFor="company_id">
              <select
                id="company_id"
                name="company_id"
                className={selectClass}
                defaultValue={project?.company_id ?? ""}
              >
                <option value="">— None —</option>
                {companies.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </Field>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <Field label="Phase" htmlFor="phase">
              <select
                id="phase"
                name="phase"
                className={selectClass}
                defaultValue={project?.phase ?? "discovery"}
              >
                {PROJECT_PHASES.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Status" htmlFor="status">
              <select
                id="status"
                name="status"
                className={selectClass}
                defaultValue={project?.status ?? "active"}
              >
                {PROJECT_STATUSES.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </select>
            </Field>
          </div>

          <Field label="Description" htmlFor="description">
            <Textarea
              id="description"
              name="description"
              rows={2}
              defaultValue={project?.description ?? ""}
            />
          </Field>

          <Field label="Tech stack (comma-separated)" htmlFor="tech_stack">
            <Input
              id="tech_stack"
              name="tech_stack"
              placeholder="Next.js, TypeScript, Supabase"
              defaultValue={project?.tech_stack?.join(", ") ?? ""}
            />
          </Field>

          <div className="grid grid-cols-2 gap-3">
            <Field label="Repository URL" htmlFor="repo_url">
              <Input id="repo_url" name="repo_url" defaultValue={project?.repo_url ?? ""} />
            </Field>
            <Field label="Staging URL" htmlFor="staging_url">
              <Input id="staging_url" name="staging_url" defaultValue={project?.staging_url ?? ""} />
            </Field>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <Field label="Production URL" htmlFor="production_url">
              <Input id="production_url" name="production_url" defaultValue={project?.production_url ?? ""} />
            </Field>
            <Field label="Domain" htmlFor="domain">
              <Input id="domain" name="domain" defaultValue={project?.domain ?? ""} />
            </Field>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <Field label="Registrar" htmlFor="registrar">
              <Input id="registrar" name="registrar" defaultValue={project?.registrar ?? ""} />
            </Field>
            <Field label="Hosting provider" htmlFor="hosting_provider">
              <Input id="hosting_provider" name="hosting_provider" defaultValue={project?.hosting_provider ?? ""} />
            </Field>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <Field label="Domain expires" htmlFor="domain_expiry">
              <Input id="domain_expiry" name="domain_expiry" type="date" defaultValue={project?.domain_expiry ?? ""} />
            </Field>
            <Field label="Hosting expires" htmlFor="hosting_expiry">
              <Input id="hosting_expiry" name="hosting_expiry" type="date" defaultValue={project?.hosting_expiry ?? ""} />
            </Field>
          </div>

          <div className="grid grid-cols-3 gap-3">
            <Field label="Budget (₹)" htmlFor="budget">
              <Input id="budget" name="budget" inputMode="decimal" defaultValue={project?.budget ?? ""} />
            </Field>
            <Field label="Start date" htmlFor="start_date">
              <Input id="start_date" name="start_date" type="date" defaultValue={project?.start_date ?? ""} />
            </Field>
            <Field label="Launch date" htmlFor="launch_date">
              <Input id="launch_date" name="launch_date" type="date" defaultValue={project?.launch_date ?? ""} />
            </Field>
          </div>

          {error && <p className="text-sm text-destructive">{error}</p>}
          <DialogFooter>
            <Button type="submit" disabled={pending}>
              {pending ? "Saving…" : isEdit ? "Save changes" : "Create project"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function Field({
  label,
  htmlFor,
  children,
}: {
  label: string;
  htmlFor: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-2">
      <Label htmlFor={htmlFor}>{label}</Label>
      {children}
    </div>
  );
}
