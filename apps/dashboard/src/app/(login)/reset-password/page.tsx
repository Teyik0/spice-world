import { ResetPasswordForm } from "@spice-world/ui/components/reset-password-form";
import { defineRoute } from "@teyik0/furin";
import { Link } from "@teyik0/furin/link";
import { t } from "elysia";

import { AuthHeading } from "../../../components/auth-heading";
import { authClient } from "../../../lib/api";

export const route = defineRoute("/(login)/reset-password/")
  .config({ mode: "ssr", query: t.Object({ token: t.Optional(t.String()) }) })
  .head(() => ({ meta: [{ title: "Reset Password — Spice World" }] }))
  .page(({ query: { token } }) => {
    if (token) {
      return (
        <>
          <AuthHeading title="Choose a new password">
            Use at least 8 characters.
          </AuthHeading>
          <ResetPasswordForm
            action={async ({ newPassword }) => {
              const { error } = await authClient.resetPassword({
                newPassword,
                token,
              });
              return error
                ? "This reset link is invalid or has expired. Request a new one."
                : undefined;
            }}
          />
          {backToSignIn}
        </>
      );
    }

    return (
      <>
        <AuthHeading title="This link is invalid">
          The reset link is incomplete or has expired.{" "}
          <Link
            className="text-foreground underline underline-offset-4"
            to="/forgot-password"
          >
            Request a new one
          </Link>
          .
        </AuthHeading>
        {backToSignIn}
      </>
    );
  });

const backToSignIn = (
  <Link
    className="text-muted-foreground hover:text-foreground text-sm underline-offset-4 hover:underline"
    to="/signin"
  >
    Back to Sign In
  </Link>
);
