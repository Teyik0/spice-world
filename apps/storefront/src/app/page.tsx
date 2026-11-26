import { defineRoute } from "@teyik0/furin";

import { Hero } from "../components/landing";
import { Vitrine } from "../components/vitrine";
import { api } from "../lib/api";

export const route = defineRoute("/")
  .config({ mode: "isr", revalidate: 600, tags: ["products"] })
  .loader(async () => {
    const { data, error } = await api.products.get({
      // the merchant picks and orders these jars in the "featured" collection
      query: { status: "PUBLISHED", collection: "featured", take: 12 },
    });
    if (error) {
      throw error;
    }
    return { products: data };
  })
  .head(() => ({
    meta: [
      { title: "Spice World — maison d’épices" },
      {
        name: "description",
        content:
          "Épices d’origine, à voir de près avant de les goûter. Formats, prix et disponibilités.",
      },
    ],
  }))
  .page(({ products }) => (
    <>
      <Hero products={products} />
      {products.length ? <Vitrine products={products} /> : null}
    </>
  ));
