import type { StandardSchemaV1 } from "@standard-schema/spec";
import type { Static, TSchema } from "typebox";
import { Compile } from "typebox/compile";

const decode = (part: string) => part.replace(/~1/gu, "/").replace(/~0/gu, "~");
const pointer = (path: string) => path.split("/").slice(1).map(decode);

// TypeBox as a Standard Schema, for TanStack Form validators. A string `error`
// on the failing sub-schema (Elysia's convention) replaces TypeBox's message.
export function standardSchema<T extends TSchema>(
  schema: T,
): StandardSchemaV1<Static<T>> {
  const validator = Compile(schema);
  const message = (at: string[], fallback: string) => {
    const node = at.reduce<unknown>(
      (parent, key) => (parent as Record<string, unknown> | undefined)?.[key],
      schema,
    ) as { error?: unknown } | undefined;
    return typeof node?.error === "string" ? node.error : fallback;
  };
  return {
    "~standard": {
      version: 1,
      vendor: "typebox",
      validate(value) {
        if (validator.Check(value)) {
          return { value: value as Static<T> };
        }
        return {
          issues: validator.Errors(value).flatMap((issue) => {
            const path = pointer(issue.instancePath);
            const at = pointer(issue.schemaPath);
            if (issue.keyword !== "required") {
              return [{ message: message(at, issue.message), path }];
            }
            // TypeBox reports missing keys on the parent object: split them per field.
            const { requiredProperties } = issue.params as {
              requiredProperties: string[];
            };
            return requiredProperties.map((key) => ({
              message: message(
                [...at, "properties", key],
                `must have required property ${key}`,
              ),
              path: [...path, key],
            }));
          }),
        };
      },
    },
  };
}
