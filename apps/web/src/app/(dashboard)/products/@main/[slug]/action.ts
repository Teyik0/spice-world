"use server";

import { revalidatePath } from "next/cache";

// biome-ignore lint/suspicious/useAwait: Next.js Server Actions must expose async functions.
export async function revalidateProductPath(slug: string) {
  revalidatePath(`/products/${slug}`, "page");
}
