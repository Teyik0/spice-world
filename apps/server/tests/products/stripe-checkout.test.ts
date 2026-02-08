import { afterAll, beforeAll, describe, expect, it, spyOn } from "bun:test";
import { treaty } from "@elysiajs/eden";
import type { ordersRouter } from "@spice-world/server/modules/orders";
import type { productsRouter } from "@spice-world/server/modules/products";
import * as stripeCheckoutModule from "@spice-world/server/modules/stripe-checkout";
import { file } from "bun";
import { createTestDatabase } from "../utils/db-manager";
import { createSetupProduct, expectDefined, mockUtapi } from "../utils/helper";

const filePath1 = `${import.meta.dir}/../public/cumin.webp`;

describe("Stripe Checkout", () => {
	let testDb: Awaited<ReturnType<typeof createTestDatabase>>;
	let productsApi: ReturnType<typeof treaty<typeof productsRouter>>;
	let ordersApi: ReturnType<typeof treaty<typeof ordersRouter>>;
	let userCookie: string;
	let createStripeCheckoutMock: ReturnType<typeof spyOn>;

	beforeAll(async () => {
		// Mock uploadthing BEFORE importing the router
		await mockUtapi();

		testDb = await createTestDatabase("stripe-checkout.test.ts");

		// Mock Stripe Checkout function
		createStripeCheckoutMock = spyOn(
			stripeCheckoutModule,
			"createStripeCheckout",
		).mockImplementation(async () => {
			const mockSessionId = `mock_checkout_${Date.now()}_${Math.random().toString(36).slice(2)}`;
			return {
				id: mockSessionId,
				url: `https://mock-stripe.checkout.url/${mockSessionId}`,
				status: "open" as const,
			};
		});

		// Import auth after setting up mocks but before using it
		const { auth } = await import(
			"@spice-world/server/plugins/better-auth.plugin.tsx"
		);

		// Create test user for authenticated requests
		const testUser = await auth.api.createUser({
			body: {
				email: "stripe-test@spiceworld.test",
				password: "password123",
				name: "Stripe Test User",
				role: "user",
			},
		});
		await testDb.client.user.update({
			where: { id: testUser.user.id },
			data: { emailVerified: true },
		});

		// Sign in to get cookie
		const signInResp = await auth.api.signInEmail({
			body: {
				email: "stripe-test@spiceworld.test",
				password: "password123",
			},
			returnHeaders: true,
		});
		const setCookie = signInResp.headers.get("set-cookie");
		userCookie = setCookie?.split(";")[0] || "";

		const { productsRouter } = await import(
			"@spice-world/server/modules/products"
		);
		const { ordersRouter } = await import("@spice-world/server/modules/orders");

		productsApi = treaty(productsRouter);
		ordersApi = treaty(ordersRouter);
	});

	afterAll(async () => {
		// Restore Stripe Checkout mock if it was created
		createStripeCheckoutMock?.mockRestore();

		await testDb.destroy();
	}, 10000);

	describe("POST /orders/checkout", () => {
		it("should succeed checkout validation without polarProductId requirement", async () => {
			const setupProduct = createSetupProduct(testDb, productsApi);

			// Create a DRAFT product - with Stripe, no product sync is needed
			const { product } = await setupProduct({
				attributeCount: 1,
				attributeValueCount: 2,
				variants: [
					{
						price: 10,
						sku: "NO-SYNC-NEEDED-001",
						stock: 5,
						attributeValueIds: [],
					},
				],
				imagesCreate: [{ isThumbnail: true, file: file(filePath1) }],
			});

			const variant = product.variants[0];
			expectDefined(variant);

			// With Stripe, checkout should work without polarProductId
			// Validation should pass (checkout flow uses inline Stripe checkout)
			const { status } = await ordersApi.orders.checkout.post(
				{
					items: [
						{
							variantId: variant.id,
							quantity: 1,
						},
					],
					shippingAddress: {
						name: "Test User",
						line1: "123 Test Street",
						city: "Test City",
						postalCode: "12345",
						country: "FR",
					},
				},
				{
					headers: {
						cookie: userCookie,
					},
				},
			);

			// Should pass validation with Stripe (no polarProductId requirement)
			expect(status).not.toBe(400);
		});

		it("should create checkout session with Stripe", async () => {
			const setupProduct = createSetupProduct(testDb, productsApi);

			// Create a product
			const { product } = await setupProduct({
				attributeCount: 1,
				attributeValueCount: 2,
				variants: [
					{
						price: 10,
						sku: "STRIPE-TEST-001",
						stock: 5,
						attributeValueIds: [],
					},
				],
				imagesCreate: [{ isThumbnail: true, file: file(filePath1) }],
			});

			const variant = product.variants[0];
			expectDefined(variant);

			// Checkout should create a Stripe session
			const { data, status } = await ordersApi.orders.checkout.post(
				{
					items: [
						{
							variantId: variant.id,
							quantity: 1,
						},
					],
					shippingAddress: {
						name: "Test User",
						line1: "123 Test Street",
						city: "Test City",
						postalCode: "12345",
						country: "FR",
					},
				},
				{
					headers: {
						cookie: userCookie,
					},
				},
			);

			expect(status).toBe(201);
			expectDefined(data);
			expect(data).toHaveProperty("checkoutUrl");
			expect(data).toMatchObject({
				checkoutUrl: expect.stringContaining("mock-stripe.checkout.url"),
			});
			expect(data).toHaveProperty("order");
		});
	});
});
