import { afterAll, describe, expect, it } from "bun:test";

import { treaty } from "@elysia/eden";
import { productsRouter } from "@spice-world/server/modules/products";

import { testDb } from "../setup";
import {
  createSessionCookie,
  createTestCategory,
  expectDefined,
  expectNoDrift,
  file,
  mockUtapi,
} from "../utils/helper";

await mockUtapi();
const api = treaty(productsRouter, {
  headers: { cookie: await createSessionCookie(testDb) },
});

describe.concurrent("DELETE /products/:id - Integration Tests", () => {
  const filePath1 = `${import.meta.dir}/../public/cumin.webp`;
  const filePath2 = `${import.meta.dir}/../public/curcuma.jpg`;

  it("should delete a product successfully", async () => {
    const category = await createTestCategory({ testDb, attributeCount: 1 });
    expectDefined(category);

    const categoryAttributes = category.attributes;

    const { data: createdProduct, status: createStatus } =
      await api.products.post({
        name: "product to delete",
        description: "This product will be deleted",
        categoryId: category.id,
        status: "DRAFT",
        stockMode: "VARIANT",
        variants: [
          {
            price: 1000,
            sku: "DELETE-TEST-1",
            inventory: { quantity: 10 },
            attributeValueIds: [categoryAttributes[0]?.values[0]?.id as string],
          },
        ],
        images: [
          { file: file(filePath1), position: 0 },
          { file: file(filePath2), position: 1 },
        ],
      });

    expect(createStatus).toBe(201);
    expectDefined(createdProduct);

    const imageIds = createdProduct.images.map((img) => img.id);
    const variantIds = createdProduct.variants.map((v) => v.id);

    const { data, status } = await api
      .products({ id: createdProduct.id })
      .delete();

    expect(status).toBe(200);
    expectDefined(data);
    expect(data).toBe("OK");

    const { data: deletedProduct, status: getStatus } = await api
      .products({ id: createdProduct.id })
      .get();
    expect(getStatus).toBe(404);
    expect(deletedProduct).toBeNull();

    const [images, variants] = await Promise.all([
      testDb.db.query.image.findMany({ where: { id: { in: imageIds } } }),
      testDb.db.query.productVariant.findMany({
        where: { id: { in: variantIds } },
      }),
    ]);

    expect(images).toEqual([]);
    expect(variants).toEqual([]);
  });

  it("should return an error if the product ID does not exist", async () => {
    const { status, error } = await api
      .products({ id: crypto.randomUUID() })
      .delete();

    expect(status).toBe(404);
    expect(error).toMatchObject({ value: { code: "PRODUCT_NOT_FOUND" } });
  });
});

afterAll(() => expectNoDrift(testDb));
