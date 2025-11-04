"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { z } from "zod";
import { invalidateSessionCache } from "@/lib/dal";
import { actionClient } from "@/lib/safe-action";
import { authClient } from "@/lib/utils";

export const setSignInCookie = async (
	rememberMe: boolean,
	lastEmail: string,
) => {
	const cookieStore = await cookies();
	cookieStore.set("rememberMe", rememberMe ? "true" : "false");
	cookieStore.set("lastEmail", lastEmail);
};

const signinSchema = z.object({
	email: z.email("Please enter a valid email address"),
	password: z.string().min(1, "Password is required"),
	rememberMe: z.boolean().optional().default(false),
});

export const signInAction = actionClient
	.metadata({ actionName: "signIn" })
	.inputSchema(signinSchema)
	.action(async ({ parsedInput: { email, password, rememberMe } }) => {
		const response = await authClient.signIn.email({
			email,
			password,
			callbackURL: "http://localhost:3000/",
			rememberMe,
		});

		if (!response.data) {
			throw new Error("Invalid email or password. Please try again.");
		}

		await setSignInCookie(rememberMe, rememberMe ? email : "");
		await invalidateSessionCache();

		redirect("/");
	});
