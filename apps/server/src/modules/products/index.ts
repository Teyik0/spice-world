import type { User } from "@spice-world/server/plugins/auth.plugin";
import {
  betterAuthPlugin,
  isAdmin,
} from "@spice-world/server/plugins/auth.plugin";
import { cdnPlugin } from "@spice-world/server/plugins/cdn.plugin";
import { drizzleErrorPlugin } from "@spice-world/server/plugins/drizzle.plugin";
import { furinInvalidate } from "@teyik0/furin";
import { Elysia, t } from "elysia";

import { imageCleanupPlugin } from "../../plugins/image.plugin";
import { uuidGuard, versionHeaders } from "../shared";
import * as ProductModel from "./model";
import { productService } from "./service";

const visibility = (user: User | null) =>
  isAdmin(user) ? {} : { status: "PUBLISHED" as const };

const publicItem = ({
  totalStock: _,
  ...item
}: ProductModel.productListItem): ProductModel.publicListItem => item;

const publicProduct = ({
  totalStock: _,
  variants,
  ...product
}: ProductModel.productResult): ProductModel.publicProductResult => ({
  ...product,
  variants: variants.map(
    ({ available: _available, inventory: _inventory, ...variant }) => variant,
  ),
});

export const productsRouter = new Elysia({
  name: "products",
  prefix: "/products",
  tags: ["Products"],
})
  .use(drizzleErrorPlugin)
  .use(imageCleanupPlugin)
  .use(betterAuthPlugin)
  .use(cdnPlugin)
  .use(furinInvalidate())
  .get(
    "/",
    {
      access: "optional",
      cdn: "products",
      query: ProductModel.getQuery,
      response: {
        200: t.Array(
          t.Union([ProductModel.productListItem, ProductModel.publicListItem]),
        ),
      },
    },
    async ({ query, user }) => {
      const products = await productService.get({
        ...query,
        ...(isAdmin(user) ? {} : { status: "PUBLISHED" }),
      });
      return isAdmin(user) ? products : products.map(publicItem);
    },
  )
  .get(
    "/count",
    { access: "optional", cdn: "products", query: ProductModel.countQuery },
    async ({ query, user }) =>
      await productService.count({ ...query, ...visibility(user) }),
  )
  .get(
    "/facets",
    {
      access: "admin",
      query: ProductModel.facetsQuery,
      response: { 200: ProductModel.facets },
    },
    async ({ query }) => await productService.facets(query),
  )
  .post(
    "/",
    {
      access: "admin",
      body: ProductModel.postBody,
      response: {
        201: ProductModel.productResult,
      },
      imageCleanup: true,
    },
    async ({ body }) => await productService.post(body),
  )
  .patch(
    "/bulk",
    {
      access: "admin",
      body: ProductModel.bulkPatchBody,
      response: {
        200: ProductModel.bulkPatchResult,
      },
    },
    async ({ body, invalidate }) => {
      invalidate("/products");
      return await productService.bulkPatch(body);
    },
  )
  .get(
    "/slug/:slug",
    {
      access: "optional",
      cdn: "product",
      response: {
        200: t.Union([
          ProductModel.productResult,
          ProductModel.publicProductResult,
        ]),
      },
    },
    async ({ params, user }) => {
      const product = await productService.getBySlug({
        ...params,
        ...visibility(user),
      });
      return product instanceof Error || isAdmin(user)
        ? product
        : publicProduct(product);
    },
  )
  .guard({ schema: "merge", params: uuidGuard })
  .get(
    "/:id",
    {
      access: "optional",
      response: {
        200: t.Union([
          ProductModel.productResult,
          ProductModel.publicProductResult,
        ]),
      },
    },
    async ({ params, user }) => {
      const product = await productService.getById({
        ...params,
        ...visibility(user),
      });
      return product instanceof Error || isAdmin(user)
        ? product
        : publicProduct(product);
    },
  )
  .get(
    "/:id/comments",
    {
      access: "optional",
      query: ProductModel.commentsQuery,
      response: {
        200: ProductModel.commentsResult,
      },
    },
    async ({ params, query, user }) =>
      await productService.getComments({
        ...params,
        ...query,
        ...visibility(user),
      }),
  )
  .patch(
    "/:id",
    {
      access: "admin",
      body: ProductModel.patchBody,
      headers: versionHeaders,
      response: {
        200: ProductModel.productResult,
      },
      imageCleanup: true,
    },
    async ({ params, body, headers, invalidate }) => {
      invalidate("/products");
      return await productService.patch({
        ...params,
        ...body,
        expectedVersion: headers["x-version"],
      });
    },
  )
  .delete(
    "/:id",
    {
      access: "admin",
      imageCleanup: true,
    },
    async ({ params, invalidate }) => {
      invalidate("/products");
      return await productService.delete(params);
    },
  );
