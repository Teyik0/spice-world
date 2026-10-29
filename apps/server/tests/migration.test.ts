import { expect, test } from "bun:test";
import { Elysia, t } from "elysia";
import { prismaErrorPlugin } from "../src/plugins/prisma.plugin";
import { PrismaClientKnownRequestError } from "../src/prisma/internal/prismaNamespace";
import "./setup";

const uploadApp = new Elysia().post(
  "/upload",
  {
    body: t.Object({ file: t.File({ type: "image/*" }) }),
  },
  ({ body }) => body.file.name
);

test("accepts an image upload and rejects text disguised as an image", async () => {
  const image = Bun.file(`${import.meta.dir}/public/cumin.webp`);
  const valid = new FormData();
  valid.set("file", new File([image], "cumin.webp", { type: "image/webp" }));
  expect(
    (await uploadApp.handle("/upload", { method: "POST", body: valid })).status
  ).toBe(200);
  const invalid = new FormData();
  invalid.set(
    "file",
    new File(["not an image"], "fake.png", { type: "image/png" })
  );
  expect(
    (await uploadApp.handle("/upload", { method: "POST", body: invalid }))
      .status
  ).toBe(422);
});

test("retains Prisma error codes after narrowing the error class", async () => {
  const app = new Elysia().use(prismaErrorPlugin("Product")).get("/", () => {
    throw new PrismaClientKnownRequestError("Missing record", {
      code: "P2025",
      clientVersion: "7.10.0",
    });
  });
  const response = await app.handle("/");
  expect(response.status).toBe(404);
  expect(await response.json()).toEqual({
    type: "about:blank",
    title: "Not Found",
    status: 404,
    message: "Product not found",
    code: "P2025",
  });
});
