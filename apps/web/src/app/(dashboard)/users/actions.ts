"use server";

import { revalidatePath } from "next/cache";

// biome-ignore lint/suspicious/useAwait: Next.js Server Actions must expose async functions.
export async function revalidateUsersLayout() {
  revalidatePath("/users", "layout");
}
