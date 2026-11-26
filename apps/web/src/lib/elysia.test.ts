import { expect, test } from "bun:test";

import { elysiaErrorToString } from "./elysia";
import { unknownError } from "./utils";

test("formats a caught Error", () => {
  expect(elysiaErrorToString(unknownError(new Error("Network failure")))).toBe(
    "Network failure",
  );
});

test("formats the fallback for a non-Error exception", () => {
  expect(
    elysiaErrorToString(unknownError(null, "Failed to update product")),
  ).toBe("Failed to update product");
});

test("formats an API error", () => {
  expect(elysiaErrorToString({ status: 404, value: "Product not found" })).toBe(
    "Product not found",
  );
});
