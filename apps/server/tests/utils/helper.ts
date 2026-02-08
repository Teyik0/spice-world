import { expect, spyOn } from "bun:test";
import type { treaty } from "@elysiajs/eden";
import { faker } from "@faker-js/faker";
import type { productsRouter } from "@spice-world/server/modules/products";
import type { ProductModel } from "@spice-world/server/modules/products/model";
import type { BunFile } from "bun";
import type { UploadedFileData } from "uploadthing/types";
import type { createTestDatabase, TestDatabase } from "./db-manager";

export function expectDefined<T>(value: T): asserts value is NonNullable<T> {
	expect(value).not.toBeUndefined();
	expect(value).not.toBeNull();
}

const createUploadedFileData = (file: File): UploadedFileData => ({
	key: `mock-key-${Date.now()}-${crypto.randomUUID()}`,
	url: "https://mock-uploadthing.com/image.webp",
	appUrl: "https://mock-uploadthing.com/image.webp",
	ufsUrl: "https://mock-uploadthing.com/image.webp",
	name: file.name,
	size: file.size,
	customId: null,
	type: "image/webp",
	fileHash: "mock-hash",
});

export const mockUtapi = async () => {
	const imagesModule = await import("@spice-world/server/lib/images");

	spyOn(imagesModule.utapi, "uploadFiles").mockImplementation((async (
		files: File | File[],
	) => {
		const fileArray = Array.isArray(files) ? files : [files];
		return fileArray.map((file) => ({
			data: createUploadedFileData(file as File),
			error: null,
		}));
	}) as typeof imagesModule.utapi.uploadFiles);

	spyOn(imagesModule.utapi, "deleteFiles").mockImplementation((async () => {
		return { success: true, deletedCount: 1 };
	}) as typeof imagesModule.utapi.deleteFiles);
};

export function randomLowerString(length: number = 10): string {
	const chars = "abcdefghijklmnopqrstuvwxyz";
	let result = "";
	for (let i = 0; i < length; i++) {
		result += chars.charAt(Math.floor(Math.random() * chars.length));
	}
	return result;
}

const ATTRIBUTE_VALUES = {
	Size: ["Small", "Medium", "Large", "XL", "XXL"],
	Color: ["Black", "White", "Red", "Blue", "Green"],
	Weight: ["50g", "100g", "250g", "500g", "1kg"],
	Material: ["Cotton", "Polyester", "Leather", "Metal", "Wood"],
	Style: ["Classic", "Modern", "Vintage", "Minimalist", "Rustic"],
	Origin: ["France", "Italy", "Japan", "USA", "Spain"],
} as const satisfies Record<string, readonly string[]>;

export const ATTRIBUTE_NAMES = Object.keys(ATTRIBUTE_VALUES) as Array<
	keyof typeof ATTRIBUTE_VALUES
>;

export const CATEGORY_NAMES = [
	"Electronics",
	"Clothing",
	"Food & Beverages",
	"Home & Garden",
	"Sports & Outdoors",
	"Books & Media",
	"Health & Beauty",
	"Toys & Games",
	"Automotive",
	"Office Supplies",
];

interface CreateTestCategoryOptions {
	testDb: Awaited<ReturnType<typeof createTestDatabase>>;
	name?: string;
	attributeCount?: number;
	attributeValueCount?: number;
}

/**
 * Creates a test category with randomized attributes and values for integration tests.
 *
 * @param testDb - The test database instance
 * @param name - Optional category name (defaults to "test category {random}")
 * @param attributeCount - Number of attributes to create (default: 0)
 *   - 0: No attributes created
 *   - 1-6: Creates exactly that many random attributes
 * @param attributeValueCount - Optional number of values per attribute (default: random 2-5)
 *   - When undefined: Each attribute gets 2-5 random values (current behavior)
 *   - When 1-5: Each attribute gets exactly N values (deterministic)
 *   - Throws if > 5 (exceeds pool size)
 *   - Throws if <= 0 (invalid)
 *   - Throws if attributeCount is 0 (logical mismatch)
 *
 * @returns Category with nested attributes and their values
 *
 * @example
 * // Random behavior (backward compatible)
 * const category = await createTestCategory({ testDb, attributeCount: 2 });
 * // Each attribute has 2-5 random values
 *
 * @example
 * // Deterministic behavior (new)
 * const category = await createTestCategory({ testDb, attributeCount: 2, attributeValueCount: 3 });
 * // Each attribute has exactly 3 values
 *
 * @throws {Error} If attributeValueCount > 5
 * @throws {Error} If attributeValueCount <= 0
 * @throws {Error} If attributeCount is 0 but attributeValueCount is provided
 */
export const createTestCategory = async ({
	testDb,
	name,
	attributeCount = 0,
	attributeValueCount,
}: CreateTestCategoryOptions) => {
	const testId = randomLowerString(8);
	const categoryName = name ?? `test category ${testId}`;

	if (attributeCount !== undefined && attributeCount > ATTRIBUTE_NAMES.length) {
		throw new Error(
			`attributeCount cannot be greater than ${ATTRIBUTE_NAMES.length}`,
		);
	}

	// Validate attributeValueCount if provided
	if (attributeValueCount !== undefined) {
		if (attributeValueCount <= 0) {
			throw new Error(
				`attributeValueCount must be greater than 0, got ${attributeValueCount}`,
			);
		}

		if (attributeValueCount > 5) {
			throw new Error(
				`attributeValueCount cannot exceed maximum pool size of 5, got ${attributeValueCount}`,
			);
		}

		if (attributeCount === 0 && attributeValueCount > 0) {
			throw new Error(
				`attributeCount must be greater than 0 when attributeValueCount is specified (received attributeCount: 0, attributeValueCount: ${attributeValueCount})`,
			);
		}
	}

	// Support attributeCount: 0 for categories without attributes
	const selectedAttributes =
		attributeCount === 0
			? []
			: faker.helpers.arrayElements(
					ATTRIBUTE_NAMES,
					attributeCount ?? { min: 1, max: ATTRIBUTE_NAMES.length },
				);

	const category = await testDb.client.category.create({
		data: {
			name: categoryName,
			image: {
				create: {
					keyThumb: `key-thumb-${testId}`,
					keyMedium: `key-medium-${testId}`,
					keyLarge: `key-large-${testId}`,
					urlThumb: `https://test-url.com/${testId}-thumb.webp`,
					urlMedium: `https://test-url.com/${testId}-medium.webp`,
					urlLarge: `https://test-url.com/${testId}-large.webp`,
					altText: categoryName,
					isThumbnail: true,
				},
			},
			attributes: {
				create:
					attributeCount > 0
						? selectedAttributes.map((attrName) => ({
								name: attrName,
								values: {
									create: faker.helpers
										.arrayElements(
											ATTRIBUTE_VALUES[attrName],
											attributeValueCount ??
												faker.number.int({
													min: 2,
													max: ATTRIBUTE_VALUES[attrName].length,
												}),
										)
										.map((value) => ({ value })),
								},
							}))
						: undefined,
			},
		},
		include: { attributes: { include: { values: true } } },
	});

	return category;
};

interface SetupProductOptions {
	attributeCount: number;
	attributeValueCount: number;
	variants: (typeof ProductModel.variantCreate)["static"][];
	imagesCreate: (Omit<(typeof ProductModel.imageCreate)["static"], "file"> & {
		file: BunFile;
	})[];
}

/**
 * Factory function that creates a setupProduct function bound to specific testDb and productRouter api instances.
 *
 * @param testDb - Test database instance
 * @param api - Treaty API client (typed from productsRouter)
 * @returns A setupProduct function that can be called multiple times in tests
 *
 * @example
 * const setupProduct = createSetupProduct(testDb, api);
 * const { product, category } = await setupProduct({
 *   attributeCount: 2,
 *   attributeValueCount: 2,
 *   variants: [{ price: 10, sku: "TEST", stock: 10, attributeValueIds: [] }],
 *   imagesCreate: [{ isThumbnail: true, file: file(filePath) }]
 * });
 */
export const createSetupProduct = (
	testDb: TestDatabase,
	api: ReturnType<typeof treaty<typeof productsRouter>>,
) => {
	return async ({
		attributeCount,
		attributeValueCount,
		variants,
		imagesCreate,
	}: SetupProductOptions) => {
		const category = await createTestCategory({
			testDb,
			attributeCount,
			attributeValueCount,
		});
		expectDefined(category);

		const testId = randomLowerString(8);
		const productName = `test product ${testId} ${category.name}`;

		const { data, status } = await api.products.post({
			name: productName,
			description: "Test product description",
			status: "DRAFT",
			categoryId: category.id,
			variants: {
				create: variants,
			},
			images: {
				create: imagesCreate,
			},
		});
		expect(status).toBe(201);
		expectDefined(data);
		return { product: data, category };
	};
};
