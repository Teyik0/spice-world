"use server";

import { cookies } from "next/headers";

const SIDEBAR_COOKIE_NAME = "sidebar-expanded";

export async function getSidebarExpanded(): Promise<boolean> {
	const cookieStore = await cookies();
	const value = cookieStore.get(SIDEBAR_COOKIE_NAME)?.value;
	return value === "true";
}

export async function setSidebarExpanded(expanded: boolean): Promise<void> {
	const cookieStore = await cookies();
	cookieStore.set(SIDEBAR_COOKIE_NAME, String(expanded), {
		path: "/",
		maxAge: 60 * 60 * 24 * 365, // 1 an
		sameSite: "lax",
	});
}
