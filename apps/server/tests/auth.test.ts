import { afterAll, beforeAll, describe, expect, spyOn, test } from "bun:test";
import { auth } from "../src/plugins/better-auth.plugin";
import { createTestDatabase } from "./utils/db-manager";

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

		normalUser = await auth.api.createUser({
			body: {
				email: "user@example.com",
				password: "password",
				name: "John Doe",
				role: "user",
			},
		});
		adminUser = await auth.api.createUser({
			body: {
				email: "admin@example.com",
				password: "password",
				name: "Admin Doe",
				role: "admin",
			},
		});
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
	});
});
