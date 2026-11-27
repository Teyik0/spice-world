import { defineRoute, notFound } from "@teyik0/furin";
import { t } from "elysia";

import { Observatoire } from "../../../components/observatoire";
import { api } from "../../../lib/api";

export const route = defineRoute("/produits/$slug/")
  .config({
    mode: "isr",
    revalidate: 600,
    tags: ["products"],
    params: t.Object({ slug: t.String() }),
  })
  .loader(async ({ params }) => {
    const { data, error } = await api.products
      .slug({ slug: params.slug })
      .get();
    if (error?.status === 404) {
      notFound();
    }
    if (error) {
      throw error;
    }
    // reviews are a bonus: the page renders without them if this call fails
    const { data: reviews } = await api
      .products({ id: data.id })
      .comments.get({ query: {} });
    return { product: data, reviews: reviews ?? { comments: [], total: 0 } };
  })
  .head(({ product }) => {
    const [image] = product.images; // ordered by position: the cover first
    const prices = product.variants.map((v) => v.price / 100);
    return {
      meta: [
        { title: `${product.name} — Spice World` },
        { name: "description", content: product.description },
        { property: "og:title", content: product.name },
        ...(image ? [{ property: "og:image", content: image.urlLarge }] : []),
        {
          "script:ld+json": {
            "@context": "https://schema.org",
            "@type": "Product",
            name: product.name,
            description: product.description,
            image: image?.urlLarge,
            ...(prices.length && {
              offers: {
                "@type": "AggregateOffer",
                priceCurrency: "EUR",
                lowPrice: Math.min(...prices),
                highPrice: Math.max(...prices),
              },
            }),
          },
        },
      ],
    };
  })
  .page(({ product, reviews }) => (
    <Observatoire product={product} reviews={reviews} />
  ));
