import { afterAll, describe, expect, it } from "bun:test";

import { treaty } from "@elysia/eden";
import { db } from "@spice-world/server/lib/db";
import { productsRouter } from "@spice-world/server/modules/products";

import { commentTable, userTable } from "../../drizzle/schema";
import { testDb } from "../setup";
import {
  createSessionCookie,
  createSetupProduct,
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

describe.concurrent("GET /products/:id/comments", () => {
  /** A product with `count` comments, the i-th one written i minutes after the epoch. */
  const productWithComments = async (count: number) => {
    const { product } = await createSetupProduct(
      testDb,
      api,
    )({
      attributeCount: 1,
      attributeValueCount: 1,
      variants: [
        {
          price: 1000,
          sku: crypto.randomUUID(),
          inventory: { quantity: 1 },
          attributeValueIds: [],
        },
      ],
      imagesCreate: [
        {
          position: 0,
          file: file(`${import.meta.dir}/../public/cumin.webp`),
        },
      ],
    });
    const now = new Date();
    const [user] = await db
      .insert(userTable)
      .values({
        id: randomLowerString(16),
        name: "Awa",
        email: `${randomLowerString()}@test.dev`,
        updatedAt: now,
      })
      .returning();
    expectDefined(user);
    if (count) {
      await db.insert(commentTable).values(
        Array.from({ length: count }, (_, i) => ({
          id: crypto.randomUUID(),
          text: `avis ${i}`,
          productId: product.id,
          userId: user.id,
          createdAt: new Date(i * 60_000),
          updatedAt: now,
        })),
      );
    }
    return product;
  };

  it("returns the 15 newest comments first, with the total", async () => {
    const product = await productWithComments(20);
    const { data, status } = await api
      .products({ id: product.id })
      .comments.get({ query: {} });

    expect(status).toBe(200);
    expectDefined(data);
    expect(data.total).toBe(20);
    expect(data.comments).toHaveLength(15);
    expect(data.comments[0]).toMatchObject({
      text: "avis 19",
      user: { name: "Awa" },
    });
    expect(Object.keys(data.comments[0] ?? {}).sort()).toEqual([
      "createdAt",
      "id",
      "text",
      "user",
    ]);
  });

  it("pages with skip", async () => {
    const product = await productWithComments(20);
    const { data } = await api
      .products({ id: product.id })
      .comments.get({ query: { skip: 15 } });

    expectDefined(data);
    expect(data.comments.map((c) => c.text)).toEqual([
      "avis 4",
      "avis 3",
      "avis 2",
      "avis 1",
      "avis 0",
    ]);
  });

  it("returns an empty page for a product without comments", async () => {
    const product = await productWithComments(0);
    const { data } = await api
      .products({ id: product.id })
      .comments.get({ query: {} });

    expect(data).toEqual({ comments: [], total: 0 });
  });

  it("rejects a non-uuid id", async () => {
    const { status } = await api
      .products({ id: "nope" })
      .comments.get({ query: {} });

    expect(status).toBe(422);
  });
});

afterAll(() => expectNoDrift(testDb));
