"use server";

import { revalidatePath } from "next/cache";

export async function revalidateProductsLayout() {
	revalidatePath("/products", "page");
}
