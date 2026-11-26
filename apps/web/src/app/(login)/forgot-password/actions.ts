"use server";

import { standardSchema } from "@spice-world/web/lib/schema";
import { actionClient, authClient } from "@spice-world/web/lib/utils";
import { t } from "elysia";
import { headers } from "next/headers";

const forgotPasswordSchema = t.Object({
  email: t.String({
    format: "email",
    error: "Please enter a valid email address",
  }),
});

export const forgotPasswordAction = actionClient
  .inputSchema(standardSchema(forgotPasswordSchema))
  .action(async ({ parsedInput: { email } }) => {
    try {
      await authClient.requestPasswordReset({
        email,
        redirectTo: `${(await headers()).get("origin")}/reset-password`,
      });
    } catch (error: unknown) {
      console.error("Forgot password error:", error);
    }

    // Always return success for security reasons (don't reveal if email exists)
    return { emailSent: true };
  });
