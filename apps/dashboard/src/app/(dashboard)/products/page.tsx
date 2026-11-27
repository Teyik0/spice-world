import { Await, defer, defineRoute } from "@teyik0/furin";
import { useRouter } from "@teyik0/furin/link";
import type { ReactNode } from "react";
import { Suspense } from "react";

import { Page } from "../../../components/page";
import { api } from "../../../lib/api";
import { QuickEditProvider } from "./components/product-quick-edit";
import {
  listQuery,
  productsQuery,
  ProductsQueryProvider,
} from "./components/products-query";
import {
  PAGE_SIZE,
  ProductsTable,
  ProductsTableSkeleton,
} from "./components/products-table";
import { ProductsToolbar } from "./components/products-toolbar";

export const route = defineRoute("/(dashboard)/products/")
  .config({ mode: "ssr", query: productsQuery, loaderDeps: listQuery })
  .loader(async ({ headers: { cookie }, query }) => {
    const products = (async () => {
      const { data, error } = await api.products.get.live({
        query: { ...listQuery(query), skip: 0, take: PAGE_SIZE },
        headers: { cookie },
      });
      if (error) {
        throw error;
      }
      return data;
    })();

    const { name, categories: picked, status, stock } = query;
    const [categories, facets] = await Promise.all([
      api.categories.get({ query: { take: 100 }, headers: { cookie } }),
      api.products.facets.get({
        query: { name, categories: picked, status, stock },
        headers: { cookie },
      }),
    ]);
    if (categories.error) {
      throw categories.error;
    }
    if (facets.error) {
      throw facets.error;
    }
    return defer({
      categories: categories.data,
      facets: facets.data,
      products,
    });
  })
  .head(() => ({ meta: [{ title: "Products — Spice World" }] }))
  .page(({ categories, facets, products, query }) => (
    <ProductsQueryProvider query={query}>
      <QuickEditProvider>
        <Page title="Products">
          <ProductsToolbar categories={categories} facets={facets} />

          <Pending>
            <Suspense
              fallback={<ProductsTableSkeleton />}
              key={JSON.stringify(listQuery(query))}
            >
              <Await resolve={products}>
                {() => (
                  <ProductsTable
                    categories={categories}
                    facets={facets}
                    query={query}
                  />
                )}
              </Await>
            </Suspense>
          </Pending>
        </Page>
      </QuickEditProvider>
    </ProductsQueryProvider>
  ));

function Pending({ children }: { children: ReactNode }) {
  const { isNavigating } = useRouter();
  return (
    <div
      aria-busy={isNavigating}
      className="transition-opacity aria-busy:opacity-60"
    >
      {children}
    </div>
  );
}
