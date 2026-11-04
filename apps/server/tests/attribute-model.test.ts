import { describe, expect, test } from "bun:test";
import { Check } from "typebox/value";
import { postResult } from "../src/modules/attributes/model";

const createResult = (): postResult => {
  const id = Bun.randomUUIDv7();
  return {
    id,
    name: "couleur",
    category: {
      id: Bun.randomUUIDv7(),
      name: "épices",
      imageId: Bun.randomUUIDv7(),
    },
    values: [{ id: Bun.randomUUIDv7(), attributeId: id, value: "rouge" }],
  };
};

describe.concurrent("Attribute postResult schema", () => {
  test("accepts the nested service response", () => {
    expect(Check(postResult, createResult())).toBe(true);
  });

  test("rejects invalid nested IDs and empty values", () => {
    const result = createResult();
    expect(Check(postResult, { ...result, values: [] })).toBe(false);
    expect(
      Check(postResult, {
        ...result,
        category: { ...result.category, id: "bad" },
      })
    ).toBe(false);
    expect(
      Check(postResult, {
        ...result,
        values: [{ ...result.values[0], attributeId: "bad" }],
      })
    ).toBe(false);
  });
});
