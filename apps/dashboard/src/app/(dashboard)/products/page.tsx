import { Await, defer, defineRoute } from "@teyik0/furin";
import { Suspense } from "react";

import { api } from "../../../lib/api";
import { productsQuery } from "./components/products-query";
import {
  PAGE_SIZE,
  ProductsTable,
  ProductsTableSkeleton,
} from "./components/products-table";
import { ProductsToolbar } from "./components/products-toolbar";

export const route = defineRoute("/(dashboard)/products/")
  .config({ mode: "ssr", query: productsQuery })
  .loader(async ({ headers, query }) => {
    const client = api(headers.cookie);

    const products = (async () => {
      const { data, error } = await client.products.get({
        query: { ...query, take: PAGE_SIZE },
      });
      if (error) {
        throw error;
      }
      return data;
    })();

    const { data: categories, error } = await client.categories.get({
      query: { take: 100 },
    });
    if (error) {
      throw error;
    }
    return defer({ categories, products });
  })
  .head(() => ({ meta: [{ title: "Products — Spice World" }] }))
  .page(({ categories, products, query }) => (
    <>
      <header className="flex flex-col gap-1">
        <h1 className="text-2xl font-semibold tracking-tight">Products</h1>
        <p className="text-muted-foreground text-sm">
          Search, filter and edit the catalog.
        </p>
      </header>

      <ProductsToolbar categories={categories} query={query} />

      <Suspense
        fallback={<ProductsTableSkeleton />}
        key={JSON.stringify(query)}
      >
        <Await resolve={products}>
          {(initialData) => (
            <ProductsTable
              categories={categories}
              initialData={initialData}
              query={query}
            />
          )}
        </Await>
      </Suspense>
    </>
  ));
