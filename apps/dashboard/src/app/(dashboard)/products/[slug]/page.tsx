import { defineRoute, notFound } from "@teyik0/furin";
import { Link } from "@teyik0/furin/link";
import { t } from "elysia";
import { ChevronLeftIcon } from "lucide-react";

import { api } from "../../../../lib/api";

export const route = defineRoute("/(dashboard)/products/$slug/")
  .config({ mode: "ssr", params: t.Object({ slug: t.String() }) })
  .loader(async ({ headers, params }) => {
    const { data, error } = await api(headers.cookie)
      .products.slug(params)
      .get();

    if (error) {
      switch (error.status) {
        case 404:
          notFound();
        default:
          throw error;
      }
    }
    return { product: data };
  })
  .head(({ product }) => ({
    meta: [{ title: `${product.name} — Spice World` }],
  }))
  .page(({ product }) => (
    <header className="flex flex-col gap-2">
      <Link
        className="text-muted-foreground hover:text-foreground flex w-fit items-center gap-1 text-sm"
        to="/products"
      >
        <ChevronLeftIcon aria-hidden="true" className="size-4" />
        Products
      </Link>
      <h1 className="text-2xl font-semibold tracking-tight text-balance">
        {product.name}
      </h1>
    </header>
  ));
