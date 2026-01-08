"use server";

import { revalidatePath } from "next/cache";

export async function revalidateProductPath() {
	revalidatePath("/products/[slug]", "page");
}
