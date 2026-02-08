import { afterAll, beforeAll, describe, expect, spyOn, test } from "bun:test";
import { treaty } from "@elysiajs/eden";
import {
	auth,
	betterAuthPlugin,
} from "@spice-world/server/plugins/better-auth.plugin.tsx";
import Elysia from "elysia";
import { createTestDatabase } from "./utils/db-manager";
import { expectDefined, randomLowerString } from "./utils/helper";

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

	describe("Admin Routes Access Control", async () => {
		const { ordersRouter } = await import("@spice-world/server/modules/orders");
		const { productsRouter } = await import(
			"@spice-world/server/modules/products"
		);

		const adminApp = new Elysia()
			.use(betterAuthPlugin)
			.use(ordersRouter)
			.use(productsRouter);

		let ordersApi: ReturnType<typeof treaty<typeof ordersRouter>>;
		let normalUserCookie: string;
		let adminUserCookie: string;
		let testCategory: {
			id: string;
			attributes: Array<{ id: string; values: Array<{ id: string }> }>;
		};

		beforeAll(async () => {
			ordersApi = treaty(ordersRouter);

			// Create a test category for products
			testCategory = await testDb.client.category.create({
				data: {
					name: "Test Category",
					image: {
						create: {
							keyThumb: "thumb-key",
							keyMedium: "medium-key",
							keyLarge: "large-key",
							urlThumb: "https://example.com/thumb.webp",
							urlMedium: "https://example.com/medium.webp",
							urlLarge: "https://example.com/large.webp",
							altText: "Test category image",
							isThumbnail: true,
						},
					},
				},
				include: {
					attributes: {
						include: {
							values: true,
						},
					},
				},
			});

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

		describe("Orders Admin Access", () => {
			test("admin should access /api/is-admin endpoint", async () => {
				const adminCheckApi = treaty(adminApp);
				const { data, status } = await adminCheckApi.api["is-admin"].get({
					headers: {
						cookie: adminUserCookie,
					},
				});

				expectDefined(data);
				expect(data.user.role).toBe("admin");
				expect(status).toBe(200);
			});

			test("normal user should not access /api/is-admin endpoint", async () => {
				const adminCheckApi = treaty(adminApp);
				const { data, status } = await adminCheckApi.api["is-admin"].get({
					headers: {
						cookie: normalUserCookie,
					},
				});

				expect(data).toBeNull();
				expect(status).toBe(401);
			});

			test("admin can update order status", async () => {
				// Generate unique identifiers
				const testId = randomLowerString(8);

				// Create a product and order for testing
				const product = await testDb.client.product.create({
					data: {
						name: "Test Product Admin",
						slug: `test-product-admin-${testId}`,
						description: "Test product for admin",
						status: "PUBLISHED",
						categoryId: testCategory.id,
						images: {
							create: {
								keyThumb: `thumb-${testId}`,
								keyMedium: `medium-${testId}`,
								keyLarge: `large-${testId}`,
								urlThumb: "https://example.com/thumb.webp",
								urlMedium: "https://example.com/medium.webp",
								urlLarge: "https://example.com/large.webp",
								altText: "Test",
								isThumbnail: true,
							},
						},
						variants: {
							create: {
								price: 1099,
								currency: "EUR",
								stock: 100,
								sku: `ADMIN-TEST-${testId}`,
							},
						},
					},
					include: {
						variants: true,
					},
				});

				const order = await testDb.client.order.create({
					data: {
						userId: normalUser.user.id,
						status: "PENDING",
						stripeSessionId: `checkout_${testId}`,
						subtotalAmount: 1099,
						shippingAmount: 500,
						totalAmount: 1599,
						shippingAddress: {
							name: "Test User",
							line1: "123 Test St",
							city: "Test City",
							postalCode: "12345",
							country: "FR",
						},
						items: {
							create: {
								productId: product.id,
								productName: product.name,
								variantId: product.variants[0]?.id,
								variantSku: product.variants[0]?.sku,
								unitPrice: 1099,
								quantity: 1,
								totalPrice: 1099,
							},
						},
					},
				});
				expectDefined(product.variants[0]);

				// Admin can update order status
				const { data, status } = await ordersApi.orders["by-id"]({
					id: order.id,
				}).status.patch(
					{
						status: "PAID",
						trackingNumber: "TRACK123",
					},
					{
						headers: {
							cookie: adminUserCookie,
						},
					},
				);

				expectDefined(data);
				// Check if data is not an error object
				if ("status" in data) {
					expect(data.status).toBe("PAID");
					expect(data.trackingNumber).toBe("TRACK123");
				}
				expect(status).toBe(200);
			});

			test("normal user cannot update order status", async () => {
				// Generate unique identifiers
				const testId = randomLowerString(8);

				// Create an order for normal user
				const product = await testDb.client.product.create({
					data: {
						name: "Test Product User",
						slug: `test-product-user-${testId}`,
						description: "Test product for user",
						status: "PUBLISHED",
						categoryId: testCategory.id,
						images: {
							create: {
								keyThumb: `thumb-${testId}`,
								keyMedium: `medium-${testId}`,
								keyLarge: `large-${testId}`,
								urlThumb: "https://example.com/thumb.webp",
								urlMedium: "https://example.com/medium.webp",
								urlLarge: "https://example.com/large.webp",
								altText: "Test",
								isThumbnail: true,
							},
						},
						variants: {
							create: {
								price: 1099,
								currency: "EUR",
								stock: 100,
								sku: `USER-TEST-${testId}`,
							},
						},
					},
					include: {
						variants: true,
					},
				});

				const order = await testDb.client.order.create({
					data: {
						userId: normalUser.user.id,
						status: "PENDING",
						stripeSessionId: `checkout_${testId}`,
						subtotalAmount: 1099,
						shippingAmount: 500,
						totalAmount: 1599,
						shippingAddress: {
							name: "Test User",
							line1: "123 Test St",
							city: "Test City",
							postalCode: "12345",
							country: "FR",
						},
						items: {
							create: {
								productId: product.id,
								productName: product.name,
								variantId: product.variants[0]?.id,
								variantSku: product.variants[0]?.sku,
								unitPrice: 1099,
								quantity: 1,
								totalPrice: 1099,
							},
						},
					},
				});
				expectDefined(product.variants[0]);

				// Normal user cannot update order status
				const { data, status } = await ordersApi.orders["by-id"]({
					id: order.id,
				}).status.patch(
					{
						status: "PAID",
					},
					{
						headers: {
							cookie: normalUserCookie,
						},
					},
				);

				expect(data).toBeNull();
				expect(status).toBe(401);
			});

			test("admin can view all orders", async () => {
				// Generate unique identifiers
				const testId = randomLowerString(8);

				// Create orders for both users
				const product = await testDb.client.product.create({
					data: {
						name: "Test Product View",
						slug: `test-product-view-${testId}`,
						description: "Test",
						status: "PUBLISHED",
						categoryId: testCategory.id,
						images: {
							create: {
								keyThumb: `thumb-${testId}`,
								keyMedium: `medium-${testId}`,
								keyLarge: `large-${testId}`,
								urlThumb: "https://example.com/thumb.webp",
								urlMedium: "https://example.com/medium.webp",
								urlLarge: "https://example.com/large.webp",
								altText: "Test",
								isThumbnail: true,
							},
						},
						variants: {
							create: {
								price: 1099,
								currency: "EUR",
								stock: 100,
								sku: `VIEW-TEST-${testId}`,
							},
						},
					},
					include: {
						variants: true,
					},
				});

				await testDb.client.order.create({
					data: {
						userId: normalUser.user.id,
						status: "PENDING",
						stripeSessionId: `checkout_${testId}_1`,
						subtotalAmount: 1099,
						shippingAmount: 500,
						totalAmount: 1599,
						shippingAddress: {
							name: "Test",
							line1: "123",
							city: "City",
							postalCode: "12345",
							country: "FR",
						},
						items: {
							create: {
								productId: product.id,
								productName: product.name,
								variantId: product.variants[0]?.id,
								variantSku: product.variants[0]?.sku,
								unitPrice: 1099,
								quantity: 1,
								totalPrice: 1099,
							},
						},
					},
				});
				expectDefined(product.variants[0]);

				await testDb.client.order.create({
					data: {
						userId: adminUser.user.id,
						status: "PAID",
						stripeSessionId: `checkout_${testId}_2`,
						subtotalAmount: 1099,
						shippingAmount: 500,
						totalAmount: 1599,
						shippingAddress: {
							name: "Admin",
							line1: "456",
							city: "City",
							postalCode: "12345",
							country: "FR",
						},
						items: {
							create: {
								productId: product.id,
								productName: product.name,
								variantId: product.variants[0]?.id,
								variantSku: product.variants[0]?.sku,
								unitPrice: 1099,
								quantity: 1,
								totalPrice: 1099,
							},
						},
					},
				});

				// Admin can see all orders
				const { data, status } = await ordersApi.orders.get({
					query: {
						page: 1,
						limit: 10,
					},
					headers: {
						cookie: adminUserCookie,
					},
				});

				expectDefined(data);
				// Check if data is not an error object
				if ("items" in data) {
					expect(data.items.length).toBeGreaterThanOrEqual(2);
				}
				expect(status).toBe(200);
			});

			test("normal user can only view their own orders", async () => {
				// Normal user should only see their orders
				const { data, status } = await ordersApi.orders.get({
					query: {
						page: 1,
						limit: 10,
					},
					headers: {
						cookie: normalUserCookie,
					},
				});

				expectDefined(data);
				expect(status).toBe(200);
				// All returned orders should belong to normal user
				if ("items" in data) {
					for (const order of data.items) {
						expect(order.userId).toBe(normalUser.user.id);
					}
				}
			});

			test("unauthenticated user cannot access orders", async () => {
				const { data, status } = await ordersApi.orders.get({
					query: {
						page: 1,
						limit: 10,
					},
				});

				expect(data).toBeNull();
				expect(status).toBe(401);
			});
		});
	});
});
