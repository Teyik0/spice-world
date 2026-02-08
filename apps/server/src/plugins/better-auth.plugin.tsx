import { stripe } from "@better-auth/stripe";
import { ChangeEmailVerification } from "@spice-world/emails/src/change-email-verification";
import { PasswordReset } from "@spice-world/emails/src/password-reset";
import { ResetPassword } from "@spice-world/emails/src/reset-password";
import { VerifyEmail } from "@spice-world/emails/src/spiceworld-welcome";
import { env } from "@spice-world/server/lib/env";
import { prisma } from "@spice-world/server/lib/prisma";
import { prismaAdapter } from "better-auth/adapters/prisma";
import { betterAuth } from "better-auth/minimal";
import { admin, openAPI } from "better-auth/plugins";
import { Elysia } from "elysia";
import { Resend } from "resend";
import Stripe from "stripe";
import { orderService } from "../modules/orders/service";

const resend = new Resend(env.RESEND_API_KEY);
const from = "Spice World <noreply@teyik0.dev>";

export const stripeClient = new Stripe(env.STRIPE_SECRET_KEY, {
	apiVersion: "2026-01-28.clover",
});

export const auth = betterAuth({
	database: prismaAdapter(prisma, {
		provider: "postgresql",
	}),
	trustedOrigins: ["http://localhost:3000", "http://localhost:3001"], // Both frontend and backend
	experimental: { joins: true },
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
			sendChangeEmailVerification: async ({ newEmail, url }) => {
				await resend.emails.send({
					from,
					to: [newEmail],
					subject: "Spice World - Confirmez votre nouvelle adresse email",
					react: <ChangeEmailVerification verifyLink={url} />,
				});
			},
			sendChangeEmailConfirmation: async ({ newEmail, url }) => {
				await resend.emails.send({
					from,
					to: [newEmail],
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
			onCheckoutSessionCompleted: async (session: Stripe.Checkout.Session) => {
				const orderId = session.metadata?.orderId;
				if (orderId && session.id) {
					// payment_intent can be string, PaymentIntent object, or null
					const paymentIntentId =
						typeof session.payment_intent === "string"
							? session.payment_intent
							: null;
					await orderService.handleOrderPaid(
						session.id,
						orderId,
						paymentIntentId,
					);
				}
			},
			onPaymentFailed: async (session: Stripe.Checkout.Session) => {
				const orderId = session.metadata?.orderId;
				if (orderId) {
					await orderService.updateStatus(orderId, "CANCELLED");
				}
			},
		}),
	],
});

export const betterAuthPlugin = new Elysia({
	name: "better-auth",
	tags: ["Auth"],
})
	.mount(auth.handler)
	.macro("user", {
		async resolve({ request: { headers } }) {
			const session = await auth.api.getSession({
				headers,
			});

			if (!session) {
				return { user: null, session: null };
			}

			return session;
		},
	})
	.macro("isLogin", {
		user: true,
		resolve: ({ session, user, status }) => {
			if (!session || !user) return status("Unauthorized");
			return { user, session };
		},
	})
	.macro("isAdmin", {
		isLogin: true,
		resolve: ({ session, user, status }) => {
			if (user.role !== "admin") return status("Unauthorized");
			return { user, session };
		},
	})
	.get("/api/is-admin", ({ session, user }) => ({ session, user }), {
		isAdmin: true,
	});
