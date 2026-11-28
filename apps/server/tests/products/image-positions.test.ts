import { afterAll, describe, expect, it } from "bun:test";

import { treaty } from "@elysia/eden";
import { productsRouter } from "@spice-world/server/modules/products";
import type * as ProductModel from "@spice-world/server/modules/products/model";
import { validateImages } from "@spice-world/server/modules/products/validators/images";

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
const setupProduct = createSetupProduct(testDb, api);
const filePath1 = `${import.meta.dir}/../public/cumin.webp`;
const filePath2 = `${import.meta.dir}/../public/curcuma.jpg`;

async function setup() {
  const result = await setupProduct({
    attributeCount: 2,
    attributeValueCount: 2,
    variants: [
      { price: 1000, inventory: { quantity: 10 }, attributeValueIds: [] },
    ],
    imagesCreate: [
      { position: 0, altText: "first", file: file(filePath1) },
      { position: 1, altText: "second", file: file(filePath2) },
      { position: 2, altText: "third", file: file(filePath1) },
    ],
  });
  const [first, second, third] = result.product.images;
  expectDefined(first);
  expectDefined(second);
  expectDefined(third);
  return { ...result, first, second, third };
}

async function expectUnchanged(
  product: Pick<ProductModel.productResult, "id" | "version" | "images">,
) {
  const { data } = await api.products({ id: product.id }).get();
  expect(data).toMatchObject({
    version: product.version,
    images: product.images,
  });
}

const order = (images: { altText: string | null; position: number }[]) =>
  images.map(({ altText, position }) => `${position}:${altText}`);

describe("Image positions", () => {
  it("creates images in the requested order, cover first", async () => {
    const { product } = await setup();
    expect(order(product.images)).toEqual(["0:first", "1:second", "2:third"]);
  });

  it.each([
    { positions: [0, 0], case: "duplicate" },
    { positions: [0, 2], case: "gap" },
    { positions: [1, 2], case: "no cover" },
  ])(
    "rejects creation with invalid positions: $case",
    async ({ positions }) => {
      const { category } = await setup();
      const name = `invalid positions ${randomLowerString()}`;
      const { status, error } = await api.products.post({
        name,
        description: "Invalid positions",
        status: "DRAFT",
        categoryId: category.id,
        stockMode: "VARIANT",
        variants: [
          { price: 1000, inventory: { quantity: 1 }, attributeValueIds: [] },
        ],
        images: positions.map((position) => ({
          position,
          file: file(filePath1),
        })),
      });
      expect(status).toBe(422);
      expect(error?.value).toMatchObject({
        type: "validation",
        property: "/images",
      });
      expect(
        await testDb.db.query.product.findFirst({ where: { name } }),
      ).toBeUndefined();
    },
  );

  it("rejects creation when position is omitted rather than defaulting it", async () => {
    const { category } = await setup();
    const image = { position: 0, file: file(filePath1) };
    Reflect.deleteProperty(image, "position");
    const name = `missing position ${randomLowerString()}`;
    const { status, error } = await api.products.post({
      name,
      description: "Missing required image field",
      status: "DRAFT",
      categoryId: category.id,
      stockMode: "VARIANT",
      variants: [
        { price: 1000, inventory: { quantity: 1 }, attributeValueIds: [] },
      ],
      images: [image],
    });
    expect(status).toBe(422);
    expect(error?.value).toMatchObject({ type: "validation" });
    expect(
      await testDb.db.query.product.findFirst({ where: { name } }),
    ).toBeUndefined();
  });

  it("keeps the order when PATCH only changes metadata or a file", async () => {
    const { product, first, second } = await setup();
    const { status, data } = await api.products({ id: product.id }).patch(
      {
        description: "Updated description",
        images: {
          update: [
            { id: first.id, altText: "first updated" },
            { id: second.id, file: file(filePath1) },
          ],
        },
      },
      { headers: { "x-version": product.version } },
    );
    expect(status).toBe(200);
    expectDefined(data);
    expect(order(data.images)).toEqual([
      "0:first updated",
      "1:second",
      "2:third",
    ]);
  });

  it("reorders images when every moved image gets its new position", async () => {
    const { product, first, second, third } = await setup();
    const { status, data } = await api.products({ id: product.id }).patch(
      {
        images: {
          update: [
            { id: third.id, position: 0 },
            { id: first.id, position: 1 },
            { id: second.id, position: 2 },
          ],
        },
      },
      { headers: { "x-version": product.version } },
    );
    expect(status).toBe(200);
    expectDefined(data);
    expect(order(data.images)).toEqual(["0:third", "1:first", "2:second"]);
  });

  it("rejects moving an image onto a taken position and saves nothing", async () => {
    const { product, third } = await setup();
    const { status, error } = await api.products({ id: product.id }).patch(
      {
        description: "Must not be saved",
        images: { update: [{ id: third.id, position: 0 }] },
      },
      { headers: { "x-version": product.version } },
    );
    expect(status).toBe(422);
    expect(error?.value).toMatchObject({ code: "INVALID_IMAGE_POSITIONS" });
    await expectUnchanged(product);
  });

  it("rejects deleting an image without closing the gap", async () => {
    const { product, first } = await setup();
    const { status, error } = await api
      .products({ id: product.id })
      .patch(
        { images: { delete: [first.id] } },
        { headers: { "x-version": product.version } },
      );
    expect(status).toBe(422);
    expect(error?.value).toMatchObject({ code: "INVALID_IMAGE_POSITIONS" });
    await expectUnchanged(product);
  });

  it("deletes the cover when the remaining images are explicitly shifted", async () => {
    const { product, first, second, third } = await setup();
    const { status, data } = await api.products({ id: product.id }).patch(
      {
        images: {
          delete: [first.id],
          update: [
            { id: second.id, position: 0 },
            { id: third.id, position: 1 },
          ],
        },
      },
      { headers: { "x-version": product.version } },
    );
    expect(status).toBe(200);
    expectDefined(data);
    expect(order(data.images)).toEqual(["0:second", "1:third"]);
  });

  it("inserts a new cover when the existing images are explicitly shifted", async () => {
    const { product, first, second, third } = await setup();
    const { status, data } = await api.products({ id: product.id }).patch(
      {
        images: {
          create: [{ position: 0, altText: "new", file: file(filePath2) }],
          update: [first, second, third].map(({ id }, index) => ({
            id,
            position: index + 1,
          })),
        },
      },
      { headers: { "x-version": product.version } },
    );
    expect(status).toBe(200);
    expectDefined(data);
    expect(order(data.images)).toEqual([
      "0:new",
      "1:first",
      "2:second",
      "3:third",
    ]);
  });

  it("rejects a position past the end of the gallery", async () => {
    const { product } = await setup();
    const { status, error } = await api
      .products({ id: product.id })
      .patch(
        { images: { create: [{ position: 4, file: file(filePath2) }] } },
        { headers: { "x-version": product.version } },
      );
    expect(status).toBe(422);
    expect(error?.value).toMatchObject({ code: "INVALID_IMAGE_POSITIONS" });
    await expectUnchanged(product);
  });

  it("rejects update and delete IDs belonging to another product", async () => {
    const { product } = await setup();
    const other = await setup();
    const results = await Promise.all([
      api
        .products({ id: product.id })
        .patch(
          { images: { update: [{ id: other.second.id, altText: "stolen" }] } },
          { headers: { "x-version": product.version } },
        ),
      api
        .products({ id: product.id })
        .patch(
          { images: { delete: [other.second.id] } },
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
            { id: second.id, position: 1 },
            { id: second.id, position: 2 },
          ],
        },
      },
      { headers: { "x-version": product.version } },
    );
    expect(status).toBe(422);
    expect(error?.value).toMatchObject({
      type: "validation",
      property: "/images",
    });
    await expectUnchanged(product);
  });

  it("validates without adding or rewriting image operations", () => {
    const imagesOps: ProductModel.imageOperations = {
      update: [{ id: "second", altText: "Updated text" }],
    };
    const currentImages = [
      { id: "first", position: 0 },
      { id: "second", position: 1 },
    ];
    const before = structuredClone({ imagesOps, currentImages });
    validateImages({ imagesOps, currentImages });
    expect({ imagesOps, currentImages }).toEqual(before);
  });

  it("keeps a valid order when two reorders race", async () => {
    const { product, first, second, third } = await setup();
    const results = await Promise.all(
      [second, third].map((cover) =>
        api.products({ id: product.id }).patch(
          {
            images: {
              update: [
                { id: cover.id, position: 0 },
                { id: first.id, position: cover.position },
              ],
            },
          },
          { headers: { "x-version": product.version } },
        ),
      ),
    );
    expect(
      results.map(({ status }) => status).toSorted((a, b) => a - b),
    ).toBeOneOf([
      [200, 409],
      [200, 422],
    ]);
    const { data } = await api.products({ id: product.id }).get();
    expectDefined(data);
    expect(data.version).toBe(product.version + 1);
    expect(data.images.map(({ position }) => position)).toEqual([0, 1, 2]);
  });

  describe("Image Validation Errors", () => {
    it("rejects an image both updated and deleted", async () => {
      const { product, first } = await setup();
      const { error } = await api.products({ id: product.id }).patch(
        {
          images: {
            update: [{ id: first.id, file: file(filePath2) }],
            delete: [first.id],
          },
        },
        { headers: { "x-version": product.version } },
      );
      expect(error).toMatchObject({
        status: 422,
        value: { type: "validation", property: "/images" },
      });
    });

    it("should throw error PRODUCT_IMAGE_REQUIRED when try delete all images", async () => {
      const { product, first, second, third } = await setup();
      const { error } = await api
        .products({ id: product.id })
        .patch(
          { images: { delete: [first.id, second.id, third.id] } },
          { headers: { "x-version": product.version } },
        );
      expect(error).toMatchObject({
        status: 400,
        value: {
          code: "IMAGES_VALIDATION_FAILED",
          details: { subErrors: [expect.objectContaining({ code: "PRODUCT_IMAGE_REQUIRED" })] },
        },
      });
    });
  });
});

afterAll(() => expectNoDrift(testDb));
