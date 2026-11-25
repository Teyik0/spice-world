import { describe, expect, it } from "bun:test";

import { treaty } from "@elysia/eden";
import { productsRouter } from "@spice-world/server/modules/products";

import { testDb } from "../setup";
import {
  createSessionCookie,
  createTestCategory,
  expectDefined,
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
        variants: {
          create: [
            {
              price: 1000,
              sku: "DELETE-TEST-1",
              stock: 10,
              attributeValueIds: [
                categoryAttributes[0]?.values[0]?.id as string,
              ],
            },
          ],
        },
        images: {
          create: [
            { file: file(filePath1), isThumbnail: true },
            { file: file(filePath2), isThumbnail: false },
          ],
        },
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
      testDb.client.image.findMany({
        where: { id: { in: imageIds } },
      }),
      testDb.client.productVariant.findMany({
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
    expectDefined(error);
  });
});
