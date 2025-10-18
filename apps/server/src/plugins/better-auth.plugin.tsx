// import { VerifyEmail } from "@spice-world/emails/src/spiceworld-welcome";
import { betterAuth } from "better-auth";
import { prismaAdapter } from "better-auth/adapters/prisma";
import { admin, openAPI } from "better-auth/plugins";
import { Elysia } from "elysia";
import { Resend } from "resend";
import { prisma } from "../lib/prisma";

const resend = new Resend(process.env.RESEND_API_KEY);
const from = "Spice World <theosamarasinghe@gmail.com>";

export const auth = betterAuth({
	database: prismaAdapter(prisma, {
		provider: "postgresql",
	}),
	trustedOrigins: ["http://localhost:5173"],
	emailAndPassword: {
		enabled: true,
		requireEmailVerification: true,
		sendResetPassword: async ({ user }) => {
			await resend.emails.send({
				from,
				to: [user.email],
				subject: "Spice World - Reset your password",
				react: "<VerifyEmail verifyLink={url} />",
			});
		},
	},
	emailVerification: {
		sendOnSignUp: true,
		autoSignInAfterVerification: true,
		sendVerificationEmail: async ({ user }) => {
			await resend.emails.send({
				from,
				to: [user.email],
				subject: "Spice World - Verify your email",
				react: "<VerifyEmail verifyLink={url} />",
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
			sendChangeEmailVerification: async ({ user }) => {
				await resend.emails.send({
					from,
					to: [user.email],
					subject: "Spice World - Verify your email",
					react: "<VerifyEmail verifyLink={url} />",
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
				reference[key] = paths[path];

				for (const method of Object.keys(paths[path])) {
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
