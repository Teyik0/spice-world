"use server";

import { actionClient } from "@spice-world/web/lib/safe-action";
import { authClient } from "@spice-world/web/lib/utils";
import { z } from "zod";

const forgotPasswordSchema = z.object({
	email: z.email("Please enter a valid email address"),
});

export const forgotPasswordAction = actionClient
	.metadata({ actionName: "forgotPassword" })
	.inputSchema(forgotPasswordSchema)
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
