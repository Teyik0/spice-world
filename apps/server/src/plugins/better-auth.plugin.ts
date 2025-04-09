import { betterAuth } from "better-auth";
import { prismaAdapter } from "better-auth/adapters/prisma";
import { openAPI } from "better-auth/plugins";
import { admin } from "better-auth/plugins";
import Elysia from "elysia";
import prisma from "../lib/prisma";

export const auth = betterAuth({
	database: prismaAdapter(prisma, {
		provider: "postgresql",
	}),
	emailAndPassword: {
		enabled: true,
		requireEmailVerification: true,
		sendResetPassword: async ({ user, url, token }, request) => {
			await sendEmail({
				to: user.email,
				subject: "Reset your password",
				text: `Click the link to reset your password: ${url}`,
			});
		},
	},
	emailVerification: {
		sendOnSignUp: true,
		sendVerificationEmail: async ({ user, url, token }, request) => {
			await sendEmail({
				to: user.email,
				subject: "Verify your email address",
				text: `Click the link to verify your email: ${url}`,
			});
		},
		autoSignInAfterVerification: true,
	},
	socialProviders: {
		google: {
			clientId: process.env.GOOGLE_CLIENT_ID as string,
			clientSecret: process.env.GOOGLE_CLIENT_SECRET as string,
		},
	},
	user: {
		changeEmail: {
			enabled: true,
			sendChangeEmailVerification: async (
				{ user, newEmail, url, token },
				request,
			) => {
				await sendEmail({
					to: user.email, // verification email must be sent to the current user email to approve the change
					subject: "Approve email change",
					text: `Click the link to approve the change: ${url}`,
				});
			},
		},
	},
	session: {
		expiresIn: 60 * 60 * 24 * 7, // 7 days
		updateAge: 60 * 60 * 24, // 1 day (every 1 day the session expiration is updated)
	},
	plugins: [openAPI(), admin()],
});

export const openAPISchema = await auth.api.generateOpenAPISchema();

export const betterAuthPlugin = new Elysia({
	name: "better-auth",
})
	.mount(auth.handler)
	.macro({
		auth: {
			async resolve({ error, request: { headers } }) {
				const session = await auth.api.getSession({
					headers,
				});

				if (!session) return error(401);

				return {
					user: session.user,
					session: session.session,
				};
			},
		},
	});

// TODO: Implement email sending functionality
const sendEmail = async ({
	to,
	subject,
	text,
}: { to: string; subject: string; text: string }) => {
	await sendEmail({
		to,
		subject,
		text,
	});
};
