import { ChangeEmailVerification } from "@spice-world/emails/src/change-email-verification";
import { PasswordReset } from "@spice-world/emails/src/password-reset";
import { ResetPassword } from "@spice-world/emails/src/reset-password";
import { VerifyEmail } from "@spice-world/emails/src/spiceworld-welcome";
import { betterAuth } from "better-auth";
import { prismaAdapter } from "better-auth/adapters/prisma";
import { admin, openAPI } from "better-auth/plugins";
import { Elysia } from "elysia";
import { Resend } from "resend";
import { prisma } from "../lib/prisma";

const resend = new Resend(process.env.RESEND_API_KEY);
const from = "Spice World <noreply@teyik0.dev>";

export const auth = betterAuth({
	database: prismaAdapter(prisma, {
		provider: "postgresql",
	}),
	trustedOrigins: ["http://localhost:3000", "http://localhost:3001"], // Both frontend and backend
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
		},
	},
	account: {
		accountLinking: {
			allowDifferentEmails: true,
		},
	},
	socialProviders: {
		google: {
			clientId: process.env.GOOGLE_CLIENT_ID as string,
			clientSecret: process.env.GOOGLE_CLIENT_SECRET as string,
		},
	},
	plugins: [openAPI(), admin()],
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

let _schema: ReturnType<typeof auth.api.generateOpenAPISchema>;
const getSchema = async () => {
	if (!_schema) {
		_schema = auth.api.generateOpenAPISchema();
	}
	return _schema;
};

export const OpenAPI = {
	getPaths: (prefix = "/api/auth") =>
		getSchema().then(({ paths }) => {
			const reference: typeof paths = Object.create(null);

			for (const path of Object.keys(paths)) {
				const key = prefix + path;
				const pathItem = paths[path];

				if (!pathItem) continue;

				reference[key] = pathItem;

				for (const method of Object.keys(pathItem)) {
					// biome-ignore lint/suspicious/noExplicitAny: OpenAPI schema requires dynamic typing
					const operation = (reference[key] as any)[method] as any;

					operation.tags = ["Better Auth"];
				}
			}

			return reference;
			// biome-ignore lint/suspicious/noExplicitAny: OpenAPI schema requires dynamic typing
		}) as Promise<any>,
	// biome-ignore lint/suspicious/noExplicitAny: OpenAPI schema requires dynamic typing
	components: getSchema().then(({ components }) => components) as Promise<any>,
} as const;
