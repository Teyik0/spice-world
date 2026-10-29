import { expect, test } from "bun:test";
import { t } from "elysia";
import { standardSchema } from "./schema";

test("validates TypeBox 1 schemas with defaults and field paths", async () => {
  const schema = standardSchema(
    t.Object({
      email: t.String({ format: "email" }),
      rememberMe: t.Boolean({ default: false }),
    })
  );
  expect(
    await schema["~standard"].validate({ email: "user@example.com" })
  ).toEqual({
    value: { email: "user@example.com", rememberMe: false },
  });
  const invalid = await schema["~standard"].validate({ email: "invalid" });
  expect(invalid.issues).toEqual(
    expect.arrayContaining([expect.objectContaining({ path: ["email"] })])
  );
});
