import { afterAll, describe, expect, it } from "bun:test";

import { treaty } from "@elysia/eden";
import { productsRouter } from "@spice-world/server/modules/products";

import { testDb } from "../setup";
import {
  createSessionCookie,
  createSetupProduct,
  createTestCategory,
  createTestProducts,
  expectDefined,
  expectNoDrift,
  file,
  mockUtapi,
  randomLowerString,
} from "../utils/helper";

await mockUtapi();
const api = treaty(productsRouter, {
  headers: { cookie: await createSessionCookie(testDb) },
});
const setupProduct = createSetupProduct(testDb, api);

describe.concurrent("PATCH /products/:id - Integration Tests", () => {
  const filePath1 = `${import.meta.dir}/../public/cumin.webp`;
  const filePath2 = `${import.meta.dir}/../public/curcuma.jpg`;

  describe("PATCH /products - Business Logic Validations", () => {
    it("should return an error if the product ID does not exist", async () => {
      const { status, error } = await api
        .products({ id: crypto.randomUUID() })
        .patch(
          {
            name: "non existent product",
            description: "this product does not exist",
            status: "DRAFT" as const,
          },
          { headers: { "x-version": 1 } },
        );

      expect(status).toBe(404);
      expectDefined(error);
    });

    it("should return an error update name conflict with an existing product", async () => {
      const category = await createTestCategory({ testDb, attributeCount: 1 });
      expectDefined(category);

      const testId = randomLowerString(8);
      const productName = `test product ${testId}`;

      const { data: product1 } = await api.products.post({
        name: productName,
        description: "First product for name conflict test",
        categoryId: category.id,
        status: "DRAFT",
        stockMode: "VARIANT",
        variants: [
          {
            price: 1099,
            sku: "first product variant",
            inventory: { quantity: 10 },
            attributeValueIds: [],
          },
        ],
        images: [{ position: 0, file: file(filePath1) }],
      });

      const testId2 = randomLowerString(8);
      const productName2 = `test product ${testId2}`;

      const { data: product2 } = await api.products.post({
        name: productName2,
        description: "Second product for name conflict test",
        categoryId: category.id,
        status: "DRAFT",
        stockMode: "VARIANT",
        variants: [
          {
            price: 1199,
            sku: "second product variant",
            inventory: { quantity: 11 },
            attributeValueIds: [],
          },
        ],
        images: [{ position: 0, file: file(filePath1) }],
      });

      expectDefined(product1);
      expectDefined(product2);

      const { status, error } = await api.products({ id: product1.id }).patch(
        {
          name: product2.name,
          status: "DRAFT",
        },
        { headers: { "x-version": product1.version } },
      );

      expect(status).toBe(409);
      expectDefined(error);
    });

    it("should reject deleting all variants", async () => {
      const { product, category } = await setupProduct({
        attributeCount: 2,
        attributeValueCount: 2,
        variants: [
          { price: 1000, inventory: { quantity: 10 }, attributeValueIds: [] },
        ],
        imagesCreate: [{ position: 0, file: file(filePath1) }],
      });

      // Add a second variant with different attribute values
      const { data: patchedData } = await api
        .products({ id: product.id })
        .patch(
          {
            variants: {
              update: [
                {
                  id: product.variants[0]?.id as string,
                  attributeValueIds: [
                    category.attributes[0]?.values[1]?.id as string,
                  ],
                },
              ],
              create: [
                {
                  price: 1500,
                  inventory: { quantity: 15 },
                  attributeValueIds: [
                    category.attributes[0]?.values[0]?.id as string,
                  ],
                },
              ],
            },
          },
          { headers: { "x-version": product.version } },
        );
      expectDefined(patchedData);

      const allVariantIds = patchedData.variants.map((v) => v.id);

      const { error } = await api.products({ id: product.id }).patch(
        {
          variants: { delete: allVariantIds },
        },
        { headers: { "x-version": patchedData.version } },
      );

      expectDefined(error);
      expect(error.status).toBe(400);
      expect(error.value).toMatchObject({
        code: "VARIANTS_VALIDATION_FAILED",
        detail: expect.any(String),
        details: {
          subErrors: expect.arrayContaining([
            expect.objectContaining({
              code: "VARIANT_COUNT_OUT_OF_RANGE",
            }),
          ]),
        },
      });
    });

    it("should reject a new variant that uses other attributes than the existing ones", async () => {
      const { product, category } = await setupProduct({
        attributeCount: 2,
        attributeValueCount: 2,
        variants: [
          { price: 1000, inventory: { quantity: 10 }, attributeValueIds: [] },
        ],
        imagesCreate: [{ position: 0, file: file(filePath1) }],
      });
      const [weight, origin] = category.attributes;
      expectDefined(weight?.values[0]);
      expectDefined(weight.values[1]);
      expectDefined(origin?.values[0]);

      const { error } = await api.products({ id: product.id }).patch(
        {
          variants: {
            update: [
              {
                id: product.variants[0]?.id as string,
                attributeValueIds: [weight.values[0].id],
              },
            ],
            create: [
              {
                price: 1500,
                inventory: { quantity: 15 },
                attributeValueIds: [weight.values[1].id, origin.values[0].id],
              },
            ],
          },
        },
        { headers: { "x-version": product.version } },
      );

      expectDefined(error);
      expect(error.status).toBe(400);
      expect(error.value).toMatchObject({
        code: "VARIANTS_VALIDATION_FAILED",
        details: {
          subErrors: [
            expect.objectContaining({ code: "VARIANT_ATTRIBUTES_MISMATCH" }),
          ],
        },
      });
    });

    it("should reject renaming a product to the reserved name new", async () => {
      const { product } = await setupProduct({
        attributeCount: 1,
        attributeValueCount: 1,
        variants: [
          { price: 100, inventory: { quantity: 1 }, attributeValueIds: [] },
        ],
        imagesCreate: [{ position: 0, file: file(filePath1) }],
      });

      const { error, status } = await api
        .products({ id: product.id })
        .patch({ name: "new" }, { headers: { "x-version": product.version } });

      expect(status).toBe(422);
      expect(error).toMatchObject({
        value: expect.stringContaining("cannot be named new"),
      });
    });

    it("should reject wrong version (optimistic locking)", async () => {
      const { product } = await setupProduct({
        attributeCount: 2,
        attributeValueCount: 2,
        variants: [
          {
            price: 1000,
            sku: "VERSION-TEST",
            inventory: { quantity: 10 },
            attributeValueIds: [],
          },
        ],
        imagesCreate: [{ position: 0, file: file(filePath1) }],
      });

      const { status } = await api.products({ id: product.id }).patch(
        {
          name: "should fail version check",
        },
        { headers: { "x-version": 999 } },
      );

      expect(status).toBe(409);
    });

    it("should let only one of two concurrent patches on the same version succeed", async () => {
      const [product] = await createTestProducts(testDb, 1);
      expectDefined(product);
      const { version } = product;

      const results = await Promise.all(
        ["first", "second"].map((description) =>
          api
            .products({ id: product.id })
            .patch(
              { description },
              { headers: { "x-version": product.version } },
            ),
        ),
      );

      expect(results.map(({ status }) => status).sort()).toEqual([200, 409]);
      expect(results.find(({ status }) => status === 409)?.error).toMatchObject(
        { value: { code: "VERSION_CONFLICT" } },
      );
      const winner = results.find(({ status }) => status === 200)?.data;
      expect(winner).toMatchObject({ version: version + 1 });
    });
  });

  describe("PATCH /products - Complex Scenarios", () => {
    it("should return an error if an attribute coming from another category is set for create", async () => {
      const spicesCategory = await createTestCategory({
        testDb,
        attributeCount: 2,
      });
      const herbsCategory = await createTestCategory({
        testDb,
        attributeCount: 2,
      });
      expectDefined(spicesCategory);
      expectDefined(herbsCategory);

      const spicesAttributes = spicesCategory.attributes;
      const herbsAttributes = herbsCategory.attributes;

      expect(spicesAttributes.length).toBeGreaterThanOrEqual(1);
      expect(herbsAttributes.length).toBeGreaterThanOrEqual(1);

      const { data: createdProduct, status: createStatus } =
        await api.products.post({
          name: "product to test attribute error",
          description: "Testing attribute validation",
          categoryId: spicesCategory.id,
          status: "DRAFT",
          stockMode: "VARIANT",
          variants: [
            {
              price: 1000,
              sku: "ATTR-ERR-TEST",
              inventory: { quantity: 10 },
              attributeValueIds: [spicesAttributes[0]?.values[0]?.id as string],
            },
          ],
          images: [{ position: 0, file: file(filePath1) }],
        });

      expect(createStatus).toBe(201);
      expectDefined(createdProduct);

      const { error } = await api.products({ id: createdProduct.id }).patch(
        {
          variants: {
            create: [
              {
                price: 1500,
                sku: "INVALID-VARIANT",
                inventory: { quantity: 20 },
                attributeValueIds: [
                  herbsAttributes[0]?.values[0]?.id as string,
                ],
              },
            ],
          },
        },
        { headers: { "x-version": createdProduct.version } },
      );

      expectDefined(error);
      expect(error.status).toBe(400);
      expect(error.value).toMatchObject({
        code: "VARIANTS_VALIDATION_FAILED",
        detail: expect.any(String),
        details: {
          subErrors: expect.arrayContaining([
            expect.objectContaining({
              code: "ATTRIBUTE_VALUE_NOT_IN_CATEGORY",
            }),
          ]),
        },
      });
    });

    it("should return an error if an attribute coming from another category is set for update", async () => {
      const spicesCategory = await createTestCategory({
        testDb,
        attributeCount: 2,
      });
      const herbsCategory = await createTestCategory({
        testDb,
        attributeCount: 2,
      });
      expectDefined(spicesCategory);
      expectDefined(herbsCategory);

      const spicesAttributes = spicesCategory.attributes;
      const herbsAttributes = herbsCategory.attributes;

      const { data: createdProduct, status: createStatus } =
        await api.products.post({
          name: "product to test update attribute error",
          description: "Testing attribute validation on update",
          categoryId: spicesCategory.id,
          status: "DRAFT",
          stockMode: "VARIANT",
          variants: [
            {
              price: 1000,
              sku: "ATTR-UPD-TEST",
              inventory: { quantity: 10 },
              attributeValueIds: [spicesAttributes[0]?.values[0]?.id as string],
            },
          ],
          images: [{ position: 0, file: file(filePath1) }],
        });

      expect(createStatus).toBe(201);
      expectDefined(createdProduct);

      const existingVariantId = createdProduct.variants[0]?.id;
      expectDefined(existingVariantId);

      const { error } = await api.products({ id: createdProduct.id }).patch(
        {
          variants: {
            update: [
              {
                id: existingVariantId,
                attributeValueIds: [
                  herbsAttributes[0]?.values[0]?.id as string,
                ],
              },
            ],
          },
        },
        { headers: { "x-version": createdProduct.version } },
      );

      expectDefined(error);
      expect(error.status).toBe(400);
      expect(error.value).toMatchObject({
        code: "VARIANTS_VALIDATION_FAILED",
        detail: expect.any(String),
        details: {
          subErrors: expect.arrayContaining([
            expect.objectContaining({
              code: "ATTRIBUTE_VALUE_NOT_IN_CATEGORY",
            }),
          ]),
        },
      });
    });

    it("should reject a category change that leaves variants with the same attribute values", async () => {
      const spicesCategory = await createTestCategory({
        testDb,
        attributeCount: 1,
        attributeValueCount: 2,
      });
      const herbsCategory = await createTestCategory({
        testDb,
        attributeCount: 1,
      });
      expectDefined(spicesCategory);
      expectDefined(herbsCategory);
      const values = spicesCategory.attributes[0]?.values ?? [];

      const { data: createdProduct } = await api.products.post({
        name: "product for duplicate category change test",
        description: "Two variants that would both lose their values",
        categoryId: spicesCategory.id,
        status: "DRAFT",
        stockMode: "VARIANT",
        variants: values.map(({ id }) => ({
          price: 1000,
          inventory: { quantity: 5 },
          attributeValueIds: [id],
        })),
        images: [{ position: 0, file: file(filePath1) }],
      });
      expectDefined(createdProduct);

      const { error } = await api
        .products({ id: createdProduct.id })
        .patch(
          { categoryId: herbsCategory.id },
          { headers: { "x-version": createdProduct.version } },
        );
      expect(error).toMatchObject({
        status: 400,
        value: {
          code: "VARIANTS_VALIDATION_FAILED",
          details: {
            subErrors: [
              {
                code: "DUPLICATE_VARIANT_COMBINATION",
                message: expect.stringContaining("a category change clears"),
              },
            ],
          },
        },
      });
      expect(
        (await api.products({ id: createdProduct.id }).get()).data,
      ).toEqual(createdProduct);
    });

    it("should change category and give each variant values of the new category in one request", async () => {
      const spicesCategory = await createTestCategory({
        testDb,
        attributeCount: 1,
        attributeValueCount: 2,
      });
      const herbsCategory = await createTestCategory({
        testDb,
        attributeCount: 1,
        attributeValueCount: 2,
      });
      expectDefined(spicesCategory);
      expectDefined(herbsCategory);
      const herbValues = herbsCategory.attributes[0]?.values ?? [];

      const { data: createdProduct } = await api.products.post({
        name: "product for category change with reassigned values",
        description: "Two variants moved to another category",
        categoryId: spicesCategory.id,
        status: "DRAFT",
        stockMode: "VARIANT",
        variants: (spicesCategory.attributes[0]?.values ?? []).map(
          ({ id }) => ({
            price: 1000,
            inventory: { quantity: 5 },
            attributeValueIds: [id],
          }),
        ),
        images: [{ position: 0, file: file(filePath1) }],
      });
      expectDefined(createdProduct);

      const { data, status } = await api
        .products({ id: createdProduct.id })
        .patch(
          {
            categoryId: herbsCategory.id,
            variants: {
              update: createdProduct.variants.map(({ id }, i) => ({
                id,
                attributeValueIds: [herbValues[i]?.id as string],
              })),
            },
          },
          { headers: { "x-version": createdProduct.version } },
        );

      expect(status).toBe(200);
      expectDefined(data);
      expect(data.categoryId).toBe(herbsCategory.id);
      expect(
        data.variants.map(({ attributeValues }) =>
          attributeValues.map(({ id }) => id),
        ),
      ).toEqual(expect.arrayContaining(herbValues.map(({ id }) => [id])));
      expect(
        (await api.products({ id: createdProduct.id }).get()).data,
      ).toEqual(data);
    });

    it("should change category successfully with atomic variant replacement", async () => {
      const spicesCategory = await createTestCategory({
        testDb,
        attributeCount: 2,
      });
      const herbsCategory = await createTestCategory({
        testDb,
        attributeCount: 2,
      });
      expectDefined(spicesCategory);
      expectDefined(herbsCategory);

      const spicesAttributes = spicesCategory.attributes;
      const herbsAttributes = herbsCategory.attributes;

      const { data: createdProduct, status: createStatus } =
        await api.products.post({
          name: "product for category change atomic",
          description: "Testing atomic category change",
          categoryId: spicesCategory.id,
          status: "DRAFT",
          stockMode: "VARIANT",
          variants: [
            {
              price: 1000,
              sku: "CAT-ATOMIC-1",
              inventory: { quantity: 10 },
              attributeValueIds: [spicesAttributes[0]?.values[0]?.id as string],
            },
          ],
          images: [{ position: 0, file: file(filePath1) }],
        });

      expect(createStatus).toBe(201);
      expectDefined(createdProduct);

      const existingVariantId = createdProduct.variants[0]?.id;
      expectDefined(existingVariantId);

      const { data, status } = await api
        .products({ id: createdProduct.id })
        .patch(
          {
            categoryId: herbsCategory.id,
            variants: {
              delete: [existingVariantId],
              create: [
                {
                  price: 1500,
                  sku: "CAT-ATOMIC-NEW",
                  inventory: { quantity: 20 },
                  attributeValueIds: [
                    herbsAttributes[0]?.values[0]?.id as string,
                  ],
                },
              ],
            },
          },
          { headers: { "x-version": createdProduct.version } },
        );

      expect(status).toBe(200);
      expectDefined(data);
      expectDefined(data);
      expect(data.categoryId).toBe(herbsCategory.id);
      expect(data.variants.length).toBe(1);
      expect(data.variants[0]?.sku).toBe("CAT-ATOMIC-NEW");
    });
  });

  describe("PATCH /products - Variant Attribute Validations", () => {
    it("should reject duplicate attribute values in variant update", async () => {
      const { product, category } = await setupProduct({
        attributeCount: 2,
        attributeValueCount: 2,
        variants: [
          {
            price: 1000,
            sku: "DUP-ATTR-TEST",
            inventory: { quantity: 10 },
            attributeValueIds: [],
          },
        ],
        imagesCreate: [{ position: 0, file: file(filePath1) }],
      });

      const firstAttrValues = category.attributes[0]?.values;
      expectDefined(firstAttrValues);
      expect(firstAttrValues.length).toBeGreaterThanOrEqual(2);

      const valueId1 = firstAttrValues[0]?.id as string;
      const valueId2 = firstAttrValues[1]?.id as string;

      const variantId = product.variants[0]?.id;
      expectDefined(variantId);

      const { error } = await api.products({ id: product.id }).patch(
        {
          variants: {
            update: [
              { id: variantId, attributeValueIds: [valueId1, valueId2] },
            ],
          },
        },
        { headers: { "x-version": product.version } },
      );

      expectDefined(error);
      expect(error.status).toBe(400);
      expect(error.value).toMatchObject({
        code: "VARIANTS_VALIDATION_FAILED",
        detail: expect.any(String),
        details: {
          subErrors: expect.arrayContaining([
            expect.objectContaining({
              code: "ATTRIBUTE_VALUED_TWICE",
              message: expect.stringContaining(`variant ${variantId}:`),
            }),
          ]),
        },
      });
    });
  });

  describe("PATCH /products - Success Scenarios", () => {
    it("should update the product successfully", async () => {
      const { product } = await setupProduct({
        attributeCount: 2,
        attributeValueCount: 3,
        variants: [
          {
            price: 1000,
            sku: "UPDATE-TEST-1",
            inventory: { quantity: 50 },
            attributeValueIds: [],
          },
        ],
        imagesCreate: [{ position: 0, file: file(filePath1) }],
      });

      const [variantToUpdate] = product.variants;
      expectDefined(variantToUpdate);

      const { data, status } = await api.products({ id: product.id }).patch(
        {
          name: "updated spice",
          description: "an updated description",
          status: "DRAFT",
          variants: {
            update: [
              {
                id: variantToUpdate.id,
                price: 1299,
                inventory: { adjust: 474 },
              },
            ],
          },
        },
        { headers: { "x-version": product.version } },
      );

      expect(status).toBe(200);
      expectDefined(data);
      expectDefined(data);
      expect(data.name).toBe("updated spice");
      expect(data.description).toBe("an updated description");
      expect(data.status).toBe("DRAFT");
      expect(data.variants.length).toBeGreaterThanOrEqual(1);

      const updatedVariant = data.variants.find(
        (v) => v.id === variantToUpdate.id,
      );
      expectDefined(updatedVariant);
      expect(updatedVariant.price).toBe(1299);
      expect(updatedVariant.price).not.toBe(product.variants[0]?.price);
      expect(updatedVariant).toMatchObject({
        available: 524,
        inventory: { quantity: 524 },
      });
    });

    it("should update product with new images", async () => {
      const { product } = await setupProduct({
        attributeCount: 1,
        attributeValueCount: 2,
        variants: [
          {
            price: 1000,
            sku: "IMG-UPDATE-TEST",
            inventory: { quantity: 10 },
            attributeValueIds: [],
          },
        ],
        imagesCreate: [{ position: 0, file: file(filePath1) }],
      });

      const initialImageCount = product.images.length;

      const { data, status } = await api.products({ id: product.id }).patch(
        {
          images: {
            create: [
              { position: 1, file: file(filePath1) },
              { position: 2, file: file(filePath2) },
            ],
          },
        },
        { headers: { "x-version": product.version } },
      );

      expect(status).toBe(200);
      expectDefined(data);
      expectDefined(data);
      expect(data.images.length).toBe(initialImageCount + 2);
    });

    it("should delete thumbnail image with an explicit replacement", async () => {
      const { product } = await setupProduct({
        attributeCount: 2,
        attributeValueCount: 2,
        variants: [
          {
            price: 1000,
            sku: "ASG-IMG-TEST",
            inventory: { quantity: 10 },
            attributeValueIds: [],
          },
        ],
        imagesCreate: [
          { position: 0, file: file(filePath1) },
          { position: 1, file: file(filePath2) },
        ],
      });

      const [cover, replacement] = product.images;
      expectDefined(cover);
      expectDefined(replacement);

      const { data, status } = await api.products({ id: product.id }).patch(
        {
          images: {
            delete: [cover.id],
            update: [{ id: replacement.id, position: 0 }],
          },
        },
        { headers: { "x-version": product.version } },
      );
      expect(status).toBe(200);
      expectDefined(data);
      expect(data.images).toMatchObject([{ id: replacement.id, position: 0 }]);
    });

    it("should update image metadata successfully", async () => {
      const { product } = await setupProduct({
        attributeCount: 2,
        attributeValueCount: 2,
        variants: [
          {
            price: 1000,
            sku: "IMG-META-TEST",
            inventory: { quantity: 10 },
            attributeValueIds: [],
          },
        ],
        imagesCreate: [{ position: 0, file: file(filePath1) }],
      });

      const imageId = product.images[0]?.id;
      expectDefined(imageId);

      const { data, status } = await api.products({ id: product.id }).patch(
        {
          images: {
            update: [
              {
                id: imageId,
                altText: "Updated alt text for test",
              },
            ],
          },
        },
        { headers: { "x-version": product.version } },
      );

      expect(status).toBe(200);
      expectDefined(data);
    });

    it("should create new variants successfully", async () => {
      const { product, category } = await setupProduct({
        attributeCount: 4,
        attributeValueCount: 2,
        variants: [
          {
            price: 1000,
            sku: "ADD-VAR-TEST",
            inventory: { quantity: 10 },
            attributeValueIds: [],
          },
        ],
        imagesCreate: [{ position: 0, file: file(filePath1) }],
      });

      const initialVariantCount = product.variants.length;

      const { data, status } = await api.products({ id: product.id }).patch(
        {
          variants: {
            update: [
              {
                id: product.variants[0]?.id as string,
                attributeValueIds: [
                  category.attributes[2]?.values[1]?.id as string,
                  category.attributes[3]?.values[1]?.id as string,
                ],
              },
            ],
            create: [
              {
                price: 1500,
                sku: "NEW-VARIANT-1",
                inventory: { quantity: 20 },
                attributeValueIds: [
                  category.attributes[2]?.values[0]?.id as string,
                  category.attributes[3]?.values[0]?.id as string,
                ],
              },
              {
                price: 20,
                sku: "NEW-VARIANT-2",
                inventory: { quantity: 25 },
                attributeValueIds: [
                  category.attributes[2]?.values[0]?.id as string,
                  category.attributes[3]?.values[1]?.id as string,
                ],
              },
            ],
          },
        },
        { headers: { "x-version": product.version } },
      );

      expect(status).toBe(200);
      expectDefined(data);
      expectDefined(data);
      expect(data.variants.length).toBe(initialVariantCount + 2);
    });

    it("should delete variants successfully", async () => {
      const { product, category } = await setupProduct({
        attributeCount: 2,
        attributeValueCount: 2,
        variants: [
          {
            price: 1000,
            inventory: { quantity: 10 },
            attributeValueIds: [],
          },
        ],
        imagesCreate: [{ position: 0, file: file(filePath1) }],
      });

      // Add a second variant with different attribute values
      const { data: patchedData } = await api
        .products({ id: product.id })
        .patch(
          {
            variants: {
              update: [
                {
                  id: product.variants[0]?.id as string,
                  attributeValueIds: [
                    category.attributes[0]?.values[1]?.id as string,
                  ],
                },
              ],
              create: [
                {
                  price: 1500,
                  inventory: { quantity: 15 },
                  attributeValueIds: [
                    category.attributes[0]?.values[0]?.id as string,
                  ],
                },
              ],
            },
          },
          { headers: { "x-version": product.version } },
        );
      expectDefined(patchedData);

      const allVariantIds = patchedData.variants.map((v) => v.id);
      const variantToDelete = allVariantIds[0] as string;

      const { data, status } = await api.products({ id: product.id }).patch(
        {
          variants: { delete: [variantToDelete] },
        },
        { headers: { "x-version": patchedData.version } },
      );

      expect(status).toBe(200);
      expectDefined(data);
    });

    it("should replace image file with update + file", async () => {
      const { product } = await setupProduct({
        attributeCount: 2,
        attributeValueCount: 2,
        variants: [
          {
            price: 1000,
            sku: "FILE-REP-TEST",
            inventory: { quantity: 10 },
            attributeValueIds: [],
          },
        ],
        imagesCreate: [{ position: 0, file: file(filePath1) }],
      });

      const [existingImage] = product.images;
      expectDefined(existingImage);

      const { data, status } = await api.products({ id: product.id }).patch(
        {
          images: {
            update: [{ id: existingImage.id, file: file(filePath1) }],
          },
        },
        { headers: { "x-version": product.version } },
      );

      expect(status).toBe(200);
      expectDefined(data);
    });

    it("should return proper category name on early exit (no changes)", async () => {
      const { product, category } = await setupProduct({
        attributeCount: 2,
        attributeValueCount: 2,
        variants: [
          {
            price: 1000,
            sku: "EARLY-EXIT-001",
            inventory: { quantity: 50 },
            attributeValueIds: [],
          },
        ],
        imagesCreate: [{ position: 0, file: file(filePath1) }],
      });

      const { data: patched, status: patchStatus } = await api
        .products({ id: product.id })
        .patch(
          {
            name: product.name,
            description: product.description,
          },
          { headers: { "x-version": product.version } },
        );

      expect(patchStatus).toBe(200);
      expectDefined(patched);
      expectDefined(patched.category);
      expect(patched.category).toHaveProperty("id");
      expect(patched.category).toHaveProperty("name");
      expect(patched.category.name).toBe(category.name);
      expect(patched.category.name).not.toBe("");
    });
  });
});

afterAll(() => expectNoDrift(testDb));
