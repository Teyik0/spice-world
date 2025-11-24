"use server";

import {
	actionClient,
	authClient,
	typeboxToStandardSchema,
} from "@spice-world/web/lib/utils";
import { t } from "elysia";

const forgotPasswordSchema = t.Object({
	email: t.String({
		format: "email",
		error: "Please enter a valid email address",
	}),
});

export const forgotPasswordAction = actionClient
	.inputSchema(typeboxToStandardSchema(forgotPasswordSchema))
	.action(async ({ parsedInput: { email } }) => {
		try {
			await authClient.forgetPassword({
				email,
				redirectTo: "http://localhost:3000/reset-password",
			});
		} catch (error: unknown) {
			console.error("Forgot password error:", error);
		}

		// Always return success for security reasons (don't reveal if email exists)
		return { emailSent: true };
	});
