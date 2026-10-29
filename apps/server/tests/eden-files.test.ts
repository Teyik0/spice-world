import { expect, test } from "bun:test";
import { createRequire } from "node:module";
import { treaty } from "@elysia/eden";
import { Elysia, t } from "elysia";

const require = createRequire(import.meta.url);
const clients = [
  ["ESM", treaty],
  ["CommonJS", require("@elysia/eden").treaty as typeof treaty],
  ["CommonJS subpath", require("@elysia/eden/treaty2").treaty as typeof treaty],
] as const;

const file = new File(
  [
    Buffer.from(
      "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a9X8AAAAASUVORK5CYII=",
      "base64"
    ),
  ],
  "pixel.png",
  { type: "image/png" }
);

test.each(clients)(
  "%s: Treaty preserves nested files, sibling fields, and file contents",
  async (_format, createClient) => {
    const app = new Elysia().post(
      "/upload",
      {
        body: t.Object({
          images: t.Object({
            create: t.Array(
              t.Object({
                file: t.File({ type: "image/*" }),
                title: t.String(),
                isThumbnail: t.Boolean(),
                rank: t.Number(),
              })
            ),
            delete: t.Array(t.String()),
          }),
          metadata: t.Object({ label: t.String() }),
        }),
      },
      async ({ body }) => ({
        names: body.images.create.map(
          ({ file: receivedFile }) => receivedFile.name
        ),
        contents: await Promise.all(
          body.images.create.map(async ({ file: receivedFile }) =>
            Buffer.from(await receivedFile.arrayBuffer()).toString("base64")
          )
        ),
        titles: body.images.create.map(({ title }) => title),
        thumbnails: body.images.create.map(({ isThumbnail }) => isThumbnail),
        ranks: body.images.create.map(({ rank }) => rank),
        deleted: body.images.delete,
        metadata: body.metadata,
      })
    );
    const { status, data } = await createClient(app).upload.post({
      images: {
        create: [
          { file, title: "First", isThumbnail: true, rank: 1 },
          { file, title: "Second", isThumbnail: false, rank: 2 },
        ],
        delete: ["old"],
      },
      metadata: { label: "Product" },
    });
    expect(status).toBe(200);
    expect(data).toEqual({
      names: [file.name, file.name],
      contents: new Array(2).fill(
        Buffer.from(await file.arrayBuffer()).toString("base64")
      ),
      titles: ["First", "Second"],
      thumbnails: [true, false],
      ranks: [1, 2],
      deleted: ["old"],
      metadata: { label: "Product" },
    });
  }
);

test("Treaty preserves JSON bodies and top-level file arrays", async () => {
  const app = new Elysia()
    .post(
      "/json",
      { body: t.Object({ value: t.Object({ count: t.Number() }) }) },
      ({ body, request }) => ({
        body,
        type: request.headers.get("content-type"),
      })
    )
    .post(
      "/files",
      { body: t.Object({ files: t.Files({ type: "image/*" }) }) },
      ({ body }) => body.files.map((receivedFile) => receivedFile.name)
    );
  const api = treaty(app);
  const json = await api.json.post({ value: { count: 2 } });
  expect(json.status).toBe(200);
  expect(json.data).toEqual({
    body: { value: { count: 2 } },
    type: "application/json",
  });
  const files = await api.files.post({ files: [file, file] });
  expect(files.status).toBe(200);
  expect(files.data).toEqual([file.name, file.name]);
});

test("Product schema accepts nested thumbnail booleans and reaches the handler", async () => {
  const ProductModel = await import("../src/modules/products/model");
  const app = new Elysia().post(
    "/products",
    { body: ProductModel.postBody },
    ({ body, status }) => {
      expect(body.images.create[0]?.isThumbnail).toBe(true);
      expect(body.variants.create[0]?.price).toBe(899);
      return status(404, { message: "Category not found" });
    }
  );
  const result = await treaty(app).products.post({
    name: "invalid category product",
    description: "Product with non-existent category",
    categoryId: "00000000-0000-0000-0000-000000000000",
    status: "PUBLISHED",
    variants: {
      create: [
        { price: 899, sku: "invalidtest", stock: 20, attributeValueIds: [] },
      ],
    },
    images: { create: [{ isThumbnail: true, file }] },
  });
  expect(result.status).toBe(404);
});
