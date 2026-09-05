"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { prisma } from "@/lib/prisma";

export type AuthState = { error?: string };

const DEACTIVATED_MESSAGE =
  "This account has been deactivated. Contact an administrator.";

/** Email + password sign-in. Accounts are created by an admin. */
export async function signIn(
  _prev: AuthState,
  formData: FormData,
): Promise<AuthState> {
  const email = String(formData.get("email") ?? "").trim();
  const password = String(formData.get("password") ?? "");

  if (!email || !password) {
    return { error: "Enter your email and password." };
  }

  const supabase = await createClient();
  const { data, error } = await supabase.auth.signInWithPassword({
    email,
    password,
  });

  if (error) {
    return { error: "Invalid email or password." };
  }

  // Deactivation bans the auth user, so this normally never fires. It covers
  // the case where is_active was flipped without the ban landing.
  const profile = await prisma.profile.findUnique({
    where: { id: data.user.id },
    select: { is_active: true },
  });

  if (profile && !profile.is_active) {
    await supabase.auth.signOut();
    return { error: DEACTIVATED_MESSAGE };
  }

  redirect("/");
}

export async function signOut() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect("/login");
}
