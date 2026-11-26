import { ForgotPasswordForm } from "@spice-world/ui/components/forgot-password-form";
import { defineRoute } from "@teyik0/furin";
import { Link } from "@teyik0/furin/link";

import { AuthHeading } from "../../../components/auth-heading";
import { authClient } from "../../../lib/api";

export const route = defineRoute("/(login)/forgot-password/")
  .config({ mode: "ssg" })
  .head(() => ({ meta: [{ title: "Forgot Password — Spice World" }] }))
  .page(() => (
    <>
      <AuthHeading title="Forgot your password?">
        Enter your email and we’ll send you a link to choose a new one.
      </AuthHeading>
      <ForgotPasswordForm
        action={async ({ email }) => {
          const { error } = await authClient.requestPasswordReset({
            email,
            redirectTo: `${window.location.origin}/reset-password`,
          });
          return error
            ? error.message || "Request failed. Try again."
            : undefined;
        }}
      />
      <Link
        className="text-muted-foreground hover:text-foreground text-sm underline-offset-4 hover:underline"
        to="/signin"
      >
        Back to Sign In
      </Link>
    </>
  ));
