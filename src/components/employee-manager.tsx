"use client";

import { useActionState, useEffect, useRef } from "react";
import { toast } from "sonner";
import {
  createEmployee,
  updateEmployeeRole,
  setEmployeeActive,
  type ActionState,
} from "@/lib/actions/admin";
import type { ProfileWithRole, Role } from "@/lib/types";
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

const initial: ActionState = {};

export function EmployeeManager({
  employees,
  roles,
  currentUserId,
}: {
  employees: ProfileWithRole[];
  roles: Role[];
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
              <Label htmlFor="role_id">Role</Label>
              <select
                id="role_id"
                name="role_id"
                className="h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm shadow-sm"
                defaultValue=""
              >
                <option value="">— No role —</option>
                {roles.map((r) => (
                  <option key={r.id} value={r.id}>
                    {r.name}
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
                <TableHead>Role</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {employees.map((emp) => (
                <TableRow key={emp.id}>
                  <TableCell>
                    <div className="font-medium">
                      {emp.full_name || emp.email?.split("@")[0]}
                    </div>
                    <div className="text-xs text-muted-foreground">
                      {emp.email}
                    </div>
                  </TableCell>
                  <TableCell>
                    <form action={updateEmployeeRole}>
                      <input type="hidden" name="id" value={emp.id} />
                      <select
                        name="role_id"
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
                        employeeName={
                          emp.full_name || emp.email || "this employee"
                        }
                      />
                      {emp.id === currentUserId ? (
                        <span className="px-3 text-xs text-muted-foreground">
                          You
                        </span>
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
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
