import { t, type UnwrapSchema } from "elysia";
import { nameLowerPatternWithNumber, uuid } from "../shared";
import type { attributeValueService } from "./service";

export const postBody = t.Object({
  name: nameLowerPatternWithNumber,
});
export type postBody = UnwrapSchema<typeof postBody>;

export const patchBody = postBody;
export type patchBody = UnwrapSchema<typeof postBody>;
export type patchResult = typeof attributeValueService.patch;

export type deleteResult = typeof attributeValueService.delete;

export const attributeValueResult = t.Object({
  id: uuid,
  attributeId: uuid,
  value: nameLowerPatternWithNumber,
});
export type attributeValueResult = UnwrapSchema<typeof attributeValueResult>;
export const attributeValueNotFound = t.Object({
  code: t.Literal("ATTRIBUTE_VALUE_NOT_FOUND"),
  message: t.Literal("Attribute value not found"),
});
