"use server";

import { revalidatePath } from "next/cache";

export async function revalidateUsersLayout() {
	revalidatePath("/users", "layout");
}
