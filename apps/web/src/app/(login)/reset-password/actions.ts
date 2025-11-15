"use server";

import { invalidateSessionCache } from "@spice-world/web/lib/dal";
import { actionClient } from "@spice-world/web/lib/safe-action";
import { authClient } from "@spice-world/web/lib/utils";
import { z } from "zod";
import { passwordValidation } from "../utils";

const resetPasswordSchema = z
	.object({
		newPassword: passwordValidation,
		confirmPassword: z.string(),
		token: z.string().min(1, "Reset token is required"),
	})
	.refine((data) => data.newPassword === data.confirmPassword, {
		message: "Passwords must match",
		path: ["confirmPassword"],
	});

export const resetPasswordAction = actionClient
	.metadata({ actionName: "resetPassword" })
	.inputSchema(resetPasswordSchema)
	.action(async ({ parsedInput: { newPassword, token } }) => {
		const response = await authClient.resetPassword({
			newPassword,
			token,
		});

		if (!response.data) {
			throw new Error(
				"The reset link may be invalid or expired. Please request a new one.",
			);
		}

		await invalidateSessionCache();

		return { passwordReset: true };
	});
