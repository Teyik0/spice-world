import { describe, expect, it } from "bun:test";

import { treaty } from "@elysia/eden";
import { productsRouter } from "@spice-world/server/modules/products";
import type * as ProductModel from "@spice-world/server/modules/products/model";
import { validateImages } from "@spice-world/server/modules/products/validators/images";

import { testDb } from "../setup";
import {
  createSessionCookie,
  createSetupProduct,
  expectDefined,
  file,
  mockUtapi,
  randomLowerString,
} from "../utils/helper";

await mockUtapi();
const api = treaty(productsRouter, {
  headers: { cookie: await createSessionCookie(testDb) },
});
const setupProduct = createSetupProduct(testDb, api);

describe("Explicit thumbnail validation", () => {
  const filePath1 = `${import.meta.dir}/../public/cumin.webp`;
  const filePath2 = `${import.meta.dir}/../public/curcuma.jpg`;

  async function setup() {
    const result = await setupProduct({
      attributeCount: 2,
      attributeValueCount: 2,
      variants: [
        {
          price: 1000,
          sku: crypto.randomUUID(),
          stock: 10,
          attributeValueIds: [],
        },
      ],
      imagesCreate: [
        { isThumbnail: true, altText: "First image", file: file(filePath1) },
        { isThumbnail: false, altText: "Second image", file: file(filePath2) },
        { isThumbnail: false, altText: "Third image", file: file(filePath1) },
      ],
    });
    const first = result.product.images.find(
      (img) => img.altText === "First image",
    );
    const second = result.product.images.find(
      (img) => img.altText === "Second image",
    );
    const third = result.product.images.find(
      (img) => img.altText === "Third image",
    );
    expectDefined(first);
    expectDefined(second);
    expectDefined(third);
    return { ...result, first, second, third };
  }

  async function expectUnchanged(
    product: Pick<
      ProductModel.productResult,
      "id" | "description" | "version" | "images"
    >,
  ) {
    const persisted = await testDb.db.query.product.findFirst({
      where: { id: product.id },
      with: { images: { columns: { productId: false } } },
    });
    expectDefined(persisted);
    expect(persisted.description).toBe(product.description);
    expect(persisted.version).toBe(product.version);
    expect(
      persisted.images.toSorted((a, b) => a.id.localeCompare(b.id)),
    ).toEqual(product.images.toSorted((a, b) => a.id.localeCompare(b.id)));
  }

  it("creates a product with exactly the explicitly selected thumbnail", async () => {
    const { product, first } = await setup();
    expect(product.images.filter((img) => img.isThumbnail)).toMatchObject([
      { id: first.id },
    ]);
  });

  it.each([
    { flags: [false, false], code: "THUMBNAIL_REQUIRED" },
    { flags: [true, true], code: "MULTIPLE_THUMBNAILS" },
  ])(
    "rejects creation with invalid thumbnail flags: $code",
    async ({ flags, code }) => {
      const { category } = await setup();
      const name = `invalid thumbnail ${randomLowerString()}`;
      const { status, error } = await api.products.post({
        name,
        description: "Invalid thumbnail selection",
        status: "DRAFT",
        categoryId: category.id,
        variants: {
          create: [{ price: 1000, stock: 1, attributeValueIds: [] }],
        },
        images: {
          create: flags.map((isThumbnail) => ({
            isThumbnail,
            file: file(filePath1),
          })),
        },
      });
      expect(status).toBe(422);
      expect(error?.value).toMatchObject({ code, field: "images" });
      expect(
        await testDb.db.query.product.findFirst({ where: { name } }),
      ).toBeUndefined();
    },
  );

  it("rejects creation when isThumbnail is omitted rather than defaulting it", async () => {
    const { category } = await setup();
    const image = { isThumbnail: true, file: file(filePath1) };
    Reflect.deleteProperty(image, "isThumbnail");
    const name = `missing thumbnail ${randomLowerString()}`;
    const { status, error } = await api.products.post({
      name,
      description: "Missing required image field",
      status: "DRAFT",
      categoryId: category.id,
      variants: { create: [{ price: 1000, stock: 1, attributeValueIds: [] }] },
      images: { create: [image] },
    });
    expect(status).toBe(422);
    expect(error?.value).toMatchObject({ type: "validation" });
    expect(
      await testDb.db.query.product.findFirst({ where: { name } }),
    ).toBeUndefined();
  });

  it("preserves the current thumbnail when PATCH omits image operations", async () => {
    const { product, first } = await setup();
    const { status, data } = await api
      .products({ id: product.id })
      .patch(
        { description: "Updated description" },
        { headers: { "x-version": product.version } },
      );
    expect(status).toBe(200);
    expectDefined(data);
    expect(data.images.filter((img) => img.isThumbnail)).toMatchObject([
      { id: first.id },
    ]);
  });

  it("preserves thumbnail flags when updating only metadata or a file", async () => {
    const { product, first, second } = await setup();
    const { status, data } = await api.products({ id: product.id }).patch(
      {
        images: {
          update: [
            { id: first.id, altText: "Updated thumbnail" },
            { id: second.id, file: file(filePath1) },
          ],
        },
      },
      { headers: { "x-version": product.version } },
    );
    expect(status).toBe(200);
    expectDefined(data);
    expect(data.images.filter((img) => img.isThumbnail)).toMatchObject([
      { id: first.id },
    ]);
    expect(data.images.find((img) => img.id === first.id)?.altText).toBe(
      "Updated thumbnail",
    );
  });

  it("accepts an explicit switch that unsets the old thumbnail", async () => {
    const { product, first, second } = await setup();
    const { status, data } = await api.products({ id: product.id }).patch(
      {
        images: {
          update: [
            { id: first.id, isThumbnail: false },
            { id: second.id, isThumbnail: true },
          ],
        },
      },
      { headers: { "x-version": product.version } },
    );
    expect(status).toBe(200);
    expectDefined(data);
    expect(data.images.filter((img) => img.isThumbnail)).toMatchObject([
      { id: second.id },
    ]);
  });

  it("rejects assigning another thumbnail without unsetting the current one", async () => {
    const { product, second } = await setup();
    const { status, error } = await api.products({ id: product.id }).patch(
      {
        description: "Must not be saved",
        images: { update: [{ id: second.id, isThumbnail: true }] },
      },
      { headers: { "x-version": product.version } },
    );
    expect(status).toBe(422);
    expect(error?.value).toMatchObject({ code: "MULTIPLE_THUMBNAILS" });
    await expectUnchanged(product);
  });

  it("rejects deleting the thumbnail without replacement and saves nothing", async () => {
    const { product, first, second } = await setup();
    const { status, error } = await api.products({ id: product.id }).patch(
      {
        description: "Must not be saved",
        images: {
          delete: [first.id],
          update: [
            {
              id: second.id,
              altText: "Must not be saved",
              file: file(filePath1),
            },
          ],
        },
      },
      { headers: { "x-version": product.version } },
    );
    expect(status).toBe(422);
    expect(error?.value).toMatchObject({ code: "THUMBNAIL_REQUIRED" });
    await expectUnchanged(product);
  });

  it("rejects unsetting the thumbnail without replacement", async () => {
    const { product, first, second, third } = await setup();
    const { status, error } = await api.products({ id: product.id }).patch(
      {
        images: {
          update: [first, second, third].map(({ id }) => ({
            id,
            isThumbnail: false,
          })),
        },
      },
      { headers: { "x-version": product.version } },
    );
    expect(status).toBe(422);
    expect(error?.value).toMatchObject({ code: "THUMBNAIL_REQUIRED" });
    await expectUnchanged(product);
  });

  it("accepts deleting the thumbnail with an existing image explicitly replacing it", async () => {
    const { product, first, third } = await setup();
    const { status, data } = await api.products({ id: product.id }).patch(
      {
        images: {
          delete: [first.id],
          update: [{ id: third.id, isThumbnail: true }],
        },
      },
      { headers: { "x-version": product.version } },
    );
    expect(status).toBe(200);
    expectDefined(data);
    expect(data.images).toHaveLength(2);
    expect(data.images.filter((img) => img.isThumbnail)).toMatchObject([
      { id: third.id },
    ]);
  });

  it("accepts deleting the thumbnail with a newly created explicit replacement", async () => {
    const { product, first } = await setup();
    const { status, data } = await api.products({ id: product.id }).patch(
      {
        images: {
          delete: [first.id],
          create: [
            {
              isThumbnail: true,
              altText: "Replacement",
              file: file(filePath2),
            },
          ],
        },
      },
      { headers: { "x-version": product.version } },
    );
    expect(status).toBe(200);
    expectDefined(data);
    expect(data.images).toHaveLength(3);
    expect(data.images.filter((img) => img.isThumbnail)).toMatchObject([
      { altText: "Replacement" },
    ]);
  });

  it("rejects deleting the thumbnail when new images are explicitly false", async () => {
    const { product, first } = await setup();
    const { status, error } = await api.products({ id: product.id }).patch(
      {
        images: {
          delete: [first.id],
          create: [{ isThumbnail: false, file: file(filePath2) }],
        },
      },
      { headers: { "x-version": product.version } },
    );
    expect(status).toBe(422);
    expect(error?.value).toMatchObject({ code: "THUMBNAIL_REQUIRED" });
    await expectUnchanged(product);
  });

  it("rejects multiple replacements across create and update operations", async () => {
    const { product, first, second } = await setup();
    const { status, error } = await api.products({ id: product.id }).patch(
      {
        images: {
          delete: [first.id],
          update: [{ id: second.id, isThumbnail: true }],
          create: [{ isThumbnail: true, file: file(filePath2) }],
        },
      },
      { headers: { "x-version": product.version } },
    );
    expect(status).toBe(422);
    expect(error?.value).toMatchObject({ code: "MULTIPLE_THUMBNAILS" });
    await expectUnchanged(product);
  });

  it("preserves the thumbnail when deleting a non-thumbnail and adding a non-thumbnail", async () => {
    const { product, first, second } = await setup();
    const { status, data } = await api.products({ id: product.id }).patch(
      {
        images: {
          delete: [second.id],
          create: [{ isThumbnail: false, file: file(filePath2) }],
        },
      },
      { headers: { "x-version": product.version } },
    );
    expect(status).toBe(200);
    expectDefined(data);
    expect(data.images.filter((img) => img.isThumbnail)).toMatchObject([
      { id: first.id },
    ]);
  });

  it("rejects update and delete IDs belonging to another product", async () => {
    const { product } = await setup();
    const other = await setup();
    const results = await Promise.all([
      api.products({ id: product.id }).patch(
        {
          images: { update: [{ id: other.second.id, isThumbnail: false }] },
        },
        { headers: { "x-version": product.version } },
      ),
      api.products({ id: product.id }).patch(
        {
          images: { delete: [other.second.id] },
        },
        { headers: { "x-version": product.version } },
      ),
    ]);
    for (const { status, error } of results) {
      expect(status).toBe(422);
      expect(error?.value).toMatchObject({ code: "INVALID_IMAGE_OPERATIONS" });
    }
    await expectUnchanged(product);
    await expectUnchanged(other.product);
  });

  it("rejects duplicate update IDs instead of depending on write order", async () => {
    const { product, second } = await setup();
    const { status, error } = await api.products({ id: product.id }).patch(
      {
        images: {
          update: [
            { id: second.id, isThumbnail: true },
            { id: second.id, isThumbnail: false },
          ],
        },
      },
      { headers: { "x-version": product.version } },
    );
    expect(status).toBe(422);
    expect(error?.value).toMatchObject({ code: "INVALID_IMAGE_OPERATIONS" });
    await expectUnchanged(product);
  });

  it("validates without adding or rewriting image operations", () => {
    const imagesOps: ProductModel.imageOperations = {
      update: [{ id: "second", altText: "Updated text" }],
    };
    const currentImages = [
      { id: "first", isThumbnail: true },
      { id: "second", isThumbnail: false },
    ];
    const before = structuredClone({ imagesOps, currentImages });
    validateImages({ imagesOps, currentImages });
    expect({ imagesOps, currentImages }).toEqual(before);
  });

  it("keeps exactly one thumbnail when two replacement requests race", async () => {
    const { product, first, second, third } = await setup();
    const results = await Promise.all(
      [second, third].map((replacement) =>
        api.products({ id: product.id }).patch(
          {
            images: {
              update: [
                { id: first.id, isThumbnail: false },
                { id: replacement.id, isThumbnail: true },
              ],
            },
          },
          { headers: { "x-version": product.version } },
        ),
      ),
    );
    expect(results.filter((result) => result.status === 200)).toHaveLength(1);
    const rejected = results.find((result) => result.status !== 200);
    expectDefined(rejected);
    expect([409, 422]).toContain(rejected.status);
    expect(rejected.error?.value).toMatchObject({
      code:
        rejected.status === 409 ? "VERSION_CONFLICT" : "MULTIPLE_THUMBNAILS",
    });
    const persisted = await testDb.db.query.product.findFirst({
      where: { id: product.id },
      with: { images: { columns: { productId: false } } },
    });
    expectDefined(persisted);
    expect(persisted.version).toBe(product.version + 1);
    expect(persisted.images.filter((img) => img.isThumbnail)).toHaveLength(1);
  });

  describe("Image Validation Errors", () => {
    it("should throw error VIO1 for duplicate IDs in update and delete", async () => {
      const { product } = await setupProduct({
        attributeCount: 2,
        attributeValueCount: 2,
        variants: [
          {
            price: 1000,
            sku: "DUP-IMG-TEST-4",
            stock: 10,
            attributeValueIds: [],
          },
        ],
        imagesCreate: [
          { isThumbnail: true, altText: "First image", file: file(filePath1) },
          {
            isThumbnail: false,
            altText: "Second image",
            file: file(filePath2),
          },
        ],
      });

      const firstImage = product.images.find(
        (img) => img.altText === "First image",
      );
      expectDefined(firstImage);

      const { error } = await api.products({ id: product.id }).patch(
        {
          images: {
            update: [
              {
                id: firstImage.id,
                file: file(filePath2),
              },
            ],
            delete: [firstImage.id],
          },
        },
        { headers: { "x-version": product.version } },
      );

      expectDefined(error);
      expect(error.status).toBe(400);
      expect(error.value).toMatchObject({
        code: "IMAGES_VALIDATION_FAILED",
        message: expect.any(String),
        details: {
          subErrors: expect.arrayContaining([
            expect.objectContaining({
              code: "VIO1",
            }),
          ]),
        },
      });
    });

    it("should throw error VIO2 when try delete all images", async () => {
      const { product } = await setupProduct({
        attributeCount: 2,
        attributeValueCount: 2,
        variants: [
          {
            price: 1000,
            sku: "DUP-IMG-TEST-6",
            stock: 10,
            attributeValueIds: [],
          },
        ],
        imagesCreate: [
          { isThumbnail: true, altText: "First image", file: file(filePath1) },
          {
            isThumbnail: false,
            altText: "Second image",
            file: file(filePath2),
          },
        ],
      });

      const firstImage = product.images.find(
        (img) => img.altText === "First image",
      );
      expectDefined(firstImage);
      const secondImage = product.images.find(
        (img) => img.altText === "Second image",
      );
      expectDefined(secondImage);

      const { error } = await api.products({ id: product.id }).patch(
        {
          images: {
            delete: [firstImage.id, secondImage.id],
          },
        },
        { headers: { "x-version": product.version } },
      );

      expectDefined(error);
      expect(error.status).toBe(400);
      expect(error.value).toMatchObject({
        code: "IMAGES_VALIDATION_FAILED",
        message: expect.any(String),
        details: {
          subErrors: expect.arrayContaining([
            expect.objectContaining({
              code: "VIO2",
            }),
          ]),
        },
      });
    });
  });
});
