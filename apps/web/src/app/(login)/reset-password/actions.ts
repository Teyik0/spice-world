"use server";

import { Compile } from "@sinclair/typemap";
import { invalidateSessionCache } from "@spice-world/web/lib/dal";
import { actionClient, authClient } from "@spice-world/web/lib/utils";
import { t } from "elysia";
import { passwordValidation } from "../utils";

const resetPasswordSchema = t.Object({
	newPassword: passwordValidation,
	confirmPassword: t.String(),
	token: t.String({ minLength: 1, error: "Reset token is required" }),
});

export const resetPasswordAction = actionClient
	.inputSchema(Compile(resetPasswordSchema))
	.action(async ({ parsedInput: { newPassword, confirmPassword, token } }) => {
		if (newPassword !== confirmPassword) {
			throw new Error("Passwords must match");
		}
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
