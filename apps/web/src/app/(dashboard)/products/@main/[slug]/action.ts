"use server";

import { revalidatePath } from "next/cache";

export async function revalidateProductPath(slug: string) {
	revalidatePath(`/products/${slug}`, "page");
}
