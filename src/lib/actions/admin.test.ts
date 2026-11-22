import { beforeEach, describe, expect, it, vi } from "vitest";
import { Prisma } from "@prisma/client";

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

vi.mock("@/lib/auth", () => ({
  authorize: vi.fn(),
  DENIED_MESSAGE: "You don't have permission to do that.",
}));

vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: vi.fn(),
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    profile: { update: vi.fn(), findMany: vi.fn() },
    role: { create: vi.fn(), update: vi.fn(), delete: vi.fn(), findMany: vi.fn() },
    profileRole: { deleteMany: vi.fn(), createMany: vi.fn() },
    $transaction: vi.fn(),
  },
}));

const { revalidatePath } = await import("next/cache");
const { authorize, DENIED_MESSAGE } = await import("@/lib/auth");
const { createAdminClient } = await import("@/lib/supabase/admin");
const { prisma } = await import("@/lib/prisma");
const {
  createEmployee, updateEmployeeRole, setEmployeeActive, resetEmployeePassword,
  updateEmployeeExtraRoles, updateEmployeeLead,
  createRole, updateRole, applyRoleTemplate, deleteRole,
} = await import("./admin");

function form(fields: Record<string, string>): FormData {
  const fd = new FormData();
  for (const [k, v] of Object.entries(fields)) fd.set(k, v);
  return fd;
}

function authorized(userId = "admin-1") {
  vi.mocked(authorize).mockResolvedValue({ userId, profile: null, isAdmin: true, permissions: new Set() } as never);
}

function unauthorized() {
  vi.mocked(authorize).mockResolvedValue(null);
}

function mockAdminClient(overrides: {
  createUser?: unknown; updateUserById?: unknown;
} = {}) {
  const client = {
    auth: {
      admin: {
        createUser: vi.fn().mockResolvedValue({ error: null }),
        updateUserById: vi.fn().mockResolvedValue({ error: null }),
        ...overrides,
      },
    },
  };
  vi.mocked(createAdminClient).mockReturnValue(client as never);
  return client;
}

beforeEach(() => vi.resetAllMocks());

describe("createEmployee", () => {
  it("denies without employees.manage", async () => {
    unauthorized();
    const result = await createEmployee({}, form({ email: "a@b.com", password: "password1", full_name: "A" }));
    expect(result).toEqual({ error: DENIED_MESSAGE });
  });

  it("requires name, email and password", async () => {
    authorized();
    const result = await createEmployee({}, form({ email: "", password: "", full_name: "" }));
    expect(result.error).toMatch(/required/i);
  });

  it("rejects a password under 8 characters", async () => {
    authorized();
    const result = await createEmployee({}, form({ email: "a@b.com", password: "short", full_name: "A" }));
    expect(result.error).toMatch(/8 characters/);
  });

  it("surfaces the Supabase Admin API error verbatim", async () => {
    authorized();
    mockAdminClient({ createUser: vi.fn().mockResolvedValue({ error: { message: "Email already registered" } }) });
    const result = await createEmployee({}, form({ email: "a@b.com", password: "password1", full_name: "A" }));
    expect(result.error).toBe("Email already registered");
  });

  it("creates the auth user with metadata and reports success", async () => {
    authorized();
    const client = mockAdminClient();
    const result = await createEmployee({}, form({
      email: "a@b.com", password: "password1", full_name: "Alice", role_id: "role-1",
    }));
    expect(client.auth.admin.createUser).toHaveBeenCalledWith(
      expect.objectContaining({
        email: "a@b.com",
        user_metadata: { full_name: "Alice", role_id: "role-1" },
      }),
    );
    expect(result.success).toContain("Alice");
    expect(revalidatePath).toHaveBeenCalledWith("/employees");
  });
});

describe("createEmployee: additional roles and lead", () => {
  it("sets extra roles and the lead on the new profile", async () => {
    authorized();
    mockAdminClient({
      createUser: vi.fn().mockResolvedValue({ data: { user: { id: "new-1" } }, error: null }),
    });
    vi.mocked(prisma.role.findMany).mockResolvedValue([{ id: "role-video" }] as never);
    vi.mocked(prisma.profile.findMany).mockResolvedValue([
      { id: "new-1", is_active: true, reports_to_id: null },
      { id: "lead-1", is_active: true, reports_to_id: null },
    ] as never);

    const fd = form({ email: "a@b.com", password: "password1", full_name: "Alice", reports_to_id: "lead-1" });
    fd.append("extra_role_ids", "role-video");
    const result = await createEmployee({}, fd);

    expect(result.success).toContain("Alice");
    expect(prisma.profileRole.createMany).toHaveBeenCalledWith({
      data: [{ profile_id: "new-1", role_id: "role-video" }],
    });
    expect(prisma.profile.update).toHaveBeenCalledWith({
      where: { id: "new-1" },
      data: { reports_to_id: "lead-1" },
    });
  });
});

describe("updateEmployeeExtraRoles", () => {
  it("does nothing without employees.manage", async () => {
    unauthorized();
    await updateEmployeeExtraRoles(form({ id: "u2" }));
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it("replaces the set, keeping only roles that exist", async () => {
    authorized();
    vi.mocked(prisma.role.findMany).mockResolvedValue([{ id: "role-a" }] as never);
    const fd = form({ id: "u2" });
    fd.append("extra_role_ids", "role-a");
    fd.append("extra_role_ids", "not-a-role");
    fd.append("extra_role_ids", "role-a");
    await updateEmployeeExtraRoles(fd);

    expect(prisma.role.findMany).toHaveBeenCalledWith({
      where: { id: { in: ["role-a", "not-a-role"] } },
      select: { id: true },
    });
    expect(prisma.profileRole.deleteMany).toHaveBeenCalledWith({ where: { profile_id: "u2" } });
    expect(prisma.profileRole.createMany).toHaveBeenCalledWith({
      data: [{ profile_id: "u2", role_id: "role-a" }],
    });
    expect(prisma.$transaction).toHaveBeenCalledTimes(1);
  });

  it("clears every additional role when none are ticked", async () => {
    authorized();
    await updateEmployeeExtraRoles(form({ id: "u2" }));
    expect(prisma.role.findMany).not.toHaveBeenCalled();
    expect(prisma.profileRole.deleteMany).toHaveBeenCalledWith({ where: { profile_id: "u2" } });
    expect(prisma.profileRole.createMany).not.toHaveBeenCalled();
  });
});

describe("updateEmployeeLead", () => {
  const people = [
    { id: "a", is_active: true, reports_to_id: "b" },
    { id: "b", is_active: true, reports_to_id: null },
    { id: "gone", is_active: false, reports_to_id: null },
  ];

  it("denies without employees.manage", async () => {
    unauthorized();
    expect(await updateEmployeeLead({}, form({ id: "a", reports_to_id: "b" }))).toEqual({
      error: DENIED_MESSAGE,
    });
  });

  it("sets the lead", async () => {
    authorized();
    vi.mocked(prisma.profile.findMany).mockResolvedValue(people as never);
    const result = await updateEmployeeLead({}, form({ id: "a", reports_to_id: "b" }));
    expect(result.success).toBeTruthy();
    expect(prisma.profile.update).toHaveBeenCalledWith({ where: { id: "a" }, data: { reports_to_id: "b" } });
  });

  it("refuses a loop", async () => {
    authorized();
    vi.mocked(prisma.profile.findMany).mockResolvedValue(people as never);
    const result = await updateEmployeeLead({}, form({ id: "b", reports_to_id: "a" }));
    expect(result.error).toMatch(/reports to them/);
    expect(prisma.profile.update).not.toHaveBeenCalled();
  });

  it("refuses an inactive lead", async () => {
    authorized();
    vi.mocked(prisma.profile.findMany).mockResolvedValue(people as never);
    const result = await updateEmployeeLead({}, form({ id: "a", reports_to_id: "gone" }));
    expect(result.error).toMatch(/active employee/);
  });

  it("clears the lead without looking anyone up", async () => {
    authorized();
    await updateEmployeeLead({}, form({ id: "a" }));
    expect(prisma.profile.findMany).not.toHaveBeenCalled();
    expect(prisma.profile.update).toHaveBeenCalledWith({ where: { id: "a" }, data: { reports_to_id: null } });
  });
});

describe("updateEmployeeRole", () => {
  it("does nothing without employees.manage", async () => {
    unauthorized();
    await updateEmployeeRole(form({ id: "u2", role_id: "role-1" }));
    expect(prisma.profile.update).not.toHaveBeenCalled();
  });

  it("reassigns the profile's role and revalidates /employees", async () => {
    authorized();
    await updateEmployeeRole(form({ id: "u2", role_id: "role-1" }));
    expect(prisma.profile.update).toHaveBeenCalledWith({ where: { id: "u2" }, data: { role_id: "role-1" } });
    expect(revalidatePath).toHaveBeenCalledWith("/employees");
  });

  it("clears the role (sets it to null) when none is submitted", async () => {
    authorized();
    await updateEmployeeRole(form({ id: "u2" }));
    expect(prisma.profile.update).toHaveBeenCalledWith({ where: { id: "u2" }, data: { role_id: null } });
  });
});

describe("setEmployeeActive", () => {
  it("refuses to let an admin deactivate themselves", async () => {
    authorized("admin-1");
    const client = mockAdminClient();
    await setEmployeeActive(form({ id: "admin-1", active: "false" }));
    expect(client.auth.admin.updateUserById).not.toHaveBeenCalled();
    expect(prisma.profile.update).not.toHaveBeenCalled();
  });

  it("allows an admin to reactivate their own account", async () => {
    authorized("admin-1");
    const client = mockAdminClient();
    await setEmployeeActive(form({ id: "admin-1", active: "true" }));
    expect(client.auth.admin.updateUserById).toHaveBeenCalled();
  });

  it("bans the auth user and flips is_active when deactivating someone else", async () => {
    authorized("admin-1");
    const client = mockAdminClient();
    await setEmployeeActive(form({ id: "user-2", active: "false" }));
    expect(client.auth.admin.updateUserById).toHaveBeenCalledWith("user-2", { ban_duration: "876000h" });
    expect(prisma.profile.update).toHaveBeenCalledWith({ where: { id: "user-2" }, data: { is_active: false } });
  });

  it("does not flip is_active if the Supabase ban call fails", async () => {
    authorized();
    mockAdminClient({ updateUserById: vi.fn().mockResolvedValue({ error: { message: "boom" } }) });
    await setEmployeeActive(form({ id: "user-2", active: "false" }));
    expect(prisma.profile.update).not.toHaveBeenCalled();
  });
});

describe("resetEmployeePassword", () => {
  it("rejects a password under 8 characters", async () => {
    authorized();
    const result = await resetEmployeePassword({}, form({ id: "u2", password: "short" }));
    expect(result.error).toMatch(/8 characters/);
  });

  it("updates the password and returns a success message", async () => {
    authorized();
    mockAdminClient();
    const result = await resetEmployeePassword({}, form({ id: "u2", password: "newpassword1" }));
    expect(result.success).toBeTruthy();
  });
});

describe("createRole", () => {
  it("requires a name", async () => {
    authorized();
    const result = await createRole({}, form({ name: "" }));
    expect(result.error).toMatch(/name/i);
  });

  it("maps a unique-constraint violation to a friendly error", async () => {
    authorized();
    vi.mocked(prisma.role.create).mockRejectedValue(
      new Prisma.PrismaClientKnownRequestError("Unique constraint failed", {
        code: "P2002", clientVersion: "6.19.3",
      }),
    );
    const result = await createRole({}, form({ name: "Accounts" }));
    expect(result.error).toMatch(/already exists/i);
  });

  it("rethrows an unrelated Prisma error", async () => {
    authorized();
    vi.mocked(prisma.role.create).mockRejectedValue(
      new Prisma.PrismaClientKnownRequestError("Foreign key violation", {
        code: "P2003", clientVersion: "6.19.3",
      }),
    );
    await expect(createRole({}, form({ name: "Accounts" }))).rejects.toThrow();
  });

  it("creates the role and revalidates /roles", async () => {
    authorized();
    const result = await createRole({}, form({ name: "Accounts", is_admin: "on" }));
    expect(prisma.role.create).toHaveBeenCalledWith({ data: { name: "Accounts", is_admin: true } });
    expect(result.success).toContain("Accounts");
  });
});

describe("updateRole", () => {
  it("filters a submitted permission list down to known permissions, dropping anything tampered-in", async () => {
    authorized();
    const fd = new FormData();
    fd.set("id", "r1");
    fd.set("name", "Custom");
    fd.set("is_admin", "false");
    fd.append("permissions", "clients.view");
    fd.append("permissions", "clients.manage");
    fd.append("permissions", "definitely.not.real");

    await updateRole(fd);

    expect(prisma.role.update).toHaveBeenCalledWith({
      where: { id: "r1" },
      data: { name: "Custom", is_admin: false, permissions: ["clients.view", "clients.manage"] },
    });
  });

  it("does nothing without an id or name", async () => {
    authorized();
    await updateRole(form({ id: "", name: "Custom" }));
    expect(prisma.role.update).not.toHaveBeenCalled();
  });
});

describe("applyRoleTemplate", () => {
  it("does nothing for an unknown template name", async () => {
    authorized();
    await applyRoleTemplate(form({ id: "r1", template: "Not A Real Template" }));
    expect(prisma.role.update).not.toHaveBeenCalled();
  });

  it("applies a known template's permission set and is_admin flag", async () => {
    authorized();
    await applyRoleTemplate(form({ id: "r1", template: "Accounts" }));
    expect(prisma.role.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "r1" },
        data: expect.objectContaining({ is_admin: false }),
      }),
    );
    const call = vi.mocked(prisma.role.update).mock.calls[0][0] as { data: { permissions: string[] } };
    expect(call.data.permissions).toContain("finance.view");
  });
});

describe("deleteRole", () => {
  it("does nothing without roles.manage", async () => {
    unauthorized();
    await deleteRole(form({ id: "r1" }));
    expect(prisma.role.delete).not.toHaveBeenCalled();
  });

  it("deletes and revalidates", async () => {
    authorized();
    await deleteRole(form({ id: "r1" }));
    expect(prisma.role.delete).toHaveBeenCalledWith({ where: { id: "r1" } });
    expect(revalidatePath).toHaveBeenCalledWith("/roles");
  });
});
