import { app } from "@spice-world/web/lib/elysia-server";
import type { SearchParams } from "nuqs/server";

import { productsSearchParamsCache, toProductsQuery } from "../search-params";
import { ProductsHydrator, ProductsSidebar } from "./products-sidebar";

export default async function ProductsSidebarSlot({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const params = productsSearchParamsCache.parse(await searchParams);
  const [{ data: products }, { data: categories }] = await Promise.all([
    app.products.get({ query: toProductsQuery(params) }),
    app.categories.get({ query: { take: 100 } }),
  ]);

  return (
    <ProductsHydrator initialProducts={products ?? []}>
      <ProductsSidebar categories={categories ?? []} />
    </ProductsHydrator>
  );
}
