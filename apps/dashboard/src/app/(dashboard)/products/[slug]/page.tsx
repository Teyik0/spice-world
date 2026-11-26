import { defineRoute, notFound } from "@teyik0/furin";
import { t } from "elysia";

import { Page } from "../../../../components/page";
import { api } from "../../../../lib/api";

export const route = defineRoute("/(dashboard)/products/$slug/")
  .config({ mode: "ssr", params: t.Object({ slug: t.String() }) })
  .loader(async ({ headers, params }) => {
    const { data, error } = await api(headers.cookie)
      .products.slug(params)
      .get();

    if (error) {
      if (error.status === 404) {
        notFound();
      }
      throw error;
    }
    return { product: data };
  })
  .head(({ product }) => ({
    meta: [{ title: `${product.name} — Spice World` }],
  }))
  .page(({ product }) => (
    <Page
      parents={[{ label: "Products", to: "/products" }]}
      title={product.name}
    >
      <h1 className="text-2xl font-semibold tracking-tight text-balance">
        {product.name}
      </h1>
    </Page>
  ));
