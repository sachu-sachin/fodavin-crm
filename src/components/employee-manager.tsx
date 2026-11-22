"use client";

import { useActionState, useEffect, useRef } from "react";
import { toast } from "sonner";
import {
  createEmployee,
  updateEmployeeRole,
  updateEmployeeExtraRoles,
  updateEmployeeLead,
  setEmployeeActive,
  type ActionState,
} from "@/lib/actions/admin";
import { PasswordResetDialog } from "@/components/password-reset-dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

export interface RoleOption {
  id: string;
  name: string;
}

export interface EmployeeRow {
  id: string;
  name: string;
  email: string | null;
  is_active: boolean;
  /** Main role. */
  role_id: string | null;
  /** Roles held on top of the main one. */
  extra_role_ids: string[];
  reports_to_id: string | null;
}

const initial: ActionState = {};

const SELECT_CLASS =
  "h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm shadow-sm";

export function EmployeeManager({
  employees,
  roles,
  currentUserId,
}: {
  employees: EmployeeRow[];
  roles: RoleOption[];
  currentUserId: string;
}) {
  const [state, formAction, pending] = useActionState(createEmployee, initial);
  const formRef = useRef<HTMLFormElement>(null);

  useEffect(() => {
    if (state.success) {
      toast.success(state.success);
      formRef.current?.reset();
    }
  }, [state.success]);

  const activeLeads = employees.filter((e) => e.is_active);
  const nameOf = new Map(employees.map((e) => [e.id, e.name]));

  return (
    <div className="grid gap-6 lg:grid-cols-3">
      {/* Create employee */}
      <Card className="lg:col-span-1">
        <CardHeader>
          <CardTitle className="text-base">Add employee</CardTitle>
        </CardHeader>
        <CardContent>
          <form ref={formRef} action={formAction} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="full_name">Full name</Label>
              <Input id="full_name" name="full_name" required />
            </div>
            <div className="space-y-2">
              <Label htmlFor="email">Email</Label>
              <Input id="email" name="email" type="email" required />
            </div>
            <div className="space-y-2">
              <Label htmlFor="password">Temporary password</Label>
              <Input
                id="password"
                name="password"
                type="text"
                minLength={8}
                placeholder="min. 8 characters"
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="role_id">Main role</Label>
              <select id="role_id" name="role_id" className={SELECT_CLASS} defaultValue="">
                <option value="">— No role —</option>
                {roles.map((r) => (
                  <option key={r.id} value={r.id}>
                    {r.name}
                  </option>
                ))}
              </select>
            </div>
            <fieldset className="space-y-2">
              <legend className="text-sm font-medium">Additional roles</legend>
              <div className="grid grid-cols-2 gap-1">
                {roles.map((r) => (
                  <label key={r.id} className="flex items-center gap-2 text-sm">
                    <input type="checkbox" name="extra_role_ids" value={r.id} />
                    <span className="truncate">{r.name}</span>
                  </label>
                ))}
              </div>
              <p className="text-xs text-muted-foreground">
                Optional. Access is everything their roles allow, combined.
              </p>
            </fieldset>
            <div className="space-y-2">
              <Label htmlFor="reports_to_id">Reporting lead</Label>
              <select
                id="reports_to_id"
                name="reports_to_id"
                className={SELECT_CLASS}
                defaultValue=""
              >
                <option value="">— None —</option>
                {activeLeads.map((e) => (
                  <option key={e.id} value={e.id}>
                    {e.name}
                  </option>
                ))}
              </select>
            </div>
            {state.error && (
              <p className="text-sm text-destructive">{state.error}</p>
            )}
            <Button type="submit" className="w-full" disabled={pending}>
              {pending ? "Creating…" : "Create account"}
            </Button>
            <p className="text-xs text-muted-foreground">
              The employee signs in with this email + password.
            </p>
          </form>
        </CardContent>
      </Card>

      {/* Employee list */}
      <Card className="lg:col-span-2">
        <CardHeader>
          <CardTitle className="text-base">
            Team ({employees.length})
          </CardTitle>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Roles</TableHead>
                <TableHead>Reports to</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {employees.map((emp) => (
                <EmployeeTableRow
                  key={emp.id}
                  emp={emp}
                  roles={roles}
                  leads={activeLeads.filter((l) => l.id !== emp.id)}
                  leadName={emp.reports_to_id ? nameOf.get(emp.reports_to_id) : undefined}
                  isSelf={emp.id === currentUserId}
                />
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}

function EmployeeTableRow({
  emp,
  roles,
  leads,
  leadName,
  isSelf,
}: {
  emp: EmployeeRow;
  roles: RoleOption[];
  leads: EmployeeRow[];
  leadName?: string;
  isSelf: boolean;
}) {
  const [leadState, leadAction] = useActionState(updateEmployeeLead, initial);

  useEffect(() => {
    if (leadState.error) toast.error(leadState.error);
  }, [leadState]);

  const extras = new Set(emp.extra_role_ids);
  const extraNames = roles
    .filter((r) => extras.has(r.id) && r.id !== emp.role_id)
    .map((r) => r.name);
  // An inactive lead isn't offered, but keep showing the current one.
  const leadOptions =
    emp.reports_to_id && !leads.some((l) => l.id === emp.reports_to_id)
      ? [...leads, { id: emp.reports_to_id, name: leadName ?? "Former employee" }]
      : leads;

  return (
    <TableRow>
      <TableCell>
        <div className="font-medium">{emp.name}</div>
        <div className="text-xs text-muted-foreground">{emp.email}</div>
      </TableCell>
      <TableCell className="space-y-1">
        <form action={updateEmployeeRole}>
          <input type="hidden" name="id" value={emp.id} />
          <select
            name="role_id"
            aria-label="Main role"
            defaultValue={emp.role_id ?? ""}
            onChange={(e) => e.currentTarget.form?.requestSubmit()}
            className="h-8 rounded-md border border-input bg-transparent px-2 text-sm"
          >
            <option value="">— None —</option>
            {roles.map((r) => (
              <option key={r.id} value={r.id}>
                {r.name}
              </option>
            ))}
          </select>
        </form>
        <details className="text-xs">
          <summary className="cursor-pointer text-muted-foreground">
            {extraNames.length ? `+ ${extraNames.join(", ")}` : "Add roles"}
          </summary>
          <form action={updateEmployeeExtraRoles} className="mt-2 space-y-2">
            <input type="hidden" name="id" value={emp.id} />
            <div className="grid grid-cols-2 gap-1">
              {roles
                .filter((r) => r.id !== emp.role_id)
                .map((r) => (
                  <label key={r.id} className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      name="extra_role_ids"
                      value={r.id}
                      defaultChecked={extras.has(r.id)}
                    />
                    <span className="truncate">{r.name}</span>
                  </label>
                ))}
            </div>
            <Button type="submit" size="sm" variant="outline">
              Save roles
            </Button>
          </form>
        </details>
      </TableCell>
      <TableCell>
        <form action={leadAction}>
          <input type="hidden" name="id" value={emp.id} />
          <select
            name="reports_to_id"
            aria-label="Reporting lead"
            defaultValue={emp.reports_to_id ?? ""}
            onChange={(e) => e.currentTarget.form?.requestSubmit()}
            className="h-8 max-w-40 rounded-md border border-input bg-transparent px-2 text-sm"
          >
            <option value="">— None —</option>
            {leadOptions.map((l) => (
              <option key={l.id} value={l.id}>
                {l.name}
              </option>
            ))}
          </select>
        </form>
      </TableCell>
      <TableCell>
        {emp.is_active ? (
          <Badge variant="secondary">Active</Badge>
        ) : (
          <Badge variant="outline">Inactive</Badge>
        )}
      </TableCell>
      <TableCell className="text-right">
        <div className="flex items-center justify-end gap-1">
          <PasswordResetDialog
            employeeId={emp.id}
            employeeName={emp.name || emp.email || "this employee"}
          />
          {isSelf ? (
            <span className="px-3 text-xs text-muted-foreground">You</span>
          ) : (
            <form action={setEmployeeActive} className="inline">
              <input type="hidden" name="id" value={emp.id} />
              <input
                type="hidden"
                name="active"
                value={emp.is_active ? "false" : "true"}
              />
              <Button
                type="submit"
                variant="ghost"
                size="sm"
                className={emp.is_active ? "text-destructive" : ""}
              >
                {emp.is_active ? "Deactivate" : "Activate"}
              </Button>
            </form>
          )}
        </div>
      </TableCell>
    </TableRow>
  );
}
