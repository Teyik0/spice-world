"use server";

import { invalidateSessionCache } from "@spice-world/web/lib/dal";
import { standardSchema } from "@spice-world/web/lib/schema";
import { actionClient, authClient } from "@spice-world/web/lib/utils";
import { t } from "elysia";
import { ResponseCookies } from "next/dist/server/web/spec-extension/cookies";
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
  .inputSchema(standardSchema(signinSchema))
  .action(async ({ parsedInput: { email, password, rememberMe } }) => {
    const response = await authClient.signIn.email({
      email,
      password,
      rememberMe,
      // Signed in server side: hand the session cookies over to the browser.
      fetchOptions: {
        onResponse: async (ctx) => {
          const store = await cookies();
          for (const cookie of new ResponseCookies(
            ctx.response.headers,
          ).getAll()) {
            store.set(cookie);
          }
        },
      },
    });

    if (!response.data) {
      throw new Error("Invalid email or password. Please try again.");
    }

    await setSignInCookie(rememberMe, rememberMe ? email : "");
    await invalidateSessionCache();

    redirect("/");
  });
