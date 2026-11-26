"use server";

import { invalidateSessionCache } from "@spice-world/web/lib/dal";
import { standardSchema } from "@spice-world/web/lib/schema";
import { actionClient } from "@spice-world/web/lib/utils";
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
  rememberMe: t.Boolean({ default: false }),
});

// Runs after the browser signed in through the /api proxy (see email-signin.tsx).
export const signInAction = actionClient
  .inputSchema(standardSchema(signinSchema))
  .action(async ({ parsedInput: { email, rememberMe } }) => {
    await setSignInCookie(rememberMe, rememberMe ? email : "");
    await invalidateSessionCache();

    redirect("/");
  });
