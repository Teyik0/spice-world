import * as ProductModel from "@spice-world/server/modules/products/model";
import { useNavigate, useRouter } from "@teyik0/furin/link";
import type { UnwrapSchema } from "elysia";
import { t } from "elysia";

export const productsQuery = t.Omit(ProductModel.getQuery, [
  "skip",
  "take",
  "collection",
]);
export type ProductsQuery = UnwrapSchema<typeof productsQuery>;

export const STATUSES = ProductModel.productStatus.anyOf.map((s) => s.const);

export const label = (value: string) =>
  value.charAt(0) + value.slice(1).toLowerCase();

export function useUpdateQuery(query: ProductsQuery) {
  const navigate = useNavigate();
  return (patch: Partial<ProductsQuery>) =>
    navigate({
      to: "/products",
      search: { ...query, ...patch },
      replace: true,
    });
}

export function usePrefetchQuery(query: ProductsQuery) {
  const { prefetch } = useRouter();
  return (patch: Partial<ProductsQuery>) =>
    prefetch({ to: "/products", search: { ...query, ...patch } });
}
