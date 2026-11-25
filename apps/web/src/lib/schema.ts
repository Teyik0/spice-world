import type { StandardSchemaV1 } from "@standard-schema/spec";
import type { Static, TSchema } from "typebox";
import { Compile } from "typebox/compile";

export function standardSchema<T extends TSchema>(
  schema: T,
): StandardSchemaV1<Static<T>> {
  const validator = Compile(schema);
  return {
    "~standard": {
      version: 1 as const,
      vendor: "typebox",
      validate(value: unknown) {
        const input = validator.Default(value);
        if (validator.Check(input)) {
          return { value: input as Static<T> };
        }
        return {
          issues: validator.Errors(input).map(({ message, instancePath }) => ({
            message,
            path: instancePath
              .split("/")
              .slice(1)
              .map((part) => part.replace(/~1/gu, "/").replace(/~0/gu, "~")),
          })),
        };
      },
    },
  };
}
