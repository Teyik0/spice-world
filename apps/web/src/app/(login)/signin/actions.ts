"use server";

import { invalidateSessionCache } from "@spice-world/web/lib/dal";
import {
	actionClient,
	authClient,
	typeboxToStandardSchema,
} from "@spice-world/web/lib/utils";
import { t } from "elysia";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";

export const setSignInCookie = async (
	rememberMe: boolean,
	lastEmail: string,
) => {
	const cookieStore = await cookies();
	cookieStore.set("rememberMe", rememberMe ? "true" : "false");
	cookieStore.set("lastEmail", lastEmail);
};

const signinSchema = t.Object({
	email: t.String({
		format: "email",
		error: "Please enter a valid email address",
	}),
	password: t.String({ minLength: 3 }),
	rememberMe: t.Boolean({ default: false }),
});

export const signInAction = actionClient
	.inputSchema(typeboxToStandardSchema(signinSchema))
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
