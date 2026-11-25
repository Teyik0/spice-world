import { stripe } from "@better-auth/stripe";
import PasswordReset from "@spice-world/emails/src/password-reset";
import ResetPassword from "@spice-world/emails/src/reset-password";
import VerifyEmail from "@spice-world/emails/src/spiceworld-welcome";
import { env } from "@spice-world/server/lib/env";
import { prisma } from "@spice-world/server/lib/prisma";
import { stripeClient } from "@spice-world/server/lib/stripe";
import { prismaAdapter } from "better-auth/adapters/prisma";
import { betterAuth } from "better-auth/minimal";
import { admin, openAPI } from "better-auth/plugins";
import type { MacroTypeLambda } from "elysia";
import { Elysia, macroType } from "elysia";
import { Resend } from "resend";
import type Stripe from "stripe";

import { orderService } from "../modules/orders/service";
import { loggerPlugin } from "./logger.plugin";

const resend = new Resend(env.RESEND_API_KEY);
const from = "Spice World <noreply@teyik0.dev>";

export const auth = betterAuth({
  database: prismaAdapter(prisma, {
    provider: "postgresql",
  }),
  trustedOrigins: ["http://localhost:3000", "http://localhost:3001"], // Both frontend and backend
  advanced: { database: { joins: true } },
  session: {
    cookieCache: {
      enabled: true,
      maxAge: 5 * 60,
    },
  },
  rateLimit: {
    enabled: true,
    window: 10, // time window in seconds
    max: 100, // max requests in the window
    customRules: {
      "/sign-in/email": {
        window: 10,
        max: 3,
      },
    },
  },
  emailAndPassword: {
    enabled: true,
    requireEmailVerification: true,
    sendResetPassword: async ({ user, url }) => {
      await resend.emails.send({
        from,
        to: [user.email],
        subject: "Spice World - Réinitialisez votre mot de passe",
        react: <ResetPassword resetLink={url} />,
      });
    },
    onPasswordReset: async ({ user }) => {
      await resend.emails.send({
        from,
        to: [user.email],
        subject: "Spice World - Votre mot de passe a été réinitialisé",
        react: <PasswordReset />,
      });
    },
  },
  emailVerification: {
    sendOnSignUp: true,
    autoSignInAfterVerification: true,
    sendVerificationEmail: async ({ user, url }) => {
      await resend.emails.send({
        from,
        to: [user.email],
        subject: "Spice World - Verify your email",
        react: <VerifyEmail verifyLink={url} />,
      });
    },
  },
  user: {
    additionalFields: {
      role: {
        type: "string",
        required: false,
        defaultValue: "user",
        input: false, // don't allow user to set role
        returned: true,
      },
    },
    changeEmail: {
      enabled: true,
      sendChangeEmailConfirmation: async ({ user, newEmail, url }) => {
        await resend.emails.send({
          from,
          to: [user.email],
          subject:
            "Spice World - Approuvez le changement vers votre nouvelle adresse email",
          text: `Click the link to approve the change to ${newEmail}: ${url}`,
        });
      },
    },
  },
  account: {
    accountLinking: {
      allowDifferentEmails: true,
    },
  },
  socialProviders: {
    google: {
      clientId: env.GOOGLE_CLIENT_ID ?? "",
      clientSecret: env.GOOGLE_CLIENT_SECRET,
    },
  },
  plugins: [
    openAPI(),
    admin(),
    stripe({
      stripeClient,
      stripeWebhookSecret: env.STRIPE_WEBHOOK_SECRET,
      createCustomerOnSignUp: true,
      onEvent: async (event: Stripe.Event) => {
        switch (event.type) {
          case "checkout.session.completed": {
            const { id, metadata, payment_intent, payment_status } =
              event.data.object;
            if (payment_status !== "unpaid" && metadata?.orderId) {
              await orderService.handleOrderPaid(
                id,
                metadata.orderId,
                typeof payment_intent === "string" ? payment_intent : null,
              );
            }
            break;
          }
          case "checkout.session.async_payment_failed":
          case "checkout.session.expired": {
            const { id, metadata } = event.data.object;
            if (metadata?.orderId) {
              await orderService.cancelPending(id, metadata.orderId);
            }
            break;
          }
          default:
        }
      },
    }),
  ],
});

interface AccessContext extends MacroTypeLambda {
  output: "optional" extends this["input"]
    ? {
        [K in keyof typeof auth.$Infer.Session]:
          (typeof auth.$Infer.Session)[K] | null;
      }
    : typeof auth.$Infer.Session;
}

export const betterAuthPlugin = new Elysia({
  name: "better-auth",
  tags: ["Auth"],
})
  .use(loggerPlugin)
  .macro({
    access: (level: "optional" | "login" | "admin") => ({
      $type: macroType<AccessContext>(),
      async derive({ log, request: { headers }, problem }) {
        const session = await auth.api.getSession({ headers });
        log.set({
          user: session
            ? { id: session.user.id, role: session.user.role }
            : { role: "anonymous" },
        });

        if (!session && level !== "optional") {
          return problem("Unauthorized");
        }

        if (level === "admin" && session && session.user.role !== "admin") {
          return problem("Forbidden");
        }

        return {
          user: session?.user ?? null,
          session: session?.session ?? null,
        };
      },
    }),
  });
