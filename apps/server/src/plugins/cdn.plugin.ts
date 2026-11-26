import { Elysia, ElysiaStatus } from "elysia";

import { BYPASS_HEADER, CACHE_CONTROL, tag } from "../lib/cdn";

type Tags = (
  query: Record<string, unknown>,
  value: Record<string, unknown>,
) => string[] | undefined;

/**
 * The tags of a response the CDN may share, or `undefined` when it must not be shared.
 * A shared response must be the same for every user: a product one only when it is
 * restricted to published products, since admins also see the others.
 */
const kinds = {
  products: (query) =>
    query.status === "PUBLISHED" ? [tag.products] : undefined,
  product: (_, product) =>
    product.status === "PUBLISHED" &&
    typeof product.id === "string" &&
    typeof product.categoryId === "string"
      ? [tag.product(product.id), tag.category(product.categoryId)]
      : undefined,
  categories: () => [tag.categories],
  category: (_, category) =>
    typeof category.id === "string" ? [tag.category(category.id)] : undefined,
  attributes: () => [tag.attributes],
  attribute: (_, { id, category }) =>
    typeof id === "string" &&
    category instanceof Object &&
    "id" in category &&
    typeof category.id === "string"
      ? [tag.attribute(id), tag.category(category.id)]
      : undefined,
} satisfies Record<string, Tags>;

/** `cdn` lets the shared CDN keep a successful response, tagged for `purgeOnSuccess`. */
export const cdnPlugin = new Elysia({ name: "cdn" }).macro({
  cdn: (kind: keyof typeof kinds) => ({
    afterHandle({ query, request, responseValue, set }) {
      if (
        responseValue instanceof ElysiaStatus ||
        request.headers.has(BYPASS_HEADER)
      ) {
        return;
      }
      const tags = kinds[kind](
        query,
        responseValue instanceof Object ? { ...responseValue } : {},
      );
      if (!tags) {
        return;
      }
      set.headers["cache-control"] = CACHE_CONTROL;
      set.headers["vercel-cache-tag"] = tags.join(",");
      // keep the vary set by CORS: the cached body carries its allowed origin
      set.headers.vary = [set.headers.vary, BYPASS_HEADER]
        .filter(Boolean)
        .join(", ");
    },
  }),
});
