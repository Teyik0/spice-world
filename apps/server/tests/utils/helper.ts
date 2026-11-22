import { expect, spyOn } from "bun:test";
import { basename } from "node:path";
import type { treaty } from "@elysia/eden";
import type { productsRouter } from "@spice-world/server/modules/products";
import type * as ProductModel from "@spice-world/server/modules/products/model";
import type { UnwrapSchema } from "elysia";
import type { UploadedFileData } from "uploadthing/types";
import {
  attributeTable,
  attributeValueTable,
  categoryTable,
  imageTable,
  productTable,
} from "../../drizzle/schema";
import type { createTestDatabase, TestDatabase } from "./db-manager";

export function expectDefined<T>(value: T): asserts value is NonNullable<T> {
  expect(value).not.toBeUndefined();
  expect(value).not.toBeNull();
}

const createUploadedFileData = (uploadedFile: File): UploadedFileData => ({
  key: `mock-key-${Date.now()}-${crypto.randomUUID()}`,
  url: "https://mock-uploadthing.com/image.webp",
  appUrl: "https://mock-uploadthing.com/image.webp",
  ufsUrl: "https://mock-uploadthing.com/image.webp",
  name: uploadedFile.name,
  size: uploadedFile.size,
  customId: (uploadedFile as File & { customId?: string }).customId ?? null,
  type: "image/webp",
  fileHash: "mock-hash",
});

export const mockUtapi = async () => {
  const imagesModule = await import("@spice-world/server/lib/images");
  const uploadedFiles: UploadedFileData[] = [];

  spyOn(imagesModule.utapi, "uploadFiles").mockImplementation(((
    files: File | File[]
  ) => {
    const createResult = (uploadedFile: File) => {
      const data = createUploadedFileData(uploadedFile);
      uploadedFiles.push(data);
      return { data, error: null };
    };

    return Promise.resolve(
      Array.isArray(files) ? files.map(createResult) : createResult(files)
    );
  }) as typeof imagesModule.utapi.uploadFiles);

  const deleteFiles = spyOn(
    imagesModule.utapi,
    "deleteFiles"
  ).mockImplementation((async () => ({
    success: true,
    deletedCount: 1,
  })) as typeof imagesModule.utapi.deleteFiles);
  return { uploadedFiles, deleteFiles };
};

export function randomLowerString(length = 10): string {
  const chars = "abcdefghijklmnopqrstuvwxyz";
  let result = "";
  for (let i = 0; i < length; i += 1) {
    result += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return result;
}

const randomInt = (min: number, max: number) =>
  min + Math.floor(Math.random() * (max - min + 1));

const pick = <T>(items: readonly T[], count: number): T[] =>
  items.toSorted(() => Math.random() - 0.5).slice(0, count);

const ATTRIBUTE_VALUES = {
  size: ["small", "medium", "large", "extra large", "xxl"],
  color: ["black", "white", "red", "blue", "green"],
  weight: ["50g", "100g", "250g", "500g", "1kg"],
  material: ["cotton", "polyester", "leather", "metal", "wood"],
  style: ["classic", "modern", "vintage", "minimalist", "rustic"],
  origin: ["france", "italy", "japan", "usa", "spain"],
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
  attributeCount?: number;
  attributeValueCount?: number;
  name?: string;
  testDb: Awaited<ReturnType<typeof createTestDatabase>>;
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
      `attributeCount cannot be greater than ${ATTRIBUTE_NAMES.length}`
    );
  }

  // Validate attributeValueCount if provided
  if (attributeValueCount !== undefined) {
    if (attributeValueCount <= 0) {
      throw new Error(
        `attributeValueCount must be greater than 0, got ${attributeValueCount}`
      );
    }

    if (attributeValueCount > 5) {
      throw new Error(
        `attributeValueCount cannot exceed maximum pool size of 5, got ${attributeValueCount}`
      );
    }

    if (attributeCount === 0 && attributeValueCount > 0) {
      throw new Error(
        `attributeCount must be greater than 0 when attributeValueCount is specified (received attributeCount: 0, attributeValueCount: ${attributeValueCount})`
      );
    }
  }

  // Support attributeCount: 0 for categories without attributes
  const selectedAttributes =
    attributeCount === 0
      ? []
      : pick(
          ATTRIBUTE_NAMES,
          attributeCount ?? randomInt(1, ATTRIBUTE_NAMES.length)
        );

  return await testDb.db.transaction(async (tx) => {
    const categoryId = Bun.randomUUIDv7();
    const imageId = Bun.randomUUIDv7();
    await tx.insert(imageTable).values({
      id: imageId,
      keyThumb: `key-thumb-${testId}`,
      keyMedium: `key-medium-${testId}`,
      keyLarge: `key-large-${testId}`,
      urlThumb: `https://test-url.com/${testId}-thumb.webp`,
      urlMedium: `https://test-url.com/${testId}-medium.webp`,
      urlLarge: `https://test-url.com/${testId}-large.webp`,
      altText: categoryName,
      isThumbnail: true,
    });
    await tx
      .insert(categoryTable)
      .values({ id: categoryId, name: categoryName, imageId });
    const attributes = selectedAttributes.map((attrName) => ({
      id: Bun.randomUUIDv7(),
      name: attrName,
      categoryId,
      values: pick(
        ATTRIBUTE_VALUES[attrName],
        attributeValueCount ?? randomInt(2, ATTRIBUTE_VALUES[attrName].length)
      ),
    }));
    if (attributes.length) {
      await tx
        .insert(attributeTable)
        .values(attributes.map(({ values, ...attribute }) => attribute));
      await tx.insert(attributeValueTable).values(
        attributes.flatMap((attribute) =>
          attribute.values.map((value) => ({
            id: Bun.randomUUIDv7(),
            attributeId: attribute.id,
            value,
          }))
        )
      );
    }
    const category = await tx.query.category.findFirst({
      where: { id: categoryId },
      with: { attributes: { with: { values: true } } },
    });
    expectDefined(category);
    return category;
  });
};

/** Inserts bare products (no variants, no images) in a fresh category. */
export const createTestProducts = async (
  testDb: TestDatabase,
  count: number,
  status: "DRAFT" | "PUBLISHED" = "PUBLISHED"
) => {
  const category = await createTestCategory({ testDb });
  return await testDb.db
    .insert(productTable)
    .values(
      Array.from({ length: count }, () => {
        const testId = randomLowerString(8);
        return {
          id: Bun.randomUUIDv7(),
          name: `test product ${testId}`,
          slug: `test-product-${testId}`,
          description: "Test product description",
          status,
          categoryId: category.id,
          updatedAt: new Date(),
        };
      })
    )
    .returning();
};

interface SetupProductOptions {
  attributeCount: number;
  attributeValueCount: number;
  imagesCreate: (Omit<UnwrapSchema<typeof ProductModel.imageCreate>, "file"> & {
    file: File;
  })[];
  variants: UnwrapSchema<typeof ProductModel.variantCreate>[];
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
 *   variants: [{ price: 1000, sku: "TEST", stock: 10, attributeValueIds: [] }],
 *   imagesCreate: [{ isThumbnail: true, file: file(filePath) }]
 * });
 */
export const createSetupProduct =
  (
    testDb: TestDatabase,
    api: ReturnType<typeof treaty<typeof productsRouter>>
  ) =>
  async ({
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

export function file(path: string): File {
  const blob = Bun.file(path);
  return new File([blob], basename(path), { type: blob.type });
}
