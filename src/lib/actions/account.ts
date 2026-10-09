"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { getSessionProfile } from "@/lib/auth";

/** Turn your own daily reminder email on or off. Needs no permission. */
export async function setEmailDigest(enabled: boolean): Promise<void> {
  const session = await getSessionProfile();
  if (!session) redirect("/login");
  await prisma.profile.update({
    where: { id: session.userId },
    data: { email_digest: enabled === true },
  });
  revalidatePath("/", "layout");
}
