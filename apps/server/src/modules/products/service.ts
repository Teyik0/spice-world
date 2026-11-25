import { db } from "@spice-world/server/lib/db";
import type { MultiSizeUploadData } from "@spice-world/server/lib/images";
import {
  claimUploads,
  enqueueImageCheck,
  uploadFiles,
} from "@spice-world/server/lib/images";
import {
  and,
  asc,
  desc,
  EmptyFilter,
  eq,
  getColumns,
  inArray,
  sql,
} from "drizzle-orm";
import { ElysiaStatus, problem, status } from "elysia";
import { LRUCache } from "lru-cache";

import {
  attributeValueToProductVariantTable,
  categoryTable,
  collectionProductTable,
  collectionTable,
  commentTable,
  imageTable,
  productTable,
  productVariantTable,
} from "../../../drizzle/schema";
import { categoryService } from "../categories/service";
import type { ExpectedVersion, uuidGuard } from "../shared";
import { uploadFileErrStatus } from "../shared";
import type * as ProductModel from "./model";
import { hasProductChanges } from "./validators/has-changes";
import { validateImages } from "./validators/images";
import { validatePublish } from "./validators/publish";
import {
  applyVariantOperations,
  validateVariantIds,
  validateVariants,
} from "./validators/variants";

/*
Examples ->

Product: "Organic Paprika Powder"
├─ id: "prod_002"
├─ slug: "organic-paprika-powder"
├─ description: "Sweet Hungarian paprika. Adds vibrant color and mild flavor."
├─ categoryId: "cat_spices_001" → Category: "Spices"
├─ status: "PUBLISHED"
├─ images: [
│   { url: "paprika.jpg", isThumbnail: true }
│  ]
└─ variants: [
    Variant 1:
    ├─ id: "variant_002a"
    ├─ price: €3.99
    ├─ sku: "PAP-50G-001"
    ├─ stock: 80
    ├─ currency: "EUR"
    └─ attributeValues: [
        { id: "val_50g", value: "50g" } → Attribute: "Weight"
       ]

    Variant 2:
    ├─ id: "variant_002b"
    ├─ price: €6.99
    ├─ sku: "PAP-100G-001"
    ├─ stock: 60
    ├─ currency: "EUR"
    └─ attributeValues: [
        { id: "val_100g", value: "100g" } → Attribute: "Weight"
       ]

    Variant 3:
    ├─ id: "variant_002c"
    ├─ price: €14.99
    ├─ sku: "PAP-250G-001"
    ├─ stock: 30
    ├─ currency: "EUR"
    └─ attributeValues: [
        { id: "val_250g", value: "250g" } → Attribute: "Weight"
       ]
   ]
*/

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];
type ProductKey = { id: string } | { slug: string };

const localCache = new LRUCache<string, ProductModel.productListItem[]>({
  max: 500,
  ttl: 1000 * 60 * 10,
  updateAgeOnGet: true,
});

let listingGeneration = 0;

export function invalidateProductListings() {
  listingGeneration += 1;
  localCache.clear();
}

async function find(
  {
    status: productStatus,
    ...key
  }: ProductKey & { status?: ProductModel.productStatus },
  tx: Tx | typeof db = db,
) {
  return await tx.query.product.findFirst({
    where: { ...key, status: productStatus ?? EmptyFilter },
    with: {
      category: {
        columns: { id: true, name: true },
        with: {
          attributes: {
            columns: { id: true, name: true },
            orderBy: { id: "asc" },
            with: {
              values: {
                columns: { id: true, value: true },
                orderBy: { id: "asc" },
              },
            },
          },
        },
      },
      images: { columns: { productId: false }, orderBy: { id: "asc" } },
      variants: {
        columns: {
          id: true,
          sku: true,
          price: true,
          currency: true,
          stock: true,
        },
        orderBy: { id: "asc" },
        with: {
          attributeValues: {
            columns: { id: true, value: true, attributeId: true },
            orderBy: { id: "asc" },
          },
        },
      },
    },
  });
}

/** Rules shared by patch and bulkPatch, checked on the state the change would leave. */
function validateChange({
  product,
  category,
  categoryChanged,
  requestedStatus,
  vOps,
  label,
}: {
  category: Parameters<typeof validateVariants>[0]["category"];
  categoryChanged: boolean;
  label?: string;
  product: {
    status: ProductModel.productStatus;
    variants: {
      id: string;
      price: number;
      attributeValues: { id: string }[];
    }[];
  };
  requestedStatus?: ProductModel.productStatus;
  vOps?: ProductModel.variantOperations;
}) {
  const states = product.variants.map(({ id, price, attributeValues }) => ({
    id,
    price,
    attributeValueIds: attributeValues.map((value) => value.id),
  }));
  const invalid =
    categoryChanged || vOps
      ? validateVariants({
          category,
          variants: applyVariantOperations(states, vOps),
          vOps,
          label,
        })
      : undefined;
  if (
    invalid ||
    (requestedStatus ?? product.status) !== "PUBLISHED" ||
    !(requestedStatus || categoryChanged || vOps)
  ) {
    return invalid;
  }
  return validatePublish({
    // The values of the old category do not apply to the new one.
    variants: applyVariantOperations(
      categoryChanged
        ? states.map((state) => ({ ...state, attributeValueIds: [] }))
        : states,
      vOps,
    ),
    categoryHasAttributes: category.attributes.length > 0,
    label,
  });
}

const slugOf = (name: string) => name.toLowerCase().replace(/\s+/gu, "-");

const uploadColumns = ({ thumb, medium, large }: MultiSizeUploadData) => ({
  keyThumb: thumb.key,
  urlThumb: thumb.ufsUrl,
  keyMedium: medium.key,
  urlMedium: medium.ufsUrl,
  keyLarge: large.key,
  urlLarge: large.ufsUrl,
});

async function insertImages(
  tx: Tx,
  product: { id: string; name: string },
  images: NonNullable<ProductModel.imageOperations["create"]>,
  uploads: MultiSizeUploadData[],
) {
  if (images.length) {
    await tx.insert(imageTable).values(
      images.map(({ altText, isThumbnail }, index) => ({
        ...uploadColumns(uploads[index] as MultiSizeUploadData),
        id: Bun.randomUUIDv7(),
        productId: product.id,
        altText: altText ?? `${product.name} image`,
        isThumbnail,
      })),
    );
  }
}

async function linkAttributeValues(
  tx: Tx,
  variants: { id: string; attributeValueIds?: string[] }[],
) {
  const links = variants.flatMap(({ id, attributeValueIds = [] }) =>
    attributeValueIds.map((valueId) => ({ a: valueId, b: id })),
  );
  if (links.length) {
    await tx.insert(attributeValueToProductVariantTable).values(links);
  }
}

async function unlinkAttributeValues(tx: Tx, variantIds: string[]) {
  await tx
    .delete(attributeValueToProductVariantTable)
    .where(inArray(attributeValueToProductVariantTable.b, variantIds));
}

async function insertVariants(
  tx: Tx,
  productId: string,
  variants: NonNullable<ProductModel.variantOperations["create"]>,
) {
  const rows = variants.map((variant) => ({
    ...variant,
    id: Bun.randomUUIDv7(),
    productId,
  }));
  if (rows.length) {
    await tx
      .insert(productVariantTable)
      .values(rows.map(({ attributeValueIds, ...row }) => row));
    await linkAttributeValues(tx, rows);
  }
}

export const productService = {
  productNotFound: problem("Not Found", {
    code: "PRODUCT_NOT_FOUND",
    message: "Product not found",
  }),

  versionConflict: problem("Conflict", {
    code: "VERSION_CONFLICT",
    message: "Product modified. Reload and retry.",
  }),

  async get(query: ProductModel.getQuery) {
    const cacheKey = JSON.stringify(query);
    const cached = localCache.get(cacheKey);
    if (cached) {
      return cached;
    }
    const generation = listingGeneration;
    const {
      name,
      skip,
      take,
      status: productStatus,
      categories,
      collection,
      sortBy,
      sortDir,
    } = query;

    const { price, stock, productId } = productVariantTable;
    const stats = db
      .select({
        priceMin: sql<
          number | null
        >`min(${price}) filter (where ${stock} > 0)`.as("priceMin"),
        priceMax: sql<
          number | null
        >`max(${price}) filter (where ${stock} > 0)`.as("priceMax"),
        totalStock: sql<number>`coalesce(sum(${stock}), 0)::int`.as(
          "totalStock",
        ),
      })
      .from(productVariantTable)
      .where(eq(productId, productTable.id))
      .as("stats");
    const thumbnail = db
      .select({ urlThumb: imageTable.urlThumb })
      .from(imageTable)
      .where(
        and(
          eq(imageTable.productId, productTable.id),
          eq(imageTable.isThumbnail, true),
        ),
      )
      .limit(1);

    const listing = db
      .select({
        ...getColumns(productTable),
        img: sql<string | null>`(${thumbnail})`,
        priceMin: stats.priceMin,
        priceMax: stats.priceMax,
        totalStock: stats.totalStock,
      })
      .from(productTable)
      .crossJoinLateral(stats)
      .where(
        and(
          productStatus && eq(productTable.status, productStatus),
          name
            ? sql`to_tsvector('french', ${productTable.name}) @@ plainto_tsquery('french', ${name})`
            : undefined,
          categories?.length
            ? inArray(
                productTable.categoryId,
                db
                  .select({ id: categoryTable.id })
                  .from(categoryTable)
                  .where(inArray(categoryTable.name, categories)),
              )
            : undefined,
        ),
      )
      .$dynamic();

    if (collection) {
      listing
        .innerJoin(
          collectionProductTable,
          eq(collectionProductTable.productId, productTable.id),
        )
        .innerJoin(
          collectionTable,
          and(
            eq(collectionTable.id, collectionProductTable.collectionId),
            eq(collectionTable.handle, collection),
          ),
        );
    }

    const sortColumns = {
      name: productTable.name,
      createdAt: productTable.createdAt,
      updatedAt: productTable.updatedAt,
      priceMin: stats.priceMin,
      priceMax: stats.priceMax,
      position: collectionProductTable.position,
    };
    // A collection is listed in its curated order unless a sort is requested.
    const sort = sortBy ?? (collection ? "position" : "name");
    const order = (sortDir === "desc" ? desc : asc)(sortColumns[sort]);
    const products = await listing
      .orderBy(
        sort === "priceMin" || sort === "priceMax"
          ? sql`${order} nulls last`
          : order,
        productTable.id,
      )
      .limit(take ?? 25)
      .offset(skip ?? 0);

    // Read before an invalidation: possibly stale, do not cache it.
    if (generation === listingGeneration) {
      localCache.set(cacheKey, products);
    }
    return products;
  },

  /** Newest first; only the author's display name leaves the server. */
  async getComments({
    id,
    skip,
    take,
    status: productStatus,
  }: uuidGuard & ProductModel.commentsQuery & ProductModel.countQuery) {
    const [comments, total, visible] = await Promise.all([
      db.query.comment.findMany({
        where: { productId: id },
        orderBy: { createdAt: "desc", id: "desc" },
        offset: skip,
        limit: take,
        columns: { id: true, text: true, createdAt: true },
        with: { user: { columns: { name: true } } },
      }),
      db.$count(commentTable, eq(commentTable.productId, id)),
      db.$count(
        productTable,
        and(
          eq(productTable.id, id),
          productStatus && eq(productTable.status, productStatus),
        ),
      ),
    ]);
    return visible ? { comments, total } : this.productNotFound;
  },

  async getById(query: uuidGuard & ProductModel.countQuery) {
    return (await find(query)) ?? this.productNotFound;
  },

  async getBySlug(query: { slug: string } & ProductModel.countQuery) {
    return (await find(query)) ?? this.productNotFound;
  },

  async count({ status: productStatus }: ProductModel.countQuery) {
    return await db.$count(
      productTable,
      productStatus && eq(productTable.status, productStatus),
    );
  },

  async post({
    name,
    status: requestedStatus,
    description,
    categoryId,
    variants: vOps,
    images: iOps,
  }: ProductModel.postBody) {
    const category = await categoryService.getById({ id: categoryId });
    if (category instanceof ElysiaStatus) {
      return category;
    }
    const variants = applyVariantOperations([], vOps);
    const invalid =
      validateVariants({ category, variants, vOps }) ??
      validateImages({ imagesOps: iOps }) ??
      (requestedStatus === "PUBLISHED"
        ? validatePublish({
            variants,
            categoryHasAttributes: category.attributes.length > 0,
          })
        : undefined);
    if (invalid) {
      return invalid;
    }
    if (await db.$count(productTable, eq(productTable.name, name))) {
      return problem("Conflict", {
        code: "PRODUCT_NAME_ALREADY_EXISTS",
        message: "A product with this name already exists",
      });
    }

    const { data: uploads, error } = await uploadFiles(
      name,
      iOps.create.map(({ file }) => file),
    );
    if (error || uploads?.length !== iOps.create.length) {
      return uploadFileErrStatus(error);
    }

    const id = Bun.randomUUIDv7();
    const product = await db.transaction(async (tx) => {
      await claimUploads(tx, uploads);
      await tx.insert(productTable).values({
        id,
        name,
        slug: slugOf(name),
        description,
        categoryId,
        status: requestedStatus,
      });
      await insertImages(tx, { id, name }, iOps.create, uploads);
      await insertVariants(tx, id, vOps.create);
      return await find({ id }, tx);
    });
    invalidateProductListings();
    return status("Created", product as ProductModel.productResult);
  },

  async patch({
    id,
    name,
    status: requestedStatus,
    description,
    categoryId,
    images: iOps,
    variants: vOps,
    expectedVersion,
  }: ProductModel.patchBody & uuidGuard & ExpectedVersion) {
    const current = await find({ id });
    if (!current) {
      return this.productNotFound;
    }
    if (current.version !== expectedVersion) {
      return this.versionConflict;
    }
    const invalidOperations =
      (iOps &&
        validateImages({ imagesOps: iOps, currentImages: current.images })) ??
      (vOps && validateVariantIds(current.variants, vOps));
    if (invalidOperations) {
      return invalidOperations;
    }
    if (
      !hasProductChanges({
        newData: { name, description, requestedStatus, categoryId, iOps, vOps },
        currentProduct: current,
      })
    ) {
      return current;
    }

    const categoryChanged =
      categoryId !== undefined && categoryId !== current.categoryId;
    const category = categoryChanged
      ? await categoryService.getById({ id: categoryId })
      : current.category;
    if (category instanceof ElysiaStatus) {
      return category;
    }
    const invalidChange = validateChange({
      product: current,
      category,
      categoryChanged,
      requestedStatus,
      vOps,
    });
    if (invalidChange) {
      return invalidChange;
    }

    const createdImages = iOps?.create ?? [];
    const updatedImages = iOps?.update ?? [];
    const replacedImages = updatedImages.flatMap(({ id: imageId, file }) =>
      file ? [{ id: imageId, file }] : [],
    );
    const files = [...createdImages, ...replacedImages].map(({ file }) => file);
    const { data: uploads, error } = files.length
      ? await uploadFiles(name ?? current.name, files)
      : { data: [], error: null };
    if (error || uploads?.length !== files.length) {
      return uploadFileErrStatus(error);
    }
    const replacements = new Map(
      replacedImages.map((image, index) => [
        image.id,
        uploads[createdImages.length + index] as MultiSizeUploadData,
      ]),
    );

    const createdVariants = vOps?.create ?? [];
    const updatedVariants = vOps?.update ?? [];
    const relinkedVariants = updatedVariants.filter(
      ({ attributeValueIds }) => attributeValueIds,
    );

    const outcome = await db.transaction(async (tx) => {
      const [updated] = await tx
        .update(productTable)
        .set({
          ...(name && { name, slug: slugOf(name) }),
          description,
          categoryId,
          status: requestedStatus,
          version: expectedVersion + 1,
        })
        .where(
          and(
            eq(productTable.id, id),
            eq(productTable.version, expectedVersion),
          ),
        )
        .returning({ id: productTable.id, name: productTable.name });
      // Everything above was validated against this version. Nothing written yet: safe to return.
      if (!updated) {
        return this.versionConflict;
      }

      if (uploads.length) {
        await claimUploads(tx, uploads);
      }
      const deletedImages = iOps?.delete ?? [];
      await enqueueImageCheck(
        tx,
        current.images
          .filter(
            (image) =>
              deletedImages.includes(image.id) || replacements.has(image.id),
          )
          .flatMap((image) => [
            image.keyThumb,
            image.keyMedium,
            image.keyLarge,
          ]),
      );
      if (deletedImages.length) {
        await tx
          .delete(imageTable)
          .where(inArray(imageTable.id, deletedImages));
      }
      await Promise.all(
        updatedImages.map(({ id: imageId, altText, isThumbnail }) => {
          const upload = replacements.get(imageId);
          return tx
            .update(imageTable)
            .set({
              ...(upload && uploadColumns(upload)),
              altText,
              isThumbnail,
              updatedAt: sql`CURRENT_TIMESTAMP`, // an update may only carry its id
            })
            .where(eq(imageTable.id, imageId));
        }),
      );
      await insertImages(tx, updated, createdImages, uploads);

      if (vOps?.delete?.length) {
        await tx
          .delete(productVariantTable)
          .where(inArray(productVariantTable.id, vOps.delete));
      }
      await Promise.all(
        updatedVariants.map(({ id: variantId, price, sku, stock, currency }) =>
          tx
            .update(productVariantTable)
            .set({
              price,
              sku,
              stock,
              currency,
              updatedAt: sql`CURRENT_TIMESTAMP`, // an update may only carry attribute values
            })
            .where(eq(productVariantTable.id, variantId)),
        ),
      );
      const unlinked = categoryChanged ? current.variants : relinkedVariants;
      if (unlinked.length) {
        await unlinkAttributeValues(
          tx,
          unlinked.map((variant) => variant.id),
        );
      }
      await linkAttributeValues(tx, relinkedVariants);
      await insertVariants(tx, id, createdVariants);

      return (await find({ id }, tx)) as ProductModel.productResult;
    });
    invalidateProductListings();
    return outcome;
  },

  async bulkPatch({
    ids,
    status: requestedStatus,
    categoryId,
  }: ProductModel.bulkPatchBody) {
    const category = categoryId
      ? await categoryService.getById({ id: categoryId })
      : undefined;
    if (category instanceof ElysiaStatus) {
      return category;
    }

    const outcome = await db.transaction(async (tx) => {
      const locked = await tx
        .select({ id: productTable.id })
        .from(productTable)
        .where(inArray(productTable.id, ids))
        .orderBy(productTable.id)
        .for("update");
      if (locked.length !== ids.length) {
        return this.productNotFound;
      }
      const products = await tx.query.product.findMany({
        where: { id: { in: ids } },
        columns: { id: true, name: true, categoryId: true, status: true },
        with: {
          category: {
            with: {
              attributes: {
                columns: { id: true },
                with: { values: { columns: { id: true } } },
              },
            },
          },
          variants: {
            columns: { id: true, price: true },
            with: { attributeValues: { columns: { id: true } } },
          },
        },
      });
      const movesCategory = (product: { categoryId: string }) =>
        categoryId !== undefined && categoryId !== product.categoryId;

      // Nothing is written unless every product passes.
      for (const product of products) {
        const invalid = validateChange({
          product,
          category: category ?? product.category,
          categoryChanged: movesCategory(product),
          requestedStatus,
          label: `Product "${product.name}": `,
        });
        if (invalid) {
          return invalid;
        }
      }

      await tx
        .update(productTable)
        .set({
          status: requestedStatus,
          categoryId,
          version: sql`${productTable.version} + 1`,
        })
        .where(inArray(productTable.id, ids));
      const movedVariants = products
        .filter(movesCategory)
        .flatMap(({ variants }) => variants);
      if (movedVariants.length) {
        await unlinkAttributeValues(
          tx,
          movedVariants.map((variant) => variant.id),
        );
      }
      return { count: products.length };
    });
    invalidateProductListings();
    return outcome;
  },

  async delete({ id }: uuidGuard) {
    const outcome = await db.transaction(async (tx) => {
      // Locked first: no image can be added before the cascade removes them.
      const [locked] = await tx
        .select({ id: productTable.id })
        .from(productTable)
        .where(eq(productTable.id, id))
        .for("update");
      if (!locked) {
        return this.productNotFound;
      }
      const images = await tx
        .delete(imageTable)
        .where(eq(imageTable.productId, id))
        .returning();
      await tx.delete(productTable).where(eq(productTable.id, id));
      await enqueueImageCheck(
        tx,
        images.flatMap((image) => [
          image.keyThumb,
          image.keyMedium,
          image.keyLarge,
        ]),
      );
      return status("OK");
    });
    invalidateProductListings();
    return outcome;
  },
};
