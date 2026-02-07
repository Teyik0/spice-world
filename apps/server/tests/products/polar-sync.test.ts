import { afterAll, beforeAll, describe, expect, it, spyOn } from "bun:test";
import { treaty } from "@elysiajs/eden";
import type { Checkout } from "@polar-sh/sdk/models/components/checkout";
import * as imagesModule from "@spice-world/server/lib/images";
import type { ordersRouter } from "@spice-world/server/modules/orders";
import * as polarSyncModule from "@spice-world/server/modules/polar-sync";
import type { productsRouter } from "@spice-world/server/modules/products";
import { file } from "bun";
import { createTestDatabase } from "../utils/db-manager";
import {
	createSetupProduct,
	createTestCategory,
	createUploadedFileData,
	expectDefined,
} from "../utils/helper";

const filePath1 = `${import.meta.dir}/../public/cumin.webp`;

describe("Polar Sync - Eager", () => {
	let testDb: Awaited<ReturnType<typeof createTestDatabase>>;
	let productsApi: ReturnType<typeof treaty<typeof productsRouter>>;
	let ordersApi: ReturnType<typeof treaty<typeof ordersRouter>>;
	let userCookie: string;
	let createPolarProductMock: ReturnType<typeof spyOn>;
	let createPolarCheckoutMock: ReturnType<typeof spyOn>;

	beforeAll(async () => {
		testDb = await createTestDatabase("polar-sync.test.ts");

		// Mock UploadThing
		spyOn(imagesModule.utapi, "uploadFiles").mockImplementation((async (
			files,
		) => {
			return {
				data: createUploadedFileData(files as File | File[]),
				error: null,
			};
		}) as typeof imagesModule.utapi.uploadFiles);

		spyOn(imagesModule.utapi, "deleteFiles").mockImplementation((async () => {
			return { success: true, deletedCount: 1 };
		}) as typeof imagesModule.utapi.deleteFiles);

		// Mock Polar Sync functions
		createPolarProductMock = spyOn(
			polarSyncModule,
			"createPolarProduct",
		).mockImplementation(async () => {
			return `mock_polar_prod_${Date.now()}_${Math.random().toString(36).slice(2)}`;
		});

		createPolarCheckoutMock = spyOn(
			polarSyncModule,
			"createPolarCheckout",
		).mockImplementation(async (): Promise<Checkout> => {
			return {
				id: `mock_checkout_${Date.now()}_${Math.random().toString(36).slice(2)}`,
				createdAt: new Date(),
				modifiedAt: null,
				paymentProcessor: "stripe",
				status: "open",
				clientSecret: "mock_secret",
				url: "https://mock-polar.checkout.url/test",
				expiresAt: new Date(Date.now() + 3600_000),
				successUrl: "https://mock-polar.checkout.url/success",
				returnUrl: null,
				embedOrigin: null,
				amount: 0,
				discountAmount: 0,
				netAmount: 0,
				taxAmount: null,
				totalAmount: 0,
				currency: "eur",
				allowTrial: null,
				activeTrialInterval: null,
				activeTrialIntervalCount: null,
				trialEnd: null,
				organizationId: "mock_org_id",
				productId: null,
				productPriceId: null,
				discountId: null,
				allowDiscountCodes: false,
				requireBillingAddress: false,
				isDiscountApplicable: false,
				isFreeProductPrice: false,
				isPaymentRequired: true,
				isPaymentSetupRequired: false,
				isPaymentFormRequired: true,
				customerId: null,
				isBusinessCustomer: false,
				customerName: null,
				customerEmail: null,
				customerIpAddress: null,
				customerBillingName: null,
				customerBillingAddress: null,
				customerTaxId: null,
				paymentProcessorMetadata: {},
				billingAddressFields: {
					country: "required",
					state: "optional",
					city: "optional",
					postalCode: "optional",
					line1: "optional",
					line2: "optional",
				},
				trialInterval: null,
				trialIntervalCount: null,
				metadata: {},
				externalCustomerId: null,
				customerExternalId: null,
				products: [],
				product: null,
				productPrice: null,
				prices: null,
				discount: null,
				subscriptionId: null,
				attachedCustomFields: null,
				customerMetadata: {},
			};
		});

		// Import auth after setting up mocks but before using it
		const { auth } = await import(
			"@spice-world/server/plugins/better-auth.plugin.tsx"
		);

		// Create test user for authenticated requests
		const testUser = await auth.api.createUser({
			body: {
				email: "polar-test@spiceworld.test",
				password: "password123",
				name: "Polar Test User",
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
				email: "polar-test@spiceworld.test",
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
		// Restore Polar Sync mocks if they were created
		createPolarProductMock?.mockRestore();
		createPolarCheckoutMock?.mockRestore();

		await testDb.destroy();
	}, 10000);

	describe("POST /products", () => {
		it("should sync variant to Polar when creating PUBLISHED product", async () => {
			const category = await createTestCategory({
				testDb,
				attributeCount: 1,
				attributeValueCount: 2,
			});
			expectDefined(category.attributes[0]?.values[0]);
			const attributeValue = category.attributes[0].values[0];
			expectDefined(attributeValue);

			const { data, status } = await productsApi.products.post({
				name: "test published product",
				description: "test description",
				status: "PUBLISHED",
				categoryId: category.id,
				variants: {
					create: [
						{
							price: 9.99,
							sku: "TEST-SYNC-001",
							stock: 10,
							currency: "EUR",
							attributeValueIds: [attributeValue.id],
						},
					],
				},
				images: {
					create: [{ isThumbnail: true, file: file(filePath1) }],
				},
			});

			expect(status).toBe(201);
			expectDefined(data);
			expect(data.variants).toHaveLength(1);
			expectDefined(data.variants[0]);
			expect(data.variants[0].polarProductId).toBeTruthy();
			expect(data.variants[0].polarProductId).toMatch(/^mock_polar_prod_/);
		});

		it("should NOT sync variant to Polar when creating DRAFT product", async () => {
			const category = await createTestCategory({
				testDb,
				attributeCount: 1,
				attributeValueCount: 2,
			});
			expectDefined(category.attributes[0]?.values[0]);
			const attributeValue = category.attributes[0].values[0];
			expectDefined(attributeValue);

			const { data, status } = await productsApi.products.post({
				name: "test draft product",
				description: "Test description",
				status: "DRAFT",
				categoryId: category.id,
				variants: {
					create: [
						{
							price: 9.99,
							sku: "TEST-DRAFT-001",
							stock: 10,
							currency: "EUR",
							attributeValueIds: [attributeValue.id],
						},
					],
				},
				images: {
					create: [{ isThumbnail: true, file: file(filePath1) }],
				},
			});

			expect(status).toBe(201);
			expectDefined(data);
			expect(data.variants).toHaveLength(1);
			expectDefined(data.variants[0]);
			expect(data.variants[0].polarProductId).toBeNull();
		});
	});

	describe("PATCH /products/:id", () => {
		it("should sync ALL variants to Polar when publishing DRAFT product", async () => {
			// Create a category with 1 attribute and 2 values
			const category = await createTestCategory({
				testDb,
				attributeCount: 1,
				attributeValueCount: 2,
			});
			expectDefined(category.attributes[0]?.values[0]);
			expectDefined(category.attributes[0]?.values[1]);
			const attrValue1 = category.attributes[0].values[0];
			const attrValue2 = category.attributes[0].values[1];
			expectDefined(attrValue1);
			expectDefined(attrValue2);

			// Create a DRAFT product with 2 variants having different attribute values
			const { data: product, status: createStatus } =
				await productsApi.products.post({
					name: "test product multi variant",
					description: "Test description",
					status: "DRAFT",
					categoryId: category.id,
					variants: {
						create: [
							{
								price: 10,
								sku: "DRAFT-01",
								stock: 5,
								attributeValueIds: [attrValue1.id],
							},
							{
								price: 20,
								sku: "DRAFT-02",
								stock: 3,
								attributeValueIds: [attrValue2.id],
							},
						],
					},
					images: {
						create: [{ isThumbnail: true, file: file(filePath1) }],
					},
				});

			expect(createStatus).toBe(201);
			expectDefined(product);

			// Verify variants don't have polarProductId (product is DRAFT by default)
			const variant0 = product.variants[0];
			const variant1 = product.variants[1];
			expectDefined(variant0);
			expectDefined(variant1);
			expect(variant0.polarProductId).toBeNull();
			expect(variant1.polarProductId).toBeNull();

			// Publish the product
			const { data, status } = await productsApi
				.products({
					id: product.id,
				})
				.patch({
					status: "PUBLISHED",
				});

			expect(status).toBe(200);
			expectDefined(data);

			// All variants should now have polarProductId
			expect(data.variants).toHaveLength(2);
			for (const variant of data.variants) {
				expect(variant.polarProductId).toBeTruthy();
				expect(variant.polarProductId).toMatch(/^mock_polar_prod_/);
			}
		});

		it("should sync new variant to Polar when adding to PUBLISHED product", async () => {
			// Create a category with 1 attribute and 3 values
			const category = await createTestCategory({
				testDb,
				attributeCount: 1,
				attributeValueCount: 3,
			});
			expectDefined(category.attributes[0]?.values[0]);
			expectDefined(category.attributes[0]?.values[1]);
			const attrValue1 = category.attributes[0].values[0];
			const attrValue2 = category.attributes[0].values[1];
			expectDefined(attrValue1);
			expectDefined(attrValue2);

			// Create a DRAFT product with 1 variant (has attribute value to pass PUB2 when publishing)
			const { data: product, status: createStatus } =
				await productsApi.products.post({
					name: "test product add variant",
					description: "Test description",
					status: "DRAFT",
					categoryId: category.id,
					variants: {
						create: [
							{
								price: 10,
								sku: "PUB-01",
								stock: 5,
								attributeValueIds: [attrValue1.id],
							},
						],
					},
					images: {
						create: [{ isThumbnail: true, file: file(filePath1) }],
					},
				});

			expect(createStatus).toBe(201);
			expectDefined(product);

			// First, publish the product
			const { data: publishedProduct } = await productsApi
				.products({ id: product.id })
				.patch({
					status: "PUBLISHED",
				});
			expectDefined(publishedProduct);
			expect(publishedProduct.variants[0]?.polarProductId).toBeTruthy();

			// Add a new variant with different attribute value
			const { data, status } = await productsApi
				.products({
					id: product.id,
				})
				.patch({
					variants: {
						create: [
							{
								price: 15.99,
								sku: "PUB-NEW-001",
								stock: 10,
								currency: "EUR",
								attributeValueIds: [attrValue2.id],
							},
						],
					},
				});

			expect(status).toBe(200);
			expectDefined(data);
			expect(data.variants).toHaveLength(2);

			// New variant should have polarProductId
			const newVariant = data.variants.find(
				(v: { sku: string | null }) => v.sku === "PUB-NEW-001",
			);
			expectDefined(newVariant);
			expect(newVariant.polarProductId).toBeTruthy();
			expect(newVariant.polarProductId).toMatch(/^mock_polar_prod_/);
		});

		it("should NOT sync variant to Polar when adding to DRAFT product", async () => {
			const setupProduct = createSetupProduct(testDb, productsApi);

			// Create a DRAFT product (default) - use unique SKU to avoid conflicts
			const { product, category } = await setupProduct({
				attributeCount: 1,
				attributeValueCount: 3,
				variants: [
					{
						price: 10,
						sku: "DRAFT-UNIQUE-01",
						stock: 5,
						attributeValueIds: [],
					},
				],
				imagesCreate: [{ isThumbnail: true, file: file(filePath1) }],
			});

			expectDefined(category.attributes[0]?.values[1]);
			const attributeValue = category.attributes[0].values[1];
			expectDefined(attributeValue);

			// Add a new variant (product is still DRAFT)
			const { data, status } = await productsApi
				.products({
					id: product.id,
				})
				.patch({
					variants: {
						create: [
							{
								price: 15.99,
								sku: "DRAFT-UNIQUE-NEW-001",
								stock: 10,
								currency: "EUR",
								attributeValueIds: [attributeValue.id],
							},
						],
					},
				});

			expect(status).toBe(200);
			expectDefined(data);

			// New variant should NOT have polarProductId
			const newVariant = data.variants.find(
				(v: { sku: string | null }) => v.sku === "DRAFT-UNIQUE-NEW-001",
			);
			expectDefined(newVariant);
			expect(newVariant.polarProductId).toBeNull();
		});
	});

	describe("POST /orders/checkout", () => {
		it("should fail checkout when variant has no polarProductId", async () => {
			const setupProduct = createSetupProduct(testDb, productsApi);

			// Create a DRAFT product (variant won't have polarProductId)
			const { product } = await setupProduct({
				attributeCount: 1,
				attributeValueCount: 2,
				variants: [
					{ price: 10, sku: "NO-SYNC-001", stock: 5, attributeValueIds: [] },
				],
				imagesCreate: [{ isThumbnail: true, file: file(filePath1) }],
			});

			const variant = product.variants[0];
			expectDefined(variant);
			expect(variant.polarProductId).toBeNull();

			// Try to checkout with authentication
			const { status, error } = await ordersApi.orders.checkout.post(
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

			expect(status).toBe(400);
			expectDefined(error);
			expect(error.value).toMatchObject({
				message: expect.stringContaining("not available for purchase"),
			});
		});

		it("should succeed checkout validation when variant has polarProductId", async () => {
			const setupProduct = createSetupProduct(testDb, productsApi);

			// Create a product and publish it (single variant doesn't need attributes for PUB2)
			const { product } = await setupProduct({
				attributeCount: 1,
				attributeValueCount: 2,
				variants: [
					{ price: 10, sku: "SYNCED-001", stock: 5, attributeValueIds: [] },
				],
				imagesCreate: [{ isThumbnail: true, file: file(filePath1) }],
			});

			// Publish to get polarProductId
			await productsApi.products({ id: product.id }).patch({
				status: "PUBLISHED",
			});

			// Verify variant has polarProductId
			const { data: publishedProduct } = await productsApi
				.products({
					id: product.id,
				})
				.get();
			expectDefined(publishedProduct);
			const variant = publishedProduct.variants[0];
			expectDefined(variant);
			expect(variant.polarProductId).toBeTruthy();

			// The validation should pass (Polar checkout creation would need mocking)
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

			// Should pass validation (may fail later in checkout flow without Polar checkout mock)
			expect(status).not.toBe(400);
		});
	});
});
