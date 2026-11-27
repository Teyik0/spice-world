import { defineRoute, notFound } from "@teyik0/furin";
import { t } from "elysia";

import { Page } from "../../../../components/page";
import { api } from "../../../../lib/api";
import { ProductEditor } from "../components/product-editor";

export const route = defineRoute("/(dashboard)/products/$slug/")
  .config({ mode: "ssr", params: t.Object({ slug: t.String() }) })
  .loader(async ({ headers: { cookie }, params }) => {
    const [product, categories] = await Promise.all([
      api.products.slug(params).get({ headers: { cookie } }),
      api.categories.get({ query: { take: 100 }, headers: { cookie } }),
    ]);
    if (product.error) {
      if (product.error.status === 404) {
        notFound();
      }
      throw product.error;
    }
    if (categories.error) {
      throw categories.error;
    }
    return { categories: categories.data, product: product.data };
  })
  .head(({ product }) => ({
    meta: [{ title: `${product.name} — Spice World` }],
  }))
  .page(({ categories, product }) => (
    <Page
      parents={[{ label: "Products", to: "/products" }]}
      title={product.name}
    >
      <ProductEditor
        categories={categories}
        key={product.id}
        product={product}
      />
    </Page>
  ));
