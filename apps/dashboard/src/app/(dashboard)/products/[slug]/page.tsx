import { adminView } from "@spice-world/server/modules/products/model";
import { defineRoute, notFound } from "@teyik0/furin";
import { t } from "elysia";

import { Page } from "../../../../components/page";
import { api } from "../../../../lib/api";
import { ProductEditor } from "../components/product-editor";

export const route = defineRoute("/(dashboard)/products/$slug/")
  .config({ mode: "ssr", params: t.Object({ slug: t.String() }) })
  .loader(async ({ headers: { cookie }, params }) => {
    const [product, categories, collections] = await Promise.all([
      api.products.slug(params).get({ headers: { cookie } }),
      api.categories.get({ query: { take: 100 }, headers: { cookie } }),
      api.collections.get({ headers: { cookie } }),
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
    if (collections.error) {
      throw collections.error;
    }
    const current = categories.data.some(
      ({ id }) => id === product.data.categoryId,
    )
      ? undefined
      : await api
          .categories({ id: product.data.categoryId })
          .get({ headers: { cookie } });
    if (current?.error) {
      throw current.error;
    }
    return {
      categories: current
        ? [...categories.data, current.data]
        : categories.data,
      collections: collections.data,
      product: adminView(product.data),
    };
  })
  .head(({ product }) => ({
    meta: [{ title: `${product.name} — Spice World` }],
  }))
  .page(({ categories, collections, product }) => (
    <Page
      parents={[{ label: "Products", to: "/products" }]}
      title={product.name}
    >
      <ProductEditor
        initialCategories={categories}
        initialCollections={collections}
        key={product.id}
        product={product}
      />
    </Page>
  ));
