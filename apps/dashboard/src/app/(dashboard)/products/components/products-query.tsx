import * as ProductModel from "@spice-world/server/modules/products/model";
import { uuid } from "@spice-world/server/modules/shared";
import { useNavigate, useRouter } from "@teyik0/furin/link";
import type { UnwrapSchema } from "elysia";
import { t } from "elysia";
import type { ReactNode } from "react";
import {
  createContext,
  use,
  useEffect,
  useOptimistic,
  useRef,
  useTransition,
} from "react";

export const productsQuery = t.Object(
  {
    ...t.Omit(ProductModel.getQuery, ["skip", "take", "collection"]).properties,
    edit: t.Optional(uuid),
  },
  { additionalProperties: false },
);
export type ProductsQuery = UnwrapSchema<typeof productsQuery>;

export const listQuery = ({ edit: _, ...filters }: ProductsQuery) => filters;

export const STATUSES = ProductModel.productStatus.anyOf.map((s) => s.const);

export const label = (value: string) =>
  value.charAt(0) + value.slice(1).toLowerCase();

function useOptimisticQuery(query: ProductsQuery) {
  const navigate = useNavigate();
  const [, startTransition] = useTransition();
  const [optimistic, setOptimistic] = useOptimistic(
    query,
    (state, patch: Partial<ProductsQuery>) => ({ ...state, ...patch }),
  );
  const latest = useRef(optimistic);
  useEffect(() => {
    latest.current = optimistic;
  });
  const update = (patch: Partial<ProductsQuery>) =>
    startTransition(async () => {
      setOptimistic(patch);
      await navigate({
        to: "/products",
        search: { ...latest.current, ...patch },
        replace: true,
      });
    });
  return [optimistic, update] as const;
}

const ProductsQueryContext = createContext<ReturnType<
  typeof useOptimisticQuery
> | null>(null);

export function ProductsQueryProvider({
  children,
  query,
}: {
  children: ReactNode;
  query: ProductsQuery;
}) {
  return (
    <ProductsQueryContext value={useOptimisticQuery(query)}>
      {children}
    </ProductsQueryContext>
  );
}

export function useProductsQuery() {
  const context = use(ProductsQueryContext);
  if (!context) {
    throw new Error(
      "useProductsQuery must be used within ProductsQueryProvider",
    );
  }
  return context;
}

export function usePrefetchQuery(query: ProductsQuery) {
  const { prefetch } = useRouter();
  return (patch: Partial<ProductsQuery>) =>
    prefetch({ to: "/products", search: { ...query, ...patch } });
}
