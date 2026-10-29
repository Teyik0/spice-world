import { t, type UnwrapSchema } from "elysia";
import { nameLowerPatternWithNumber } from "../shared";
import type { attributeValueService } from "./service";

export const postBody = t.Object({
  name: nameLowerPatternWithNumber,
});
export type postBody = UnwrapSchema<typeof postBody>;
export type postResult = typeof attributeValueService.post;

export const patchBody = postBody;
export type patchBody = UnwrapSchema<typeof postBody>;
export type patchResult = typeof attributeValueService.patch;

export type deleteResult = typeof attributeValueService.delete;
