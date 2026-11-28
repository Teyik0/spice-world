import { defineRoute } from "@teyik0/furin";

import { Page } from "../../../../components/page";
import { api } from "../../../../lib/api";
import { ProductEditor } from "../components/product-editor";

export const route = defineRoute("/(dashboard)/products/new/")
  .config({ mode: "ssr" })
  .loader(async ({ headers: { cookie } }) => {
    const [categories, collections] = await Promise.all([
      api.categories.get({ query: { take: 100 }, headers: { cookie } }),
      api.collections.get({ headers: { cookie } }),
    ]);
    if (categories.error) {
      throw categories.error;
    }
    if (collections.error) {
      throw collections.error;
    }
    return { categories: categories.data, collections: collections.data };
  })
  .head(() => ({ meta: [{ title: "New Product — Spice World" }] }))
  .page(({ categories, collections }) => (
    <Page
      parents={[{ label: "Products", to: "/products" }]}
      title="New Product"
    >
      <ProductEditor
        initialCategories={categories}
        initialCollections={collections}
      />
    </Page>
  ));
