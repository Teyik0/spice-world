import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { orderService } from "@spice-world/server/modules/orders/service";
import { auth } from "@spice-world/server/plugins/better-auth.plugin.tsx";
import { createTestDatabase } from "./utils/db-manager";
import { expectDefined, randomLowerString } from "./utils/helper";

describe("Order Service - Stock Validation & Reservation", () => {
	let testDb: Awaited<ReturnType<typeof createTestDatabase>>;
	let normalUser: Awaited<ReturnType<typeof auth.api.createUser>>;
	let testCategory: {
		id: string;
		attributes: Array<{ id: string; values: Array<{ id: string }> }>;
	};

	beforeAll(async () => {
		if (Bun.env.NODE_ENV === "production") {
			throw new Error("You can't run tests in production");
		}
		if (!Bun.env.DATABASE_URL) {
			throw new Error("DATABASE_URL should be set");
		}
		testDb = await createTestDatabase("orders.stock.test.ts");

		normalUser = await auth.api.createUser({
			body: {
				email: `stock-test-${randomLowerString(6)}@example.com`,
				password: "password",
				name: "Stock Test User",
				role: "user",
			},
		});

		await testDb.client.user.update({
			where: { id: normalUser.user.id },
			data: { emailVerified: true },
		});

		// Create test category
		testCategory = await testDb.client.category.create({
			data: {
				name: "Stock Test Category",
				image: {
					create: {
						keyThumb: `thumb-stock-test`,
						keyMedium: `medium-stock-test`,
						keyLarge: `large-stock-test`,
						urlThumb: "https://example.com/thumb.webp",
						urlMedium: "https://example.com/medium.webp",
						urlLarge: "https://example.com/large.webp",
						altText: "Stock test category image",
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
	});

	afterAll(async () => {
		await testDb.destroy();
	});

	describe("createCheckout stock reservation", () => {
		test("should reserve stock successfully when sufficient stock exists", async () => {
			const testId = randomLowerString(8);

			// Create product with initial stock of 10
			const product = await testDb.client.product.create({
				data: {
					name: `Stock Test Product ${testId}`,
					slug: `stock-test-product-${testId}`,
					description: "Test product for stock validation",
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
							price: 1099, // €10.99 in cents
							currency: "EUR",
							stock: 10,
							sku: `STOCK-TEST-${testId}`,
						},
					},
				},
				include: {
					variants: true,
				},
			});

			expectDefined(product.variants[0]);
			const variantId = product.variants[0].id;

			// Create checkout - should reserve stock immediately
			const result = await orderService.createCheckout(
				normalUser.user.id,
				[{ variantId, quantity: 3 }],
				{
					name: "Test User",
					line1: "123 Test St",
					city: "Test City",
					postalCode: "12345",
					country: "FR",
				},
			);

			expect(result.order.status).toBe("PENDING");
			expect(result).toHaveProperty("checkoutUrl");

			// Verify stock was reserved (decremented)
			const updatedVariant = await testDb.client.productVariant.findUnique({
				where: { id: variantId },
			});

			expectDefined(updatedVariant);
			expect(updatedVariant.stock).toBe(7); // 10 - 3 = 7
		});

		test("should throw error when stock is insufficient", async () => {
			const testId = randomLowerString(8);

			// Create product with low stock of 2
			const product = await testDb.client.product.create({
				data: {
					name: `Stock Test Product Low ${testId}`,
					slug: `stock-test-product-low-${testId}`,
					description: "Test product for stock validation - low stock",
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
							price: 1099, // €10.99 in cents
							currency: "EUR",
							stock: 2,
							sku: `STOCK-TEST-LOW-${testId}`,
						},
					},
				},
				include: {
					variants: true,
				},
			});

			expectDefined(product.variants[0]);
			const variantId = product.variants[0].id;

			// Attempt checkout with quantity 5 (more than available stock of 2)
			expect(
				orderService.createCheckout(
					normalUser.user.id,
					[{ variantId, quantity: 5 }],
					{
						name: "Test User",
						line1: "123 Test St",
						city: "Test City",
						postalCode: "12345",
						country: "FR",
					},
				),
			).rejects.toMatchObject({
				message: expect.stringContaining("Insufficient stock"),
			});

			// Verify stock was NOT reserved (transaction rolled back)
			const unchangedVariant = await testDb.client.productVariant.findUnique({
				where: { id: variantId },
			});

			expectDefined(unchangedVariant);
			expect(unchangedVariant.stock).toBe(2); // Stock should remain unchanged
		});

		test("should throw error when variant does not exist", async () => {
			const nonExistentVariantId = crypto.randomUUID();

			// Attempt checkout with non-existent variant
			expect(
				orderService.createCheckout(
					normalUser.user.id,
					[{ variantId: nonExistentVariantId, quantity: 1 }],
					{
						name: "Test User",
						line1: "123 Test St",
						city: "Test City",
						postalCode: "12345",
						country: "FR",
					},
				),
			).rejects.toMatchObject({
				message: expect.stringContaining("Insufficient stock"),
			});
		});

		test("should handle multiple items atomically - partial stock failure", async () => {
			const testId = randomLowerString(8);

			// Create two products
			const product1 = await testDb.client.product.create({
				data: {
					name: `Multi Stock Product 1 ${testId}`,
					slug: `multi-stock-product-1-${testId}`,
					description: "Test product 1",
					status: "PUBLISHED",
					categoryId: testCategory.id,
					images: {
						create: {
							keyThumb: `thumb-1-${testId}`,
							keyMedium: `medium-1-${testId}`,
							keyLarge: `large-1-${testId}`,
							urlThumb: "https://example.com/thumb.webp",
							urlMedium: "https://example.com/medium.webp",
							urlLarge: "https://example.com/large.webp",
							altText: "Test 1",
							isThumbnail: true,
						},
					},
					variants: {
						create: {
							price: 1000, // €10.00 in cents
							currency: "EUR",
							stock: 5,
							sku: `MULTI-1-${testId}`,
						},
					},
				},
				include: {
					variants: true,
				},
			});

			const product2 = await testDb.client.product.create({
				data: {
					name: `Multi Stock Product 2 ${testId}`,
					slug: `multi-stock-product-2-${testId}`,
					description: "Test product 2",
					status: "PUBLISHED",
					categoryId: testCategory.id,
					images: {
						create: {
							keyThumb: `thumb-2-${testId}`,
							keyMedium: `medium-2-${testId}`,
							keyLarge: `large-2-${testId}`,
							urlThumb: "https://example.com/thumb.webp",
							urlMedium: "https://example.com/medium.webp",
							urlLarge: "https://example.com/large.webp",
							altText: "Test 2",
							isThumbnail: true,
						},
					},
					variants: {
						create: {
							price: 1500, // €15.00 in cents
							currency: "EUR",
							stock: 1, // Only 1 in stock
							sku: `MULTI-2-${testId}`,
						},
					},
				},
				include: {
					variants: true,
				},
			});

			expectDefined(product1.variants[0]);
			expectDefined(product2.variants[0]);

			// Attempt checkout with items from both products
			// Item 1: quantity 3 (sufficient stock - 5 available)
			// Item 2: quantity 3 (insufficient stock - only 1 available)
			expect(
				orderService.createCheckout(
					normalUser.user.id,
					[
						{ variantId: product1.variants[0].id, quantity: 3 },
						{ variantId: product2.variants[0].id, quantity: 3 }, // Insufficient!
					],
					{
						name: "Test User",
						line1: "123 Test St",
						city: "Test City",
						postalCode: "12345",
						country: "FR",
					},
				),
			).rejects.toMatchObject({
				message: expect.stringContaining("Insufficient stock"),
			});

			// Verify both stocks were NOT reserved (atomic transaction - all or nothing)
			const unchangedVariant1 = await testDb.client.productVariant.findUnique({
				where: { id: product1.variants[0].id },
			});
			const unchangedVariant2 = await testDb.client.productVariant.findUnique({
				where: { id: product2.variants[0].id },
			});

			expectDefined(unchangedVariant1);
			expectDefined(unchangedVariant2);
			expect(unchangedVariant1.stock).toBe(5); // Should remain unchanged
			expect(unchangedVariant2.stock).toBe(1); // Should remain unchanged
		});
	});

	describe("handleOrderPaid", () => {
		test("should mark order as PAID without decrementing stock", async () => {
			const testId = randomLowerString(8);

			// Create product with stock
			const product = await testDb.client.product.create({
				data: {
					name: `Paid Test Product ${testId}`,
					slug: `paid-test-product-${testId}`,
					description: "Test product for handleOrderPaid",
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
							price: 1099, // €10.99 in cents
							currency: "EUR",
							stock: 10,
							sku: `PAID-TEST-${testId}`,
						},
					},
				},
				include: {
					variants: true,
				},
			});

			expectDefined(product.variants[0]);
			const variantId = product.variants[0].id;

			// First create checkout to reserve stock
			const checkout = await orderService.createCheckout(
				normalUser.user.id,
				[{ variantId, quantity: 2 }],
				{
					name: "Test User",
					line1: "123 Test St",
					city: "Test City",
					postalCode: "12345",
					country: "FR",
				},
			);

			// Stock should now be 8 (reserved)
			const variantAfterCheckout =
				await testDb.client.productVariant.findUnique({
					where: { id: variantId },
				});
			expectDefined(variantAfterCheckout);
			expect(variantAfterCheckout.stock).toBe(8);

			// Now call handleOrderPaid
			const result = await orderService.handleOrderPaid(
				checkout.order.stripeSessionId,
				checkout.order.id,
				"pi_test_123",
			);

			expect(result.status).toBe("PAID");

			// Stock should remain 8 (already reserved, not decremented again)
			const variantAfterPayment = await testDb.client.productVariant.findUnique(
				{
					where: { id: variantId },
				},
			);
			expectDefined(variantAfterPayment);
			expect(variantAfterPayment.stock).toBe(8); // Should still be 8
		});
	});
});
