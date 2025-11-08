import { afterAll, beforeAll, describe, expect, spyOn, test } from "bun:test";
import { treaty } from "@elysiajs/eden";
import Elysia from "elysia";
import { auth, betterAuthPlugin } from "../src/plugins/better-auth.plugin.tsx";
import { createTestDatabase } from "./utils/db-manager";
import { expectDefined } from "./utils/helper";

describe.concurrent("BetterAuth Plugin Tests", () => {
	let adminUser: Awaited<ReturnType<typeof auth.api.createUser>>;
	let normalUser: Awaited<ReturnType<typeof auth.api.createUser>>;
	let testDb: Awaited<ReturnType<typeof createTestDatabase>>;

	beforeAll(async () => {
		if (Bun.env.NODE_ENV === "production") {
			throw new Error("You can't run tests in production");
		}
		if (!Bun.env.DATABASE_URL) {
			throw new Error("DATABASE_URL should be set");
		}
		testDb = await createTestDatabase("auth.test.ts");

		[normalUser, adminUser] = await Promise.all([
			auth.api.createUser({
				body: {
					email: "user@example.com",
					password: "password",
					name: "John Doe",
					role: "user",
				},
			}),
			auth.api.createUser({
				body: {
					email: "admin@example.com",
					password: "password",
					name: "Admin Doe",
					role: "admin",
				},
			}),
		]);
		await Promise.all([
			testDb.client.user.update({
				where: {
					id: normalUser.user.id,
				},
				data: {
					emailVerified: true,
				},
			}),
			testDb.client.user.update({
				where: {
					id: adminUser.user.id,
				},
				data: {
					emailVerified: true,
				},
			}),
		]);
	});

	afterAll(async () => {
		await testDb.destroy();
	});

	describe("Initialization", () => {
		test("should initialize betterAuth with correct configuration", () => {
			expect(auth).toBeDefined();
			expect(auth.api).toBeDefined();
			expect(auth.handler).toBeDefined();
		});
	});

	describe("Email Sending", () => {
		test("should send reset password email correctly", async () => {
			const sendEmailMock = spyOn(
				auth.options.emailAndPassword,
				"sendResetPassword",
			);

			await auth.options.emailAndPassword.sendResetPassword({
				user: normalUser.user,
				url: "http://example.com/reset-password",
				token: "token",
			});

			expect(sendEmailMock).toHaveBeenCalledWith({
				user: normalUser.user,
				url: "http://example.com/reset-password",
				token: "token",
			});
		});

		test("should send verification email correctly", async () => {
			const sendEmailMock = spyOn(
				auth.options.emailVerification,
				"sendVerificationEmail",
			);

			await auth.options.emailVerification.sendVerificationEmail({
				user: normalUser.user,
				url: "http://example.com/reset-password",
				token: "token",
			});

			expect(sendEmailMock).toHaveBeenCalledWith({
				user: normalUser.user,
				url: "http://example.com/reset-password",
				token: "token",
			});
		});

		test("should send change email verification correctly", async () => {
			const sendEmailMock = spyOn(
				auth.options.user.changeEmail,
				"sendChangeEmailVerification",
			);

			await auth.options.user.changeEmail.sendChangeEmailVerification({
				user: adminUser.user,
				newEmail: "newEmail@example.com",
				token: "token",
				url: "http://example.com/change-email",
			});

			expect(sendEmailMock).toHaveBeenCalledWith({
				user: adminUser.user,
				newEmail: "newEmail@example.com",
				url: "http://example.com/change-email",
				token: "token",
			});
		});

		test("should send password reset correctly", async () => {
			const sendEmailMock = spyOn(
				auth.options.emailAndPassword,
				"onPasswordReset",
			);

			await auth.options.emailAndPassword.onPasswordReset({
				user: adminUser.user,
			});

			expect(sendEmailMock).toHaveBeenCalledWith({
				user: adminUser.user,
			});
		});
	});

	describe("Macros testing", async () => {
		const app = new Elysia()
			.use(betterAuthPlugin)
			.get("/", async ({ user }) => user, { user: true })
			.get("/admin", async ({ user }) => user, { isAdmin: true })
			.get("/login", async ({ user }) => user, { isLogin: true });
		let api: ReturnType<typeof treaty<typeof app>>;
		let normalUserCookie: string;
		let adminUserCookie: string;

		beforeAll(async () => {
			api = treaty(app);
			const [normalUserResp, adminUserResp] = await Promise.all([
				auth.api.signInEmail({
					body: {
						email: normalUser.user.email,
						password: "password",
					},
					returnHeaders: true,
				}),
				auth.api.signInEmail({
					body: {
						email: adminUser.user.email,
						password: "password",
					},
					returnHeaders: true,
				}),
			]);

			const normalUserSetCookie = normalUserResp.headers.get("set-cookie");
			normalUserCookie = normalUserSetCookie?.split(";")[0] || "";

			const adminUserSetCookie = adminUserResp.headers.get("set-cookie");
			adminUserCookie = adminUserSetCookie?.split(";")[0] || "";
		});

		test("should test user macro", async () => {
			const { data, status } = await api.get({
				headers: {
					cookie: normalUserCookie,
				},
			});

			expectDefined(data);
			expect(data.email).toBe(normalUser.user.email);
			expect(status).toBe(200);
		});

		test("should test isLogin macro with authenticated user", async () => {
			const { data, status } = await api.login.get({
				headers: {
					cookie: normalUserCookie,
				},
			});

			expectDefined(data);
			expect(data.email).toBe(normalUser.user.email);
			expect(status).toBe(200);
		});

		test("should test isLogin macro without authentication", async () => {
			const { data, status } = await api.login.get();

			expect(data).toBeNull();
			expect(status).toBe(401);
		});

		test("should test isAdmin macro with admin user", async () => {
			const { data, status } = await api.admin.get({
				headers: {
					cookie: adminUserCookie,
				},
			});

			expectDefined(data);
			expect(data.email).toBe(adminUser.user.email);
			expect(data.role).toBe("admin");
			expect(status).toBe(200);
		});

		test("should test isAdmin macro with normal user (should fail)", async () => {
			const { data, status } = await api.admin.get({
				headers: {
					cookie: normalUserCookie,
				},
			});

			expect(data).toBeNull();
			expect(status).toBe(401);
		});

		test("should test isAdmin macro without authentication", async () => {
			const { data, status } = await api.admin.get();

			expect(data).toBeNull();
			expect(status).toBe(401);
		});
	});
});
