import type { Prisma } from "@prisma/client";
import { Elysia, t } from "elysia";
import prisma from "../libs/prisma";
import { ProductStatus } from "../prismabox/ProductStatus";

const SortField = t.Union([
  t.Literal("name"),
  t.Literal("createdAt"),
  t.Literal("updatedAt"),
  t.Literal("price"),
]);
const SortDirection = t.Union([t.Literal("asc"), t.Literal("desc")]);

export const productsRouter = new Elysia({
  name: "products",
  prefix: "/products",
  tags: ["Products"],
})
  .get(
    "/",
    async ({
      query: { skip, take, name, status, categories, sortBy, sortDir },
    }) => {
      let orderBy:
        | Prisma.ProductOrderByWithRelationInput
        | Prisma.ProductOrderByWithRelationInput[];

      const direction = sortDir || "asc";

      if (sortBy === "price") {
        // For price, we order by the minimum price of variants
        orderBy = {
          variants: {
            _count: direction,
          },
        };
      } else if (sortBy) {
        // For other fields, use direct ordering
        orderBy = { [sortBy]: direction };
      } else {
        // Default sorting
        orderBy = { name: "asc" };
      }

      return prisma.product.findMany({
        skip,
        take,
        distinct: ["id"],
        where: {
          status: {
            equals: status,
          },
          name: {
            contains: name,
          },
          ...(categories && categories.length > 0
            ? {
                category: {
                  name: {
                    in: categories,
                  },
                },
              }
            : {}),
        },
        orderBy,
        include: {
          category: true,
          images: true,
          variants: {
            include: {
              attributeValues: true,
            },
          },
          tags: true,
        },
      });
    },
    {
      query: t.Object({
        skip: t.Optional(t.Number({ default: 0 })),
        take: t.Optional(t.Number({ default: 25 })),
        name: t.Optional(t.String()),
        status: t.Optional(ProductStatus),
        categories: t.Optional(t.Array(t.String())),
        sortBy: t.Optional(SortField),
        sortDir: t.Optional(SortDirection),
      }),
    },
  )
  .get("/count", async () => prisma.product.count())
  .guard({ params: t.Object({ id: t.String({ format: "uuid" }) }) });
