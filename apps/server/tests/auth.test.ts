import { afterAll, beforeAll, describe, expect, it, spyOn } from "bun:test";
import { treaty } from "@elysiajs/eden";
import { auth, betterAuthPlugin } from "../src/plugins/better-auth.plugin";
import { resetDb } from "./utils/reset-db";

const api = treaty(betterAuthPlugin);

type Session = typeof auth.$Infer.Session;

describe("BetterAuth Plugin Tests", () => {
	let adminUser: Session;
	let normalUser: Session;

	beforeAll(async () => {
		if (process.env.NODE_ENV === "production") {
			throw new Error("You can't run tests in production");
		}
		if (!process.env.DATABASE_URL) {
			throw new Error("DATABASE_URL should be set");
		}

		const session = {
			id: "admin-session",
			createdAt: new Date(),
			updatedAt: new Date(),
			userId: "admin-user",
			expiresAt: new Date(Date.now() + 3600 * 1000),
			token: "admin-token",
			ipAddress: null,
			userAgent: null,
			impersonatedBy: null,
		};
		const user = {
			id: "admin-user",
			name: "Admin User",
			email: "admin@example.com",
			emailVerified: true,
			createdAt: new Date(),
			updatedAt: new Date(),
			image: null,
			banned: null,
			role: "admin",
			banReason: null,
			banExpires: null,
		};
		adminUser = { user, session };
		normalUser = {
			user: {
				...user,
				id: "normal-user",
				name: "Normal User",
				email: "normal@example.com",
				role: "user",
			},
			session: {
				...session,
				id: "normal-session",
				userId: "normal-user",
				token: "normal-token",
				ipAddress: null,
				userAgent: null,
				impersonatedBy: null,
			},
		};

		await resetDb();
	});

	afterAll(async () => {
		await resetDb();
	});

	describe("Initialization", () => {
		it("should initialize betterAuth with correct configuration", () => {
			expect(auth).toBeDefined();
			expect(auth.api).toBeDefined();
			expect(auth.handler).toBeDefined();
		});
	});

	describe("Macro Resolvers", () => {
		it("should resolve user macro correctly for valid session", async () => {
			spyOn(auth.api, "getSession").mockResolvedValueOnce(normalUser);

			const { data, status } = await api.api.user.get({
				headers: { Authorization: `Bearer ${normalUser.session.token}` },
			});

			expect(status).toBe(200);
			expect(data).not.toBe(null);
			const userData = data as NonNullable<typeof data>;
			expect(userData).toEqual({
				session: {
					...normalUser.session,
					createdAt: expect.any(String),
					updatedAt: expect.any(String),
					expiresAt: expect.any(String),
				},
				user: {
					...normalUser.user,
					createdAt: expect.any(String),
					updatedAt: expect.any(String),
				},
			});
		});

		it("should return user null for user macro when no session exists", async () => {
			spyOn(auth.api, "getSession").mockResolvedValueOnce(null);

			const { status, data } = await api.api.user.get({
				headers: { Authorization: "Bearer invalid-token" },
			});

			expect(status).toBe(200);
			expect(data).toEqual({
				user: null,
				session: null,
			});
		});

		it("should resolve isAdmin macro correctly for admin user", async () => {
			spyOn(auth.api, "getSession").mockResolvedValueOnce(adminUser);

			const { data, status } = await api.api["is-admin"].get({
				headers: { Authorization: "Bearer admin-token" },
			});

			expect(status).toBe(200);
			expect(data).not.toBe(null);
			const userData = data as NonNullable<typeof data>;
			expect(userData).toEqual({
				session: {
					...adminUser.session,
					createdAt: expect.any(String),
					updatedAt: expect.any(String),
					expiresAt: expect.any(String),
				},
				user: {
					...adminUser.user,
					createdAt: expect.any(String),
					updatedAt: expect.any(String),
				},
			});
		});

		it("should return error for isAdmin macro when user is not admin", async () => {
			spyOn(auth.api, "getSession").mockResolvedValueOnce(normalUser);

			const { status, error } = await api.api["is-admin"].get({
				headers: { Authorization: "Bearer normal-token" },
			});

			expect(status).toBe(401);
			expect(error).toBeDefined();
			expect(error?.value).toBe("Unauthorized");
		});
	});

	describe("Email Sending", () => {
		it("should send reset password email correctly", async () => {
			const sendEmailMock = spyOn(
				auth.options.emailAndPassword,
				"sendResetPassword",
			);

			const userResetPassword = {
				id: normalUser.user.id,
				name: "John Doe",
				email: "test@example.com",
				emailVerified: false,
				createdAt: new Date(),
				updatedAt: new Date(),
				image: null,
			};

			await auth.options.emailAndPassword.sendResetPassword({
				user: userResetPassword,
				url: "http://example.com/reset-password",
				token: "token",
			});

			expect(sendEmailMock).toHaveBeenCalledWith({
				user: userResetPassword,
				url: "http://example.com/reset-password",
				token: "token",
			});
		});

		it("should send change email verification correctly", async () => {
			const sendEmailMock = spyOn(
				auth.options.user.changeEmail,
				"sendChangeEmailVerification",
			);

			const userChangeEmail = {
				id: normalUser.user.id,
				name: "John Doe",
				email: "test@example.com",
				emailVerified: false,
				createdAt: new Date(),
				updatedAt: new Date(),
				image: null,
			};

			await auth.options.user.changeEmail.sendChangeEmailVerification({
				user: userChangeEmail,
				newEmail: "newEmail@example.com",
				token: "token",
				url: "http://example.com/change-email",
			});

			expect(sendEmailMock).toHaveBeenCalledWith({
				user: userChangeEmail,
				newEmail: "newEmail@example.com",
				url: "http://example.com/change-email",
				token: "token",
			});
		});

		it("should send email verification correctly", async () => {
			const sendEmailMock = spyOn(
				auth.options.emailVerification,
				"sendVerificationEmail",
			);

			const userWelcome = {
				id: normalUser.user.id,
				name: "John Doe",
				email: "test@example.com",
				emailVerified: false,
				createdAt: new Date(),
				updatedAt: new Date(),
				image: null,
			};

			await auth.options.emailVerification.sendVerificationEmail({
				user: userWelcome,
				url: "http://example.com/verify-email",
				token: "token",
			});

			expect(sendEmailMock).toHaveBeenCalledWith({
				user: userWelcome,
				url: "http://example.com/verify-email",
				token: "token",
			});
		});
	});

	describe("Social Providers", () => {
		it("should configure Google social provider correctly", () => {
			expect(auth.options.socialProviders.google).toBeDefined();
			expect(auth.options.socialProviders.google.clientId).toBe(
				process.env.GOOGLE_CLIENT_ID as string,
			);
			expect(auth.options.socialProviders.google.clientSecret).toBe(
				process.env.GOOGLE_CLIENT_SECRET as string,
			);
		});
	});
});
