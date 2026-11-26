import { expect, spyOn } from "bun:test";
import { basename } from "node:path";

import type { treaty } from "@elysia/eden";
import type * as OrderModel from "@spice-world/server/modules/orders/model";
import type { productsRouter } from "@spice-world/server/modules/products";
import type * as ProductModel from "@spice-world/server/modules/products/model";
import { eq, sql } from "drizzle-orm";
import type { UnwrapSchema } from "elysia";
import type { UploadedFileData, UploadFileResult } from "uploadthing/types";

import {
  attributeTable,
  attributeValueTable,
  attributeValueToProductVariantTable,
  categoryTable,
  imageTable,
  orderItemTable,
  orderTable,
  productTable,
  productVariantTable,
  userTable,
} from "../../drizzle/schema";
import type { createTestDatabase, TestDatabase } from "./db-manager";

export function expectDefined<T>(value: T): asserts value is NonNullable<T> {
  expect(value).not.toBeUndefined();
  expect(value).not.toBeNull();
}

/** Retries an assertion until it passes, for work running after the response. */
export const waitFor = async (
  assertion: () => Promise<void>,
  retries = 50,
): Promise<void> => {
  try {
    await assertion();
  } catch (error) {
    if (retries === 0) {
      throw error;
    }
    await Bun.sleep(20);
    await waitFor(assertion, retries - 1);
  }
};

export const mockUtapi = async () => {
  const imagesModule = await import("@spice-world/server/lib/images");
  const uploadedFiles: UploadedFileData[] = [];

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

  const createResult = (uploadedFile: File): UploadFileResult => {
    const data = createUploadedFileData(uploadedFile);
    uploadedFiles.push(data);
    return { data, error: null };
  };

  const uploadFiles = spyOn(
    imagesModule.utapi,
    "uploadFiles",
  ).mockImplementation(((files: File | File[]) =>
    Promise.resolve(
      Array.isArray(files) ? files.map(createResult) : createResult(files),
    )) as typeof imagesModule.utapi.uploadFiles);

  /** Like UTApi: the next batch resolves, with an error for one file. Returns its keys, filled on upload. */
  const failNextUpload = (failedIndex: number) => {
    const keys: string[] = [];
    uploadFiles.mockImplementationOnce(((
      files: (File & { customId: string })[],
    ) => {
      keys.push(...files.map(({ customId }) => customId));
      return Promise.resolve(
        files.map((uploadedFile, index): UploadFileResult =>
          index === failedIndex
            ? {
                data: null,
                error: {
                  code: "UPLOAD_FAILED",
                  message: "boom",
                  data: undefined,
                },
              }
            : createResult(uploadedFile),
        ),
      );
    }) as unknown as typeof imagesModule.utapi.uploadFiles);
    return keys;
  };

  const deleteFiles = spyOn(
    imagesModule.utapi,
    "deleteFiles",
  ).mockImplementation(((keys: string | string[]) =>
    Promise.resolve({
      success: true,
      deletedCount: [keys].flat().length,
    })) as typeof imagesModule.utapi.deleteFiles);

  return { uploadedFiles, uploadFiles, deleteFiles, failNextUpload };
};

export const verifyEmail = async ({ db }: TestDatabase, userId: string) => {
  await db
    .update(userTable)
    .set({ emailVerified: true })
    .where(eq(userTable.id, userId));
};

/** Inserted directly: auth.api.createUser would create a Stripe customer. */
export const createTestUser = async ({ db }: TestDatabase) => {
  const id = crypto.randomUUID();
  await db
    .insert(userTable)
    .values({ id, name: "Test User", email: `${id}@example.com` });
  return id;
};

/** Creates a user with the given role and returns its session cookie. */
export const createSessionCookie = async (
  testDb: TestDatabase,
  role: "user" | "admin" = "admin",
) => {
  await mockStripe(); // createUser would create a real Stripe customer
  const { auth } = await import("@spice-world/server/plugins/auth.plugin");
  const email = `${randomLowerString()}@example.com`;
  const { user } = await auth.api.createUser({
    body: { email, password: "password", name: role, role },
  });
  await verifyEmail(testDb, user.id);
  const { headers } = await auth.api.signInEmail({
    body: { email, password: "password" },
    returnHeaders: true,
  });
  return headers
    .getSetCookie()
    .map((cookie) => cookie.split(";")[0])
    .join("; ");
};

/** Third party: replaces every Stripe call made by checkout and sign-up. */
export const mockStripe = async () => {
  const { stripeClient } = await import("@spice-world/server/lib/stripe");
  const statuses = new Map<string, "open" | "complete" | "expired">();
  const { sessions } = stripeClient.checkout;
  const create = spyOn(sessions, "create").mockImplementation((() => {
    const id = `cs_test_${crypto.randomUUID()}`;
    statuses.set(id, "open");
    return Promise.resolve({
      id,
      url: "https://checkout.example.com",
      status: "open",
    });
  }) as never);
  const retrieve = spyOn(sessions, "retrieve").mockImplementation(((
    id: string,
  ) => Promise.resolve({ id, status: statuses.get(id) })) as never);
  const expire = spyOn(sessions, "expire").mockImplementation(((id: string) => {
    statuses.set(id, "expired");
    return Promise.resolve({ id, status: "expired" });
  }) as never);
  const search = spyOn(stripeClient.customers, "search").mockImplementation(
    (() => Promise.resolve({ data: [] })) as never,
  );
  const createCustomer = spyOn(
    stripeClient.customers,
    "create",
  ).mockImplementation((() =>
    Promise.resolve({ id: `cus_${crypto.randomUUID()}` })) as never);
  const retrieveCustomer = spyOn(
    stripeClient.customers,
    "retrieve",
  ).mockImplementation(((id: string) =>
    Promise.resolve({ id, deleted: true })) as never);
  return {
    create,
    expire,
    statuses,
    restore: () => {
      for (const spy of [
        create,
        retrieve,
        expire,
        search,
        createCustomer,
        retrieveCustomer,
      ]) {
        spy.mockRestore();
      }
    },
  };
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

  if (attributeCount > ATTRIBUTE_NAMES.length) {
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
    attributeCount === 0 ? [] : pick(ATTRIBUTE_NAMES, attributeCount);

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
    const date = new Date();
    await tx.insert(categoryTable).values({
      id: categoryId,
      name: categoryName,
      imageId,
      createdAt: date,
      updatedAt: date,
    });
    const attributes = selectedAttributes.map((attrName) => ({
      id: Bun.randomUUIDv7(),
      name: attrName,
      categoryId,
      values: pick(
        ATTRIBUTE_VALUES[attrName],
        attributeValueCount ?? randomInt(2, ATTRIBUTE_VALUES[attrName].length),
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
          })),
        ),
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

/** Inserts a product with one variant using the given attribute values. */
export const createProductUsingValues = async (
  testDb: TestDatabase,
  categoryId: string,
  valueIds: string[],
) => {
  const id = Bun.randomUUIDv7();
  const variantId = Bun.randomUUIDv7();
  await testDb.db.transaction(async (tx) => {
    await tx.insert(productTable).values({
      id,
      name: `product ${randomLowerString()}`,
      slug: id,
      description: "uses attribute values",
      categoryId,
    });
    await tx
      .insert(productVariantTable)
      .values({ id: variantId, productId: id, price: 100 });
    await tx
      .insert(attributeValueToProductVariantTable)
      .values(valueIds.map((a) => ({ a, b: variantId })));
  });
  return id;
};

/** Inserts bare products (no variants, no images) in a fresh category. */
export const createTestProducts = async (
  testDb: TestDatabase,
  count: number,
  status: ProductModel.productStatus = "PUBLISHED",
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
      }),
    )
    .returning();
};

/** Inserts a variant in a fresh product. */
export const createTestVariant = async (
  testDb: TestDatabase,
  {
    price = 1099,
    stock = 10,
    status = "PUBLISHED",
  }: {
    price?: number;
    status?: ProductModel.productStatus;
    stock?: number;
  } = {},
) => {
  const [product] = await createTestProducts(testDb, 1, status);
  expectDefined(product);
  const [variant] = await testDb.db
    .insert(productVariantTable)
    .values({
      id: Bun.randomUUIDv7(),
      productId: product.id,
      price,
      stock,
      sku: crypto.randomUUID(),
    })
    .returning();
  expectDefined(variant);
  return variant;
};

export const shippingAddress = {
  name: "Test User",
  line1: "123 Test St",
  city: "Test City",
  postalCode: "12345",
  country: "FR",
};

/** Inserts an order of one variant, without Stripe. */
export const createTestOrder = async (
  testDb: TestDatabase,
  userId: string,
  status: OrderModel.OrderStatus = "PENDING",
) => {
  const variant = await createTestVariant(testDb);
  const [order] = await testDb.db
    .insert(orderTable)
    .values({
      id: Bun.randomUUIDv7(),
      userId,
      status,
      stripeSessionId: `cs_test_${crypto.randomUUID()}`,
      subtotalAmount: variant.price,
      shippingAmount: 500,
      totalAmount: variant.price + 500,
      shippingAddress,
    })
    .returning();
  expectDefined(order);
  await testDb.db.insert(orderItemTable).values({
    id: Bun.randomUUIDv7(),
    orderId: order.id,
    productId: variant.productId,
    productName: "test product",
    variantId: variant.id,
    variantSku: variant.sku,
    unitPrice: variant.price,
    quantity: 1,
    totalPrice: variant.price,
  });
  return order;
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
    api: ReturnType<typeof treaty<typeof productsRouter>>,
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

type TestTx = Parameters<Parameters<TestDatabase["db"]["transaction"]>[0]>[0];

/** Starts `request` while `lock` is held, then runs `meanwhile` once the lock blocks it. */
export const runBlocked = async <T>(
  { db }: TestDatabase,
  lock: (tx: TestTx) => PromiseLike<unknown>,
  request: () => PromiseLike<T>,
  meanwhile: (tx: TestTx) => PromiseLike<unknown>,
) => {
  // wrapped: an async callback would await the request before releasing the lock
  const { response } = await db.transaction(async (tx) => {
    await lock(tx);
    const [session] = await tx.execute<{ pid: number }>(
      sql`select pg_backend_pid() as pid`,
    );
    const running = { response: Promise.resolve(request()) };
    await waitFor(async () => {
      const blocked = await db.execute(
        sql`select 1 from pg_stat_activity where ${session?.pid}::int = any(pg_blocking_pids(pid))`,
      );
      expect(blocked.length).toBeGreaterThan(0);
    }, 250); // ~5s: the request may process images before reaching the lock (slow on CI)
    await meanwhile(tx);
    return running;
  });
  return await response;
};
