"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { ShieldIcon, TriangleAlertIcon } from "lucide-react";
import {
  createRole,
  updateRole,
  deleteRole,
  applyRoleTemplate,
  type ActionState,
} from "@/lib/actions/admin";
import {
  PERMISSION_GROUPS,
  ROLE_TEMPLATES,
  type Permission,
} from "@/lib/permissions";
import type { Role } from "@/lib/types";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

const initial: ActionState = {};

export function RoleManager({
  roles,
  usageByRole,
}: {
  roles: Role[];
  /** role id -> how many employees hold it. */
  usageByRole: Record<string, number>;
}) {
  const [error, setError] = useState<string>();
  const [pending, startTransition] = useTransition();
  const [openRoleId, setOpenRoleId] = useState<string | null>(null);
  const [pendingDelete, setPendingDelete] = useState<Role | null>(null);

  function onCreate(formData: FormData) {
    startTransition(async () => {
      const res = await createRole(initial, formData);
      if (res.error) setError(res.error);
      else {
        toast.success(res.success ?? "Role created");
        setError(undefined);
      }
    });
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Add role</CardTitle>
        </CardHeader>
        <CardContent>
          <form action={onCreate} className="flex flex-wrap items-end gap-3">
            <div className="space-y-2">
              <Label htmlFor="name">Role name</Label>
              <Input
                id="name"
                name="name"
                placeholder="e.g. Full-Stack Developer"
                className="w-64"
                required
              />
            </div>
            <Button type="submit" disabled={pending}>
              {pending ? "Adding…" : "Add role"}
            </Button>
            <p className="text-xs text-muted-foreground">
              New roles start with no permissions — open one to grant access.
            </p>
          </form>
          {error && <p className="mt-2 text-sm text-destructive">{error}</p>}
        </CardContent>
      </Card>

      <div className="space-y-3">
        {roles.map((role) => {
          const held = new Set(role.permissions as Permission[]);
          const count = role.is_admin ? "All" : held.size;
          const inUse = usageByRole[role.id] ?? 0;
          const isOpen = openRoleId === role.id;

          return (
            <Card key={role.id}>
              <CardHeader className="flex flex-row items-center justify-between gap-3">
                <div className="flex min-w-0 items-center gap-2">
                  <CardTitle className="text-base">{role.name}</CardTitle>
                  {role.is_admin && (
                    <Badge className="gap-1">
                      <ShieldIcon className="size-3" />
                      Admin
                    </Badge>
                  )}
                  <span className="text-xs text-muted-foreground">
                    {count} permission{count === 1 ? "" : "s"} ·{" "}
                    {inUse} employee{inUse === 1 ? "" : "s"}
                  </span>
                </div>
                <div className="flex shrink-0 gap-1">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setOpenRoleId(isOpen ? null : role.id)}
                  >
                    {isOpen ? "Close" : "Edit permissions"}
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="text-destructive"
                    onClick={() => setPendingDelete(role)}
                  >
                    Delete
                  </Button>
                </div>
              </CardHeader>

              {isOpen && (
                <CardContent>
                  <form action={updateRole} className="space-y-5">
                    <input type="hidden" name="id" value={role.id} />

                    <div className="flex flex-wrap items-end gap-3">
                      <div className="space-y-2">
                        <Label htmlFor={`name-${role.id}`}>Name</Label>
                        <Input
                          id={`name-${role.id}`}
                          name="name"
                          defaultValue={role.name}
                          className="w-64"
                          required
                        />
                      </div>
                      <label className="flex items-center gap-2 pb-2 text-sm">
                        <input
                          type="checkbox"
                          name="is_admin"
                          value="true"
                          defaultChecked={role.is_admin}
                          className="size-4"
                        />
                        Full admin
                      </label>
                    </div>

                    {role.is_admin && (
                      <p className="flex items-start gap-2 rounded-md bg-amber-500/10 p-3 text-xs text-amber-700 dark:text-amber-400">
                        <TriangleAlertIcon className="mt-px size-3.5 shrink-0" />
                        <span>
                          Full admin overrides everything below — this role can
                          do anything regardless of the boxes ticked.
                        </span>
                      </p>
                    )}

                    <div className="grid gap-5 sm:grid-cols-2">
                      {PERMISSION_GROUPS.map((group) => (
                        <fieldset key={group.key} className="space-y-2">
                          <legend className="text-sm font-medium">
                            {group.label}
                          </legend>
                          <p className="text-xs text-muted-foreground">
                            {group.description}
                          </p>
                          <div className="space-y-1.5 pt-1">
                            {group.permissions.map((perm) => (
                              <label
                                key={perm.value}
                                className="flex items-start gap-2 text-sm"
                              >
                                <input
                                  type="checkbox"
                                  name="permissions"
                                  value={perm.value}
                                  defaultChecked={held.has(perm.value)}
                                  className="mt-0.5 size-4 shrink-0"
                                />
                                <span className="min-w-0">
                                  <span className="flex items-center gap-1.5">
                                    {perm.label}
                                    {perm.sensitive && (
                                      <span className="rounded bg-amber-500/10 px-1 text-[10px] font-medium text-amber-700 dark:text-amber-400">
                                        sensitive
                                      </span>
                                    )}
                                  </span>
                                  {perm.hint && (
                                    <span className="block text-xs text-muted-foreground">
                                      {perm.hint}
                                    </span>
                                  )}
                                </span>
                              </label>
                            ))}
                          </div>
                        </fieldset>
                      ))}
                    </div>

                    <div className="flex items-center justify-between gap-3 border-t pt-4">
                      <p className="text-xs text-muted-foreground">
                        Granting a write also grants the matching read.
                      </p>
                      <Button type="submit">Save permissions</Button>
                    </div>
                  </form>

                  <form
                    action={applyRoleTemplate}
                    className="mt-3 flex flex-wrap items-center gap-2 border-t pt-3"
                  >
                    <input type="hidden" name="id" value={role.id} />
                    <span className="text-xs text-muted-foreground">
                      Or start from a preset:
                    </span>
                    <select
                      name="template"
                      defaultValue=""
                      className="h-8 rounded-md border border-input bg-transparent px-2 text-xs"
                      required
                    >
                      <option value="" disabled>
                        Choose a preset…
                      </option>
                      {ROLE_TEMPLATES.map((t) => (
                        <option key={t.name} value={t.name}>
                          {t.name} — {t.summary}
                        </option>
                      ))}
                    </select>
                    <Button type="submit" variant="outline" size="sm">
                      Apply preset
                    </Button>
                  </form>
                </CardContent>
              )}
            </Card>
          );
        })}
      </div>

      {pendingDelete && (
        <ConfirmDialog
          open
          onOpenChange={(open) => !open && setPendingDelete(null)}
          title="Delete this role?"
          body={
            (usageByRole[pendingDelete.id] ?? 0) > 0
              ? `${usageByRole[pendingDelete.id]} employee(s) currently hold "${pendingDelete.name}". They will be left with no role and lose all access until you assign them another. This cannot be undone.`
              : `"${pendingDelete.name}" will be permanently deleted. This cannot be undone.`
          }
          confirmLabel="Delete role"
          onConfirm={async () => {
            const fd = new FormData();
            fd.set("id", pendingDelete.id);
            await deleteRole(fd);
            toast.success("Role deleted");
          }}
        />
      )}
    </div>
  );
}
