import * as ProductModel from "@spice-world/server/modules/products/model";
import type { UnwrapSchema } from "elysia";
import { t } from "elysia";

export const productsQuery = t.Omit(ProductModel.getQuery, [
  "skip",
  "take",
  "collection",
]);
export type ProductsQuery = UnwrapSchema<typeof productsQuery>;

export const STATUSES = ProductModel.productStatus.anyOf.map((s) => s.const);
