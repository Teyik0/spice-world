"use server";

import { cookies } from "next/headers";

export const setSignInCookie = async (
	rememberMe: boolean,
	lastEmail: string,
) => {
	const cookieStore = await cookies();
	cookieStore.set("rememberMe", rememberMe ? "true" : "false");
	cookieStore.set("lastEmail", lastEmail);
};
