import { FieldSeparator } from "@spice-world/ui/components/field";
import { GoogleSignInForm } from "@spice-world/ui/components/google-sign-in-form";
import { SignInForm } from "@spice-world/ui/components/sign-in-form";
import { Await, defineRoute } from "@teyik0/furin";
import { Link, useNavigate } from "@teyik0/furin/link";
import { Suspense } from "react";

import { AuthHeading } from "../../../components/auth-heading";
import { authClient } from "../../../lib/api";

const YEAR_MS = 365 * 24 * 60 * 60 * 1000;

export const route = defineRoute("/(login)/signin/")
  .config({ mode: "ssg" })
  .requestLoader(({ cookies }) => ({ lastEmail: cookies.get("lastEmail") }))
  .head(() => ({ meta: [{ title: "Sign In — Spice World" }] }))
  .page(({ lastEmail }) => (
    <>
      <AuthHeading title="Welcome back">
        Sign in to manage products, orders and customers.
      </AuthHeading>
      <Suspense fallback={<SignIn />}>
        <Await resolve={lastEmail}>
          {(email) => (
            <SignIn defaultEmail={typeof email === "string" ? email : ""} />
          )}
        </Await>
      </Suspense>
      <FieldSeparator>Or</FieldSeparator>
      <GoogleSignInForm
        action={async () => {
          const { error } = await authClient.signIn.social({
            provider: "google",
            callbackURL: `${window.location.origin}/`,
            errorCallbackURL: `${window.location.origin}/signin`,
          });
          return error
            ? error.message || "Google sign-in failed. Try again."
            : undefined;
        }}
      />
    </>
  ));

function SignIn({ defaultEmail }: { defaultEmail?: string }) {
  const navigate = useNavigate();
  return (
    <SignInForm
      action={async ({ email, password, rememberMe }) => {
        const { data, error } = await authClient.signIn.email({
          email,
          password,
          rememberMe,
        });
        if (error) {
          return error.message ?? "Sign in failed. Try again.";
        }
        if (data.user.role !== "admin") {
          await authClient.signOut();
          return "This account has no access to the back office.";
        }
        await (rememberMe
          ? cookieStore.set({
              name: "lastEmail",
              value: email,
              expires: Date.now() + YEAR_MS,
            })
          : cookieStore.delete("lastEmail"));
        await navigate({ to: "/" });
      }}
      defaultEmail={defaultEmail}
      forgotPassword={
        <Link
          className="text-muted-foreground hover:text-foreground ml-auto text-sm underline-offset-4 hover:underline"
          to="/forgot-password"
        >
          Forgot your password?
        </Link>
      }
    />
  );
}
