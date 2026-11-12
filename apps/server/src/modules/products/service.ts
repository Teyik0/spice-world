import { db } from "@spice-world/server/lib/db";
import {
  deleteUploads,
  type MultiSizeUploadData,
  uploadFiles,
  utapi,
} from "@spice-world/server/lib/images";
import { prisma } from "@spice-world/server/lib/prisma";
import type { Product } from "@spice-world/server/prisma/client";
import { type SQL, sql } from "bun";
import { eq } from "drizzle-orm";
import { status } from "elysia";
import { LRUCache } from "lru-cache";
import { commentTable } from "../../../drizzle/schema";
import { categoryService } from "../categories/service";
import { uploadFileErrStatus, type uuidGuard } from "../shared";
import type * as ProductModel from "./model";
import { setFinalStatus, type ValidationResults } from "./operations/status";
import { hasProductChanges } from "./validators/has-changes";
import { validateImages } from "./validators/images";
import {
  analyzeVariantOperations,
  determineStatus,
  type VariantAnalysis,
} from "./validators/patch";
import {
  validatePublishAttributeRequirements,
  validatePublishHasPositivePrice,
} from "./validators/publish";
import { validateSingleThumbnail } from "./validators/thumbnail";
import { validateVariants } from "./validators/variants";

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

// biome-ignore lint/suspicious/noExplicitAny: ok
const localCache = new LRUCache<string, any>({
  max: 500,
  ttl: 1000 * 60 * 10,
  updateAgeOnGet: true,
});

/**
 * Invalidate product listing cache entries by pattern matching.
 * Cache key format: products:{sortBy}:{sortDir}:{skip}:{take}:{name}:{status}:{categories}:{collection}
 *
 * @param options - Filter options for surgical invalidation
 * @param options.categoryIds - Invalidate entries containing these category IDs
 * @param options.statuses - Invalidate entries with these statuses
 *
 * If no options provided, clears entire cache (fallback for complex operations)
 */
export function invalidateProductListings(options?: {
  categoryIds?: string[];
  statuses?: string[];
}) {
  if (!(options && (options.categoryIds?.length || options.statuses?.length))) {
    localCache.clear();
    return;
  }

  // Get all cache keys
  const keysToDelete: string[] = [];

  for (const key of localCache.keys()) {
    if (!key.startsWith("products:")) {
      continue;
    }

    // Key format: products:{sortBy}:{sortDir}:{skip}:{take}:{name}:{status}:{categories}:{collection}
    const parts = key.split(":");
    const keyStatus = parts[6] ?? "";
    const keyCategories = parts[7] ?? "";

    let shouldInvalidate = false;

    // Invalidate if status matches or key has no status filter (affects all)
    if (
      options.statuses?.length &&
      (keyStatus === "" || options.statuses.includes(keyStatus))
    ) {
      shouldInvalidate = true;
    }

    // Invalidate if category matches or key has no category filter
    if (
      options.categoryIds?.length &&
      (keyCategories === "" ||
        options.categoryIds.some((catId) => keyCategories.includes(catId)))
    ) {
      shouldInvalidate = true;
    }

    if (shouldInvalidate) {
      keysToDelete.push(key);
    }
  }

  for (const key of keysToDelete) {
    localCache.delete(key);
  }
}

/** A collection is listed in its curated order unless a sort is requested. */
function collectionClauses(
  handle: string | undefined,
  sorted: boolean,
  orderBy: SQL.Query<unknown>
) {
  if (!handle) {
    return { join: sql``, orderBy };
  }
  return {
    join: sql`JOIN "CollectionProduct" cp ON cp."productId" = p.id
		JOIN "Collection" c ON c.id = cp."collectionId" AND c.handle = ${handle}`,
    orderBy: sorted ? orderBy : sql`cp.position`,
  };
}

export const productService = {
  async get({
    name,
    skip,
    take,
    status: productStatus,
    categories,
    collection,
    sortBy,
    sortDir,
  }: ProductModel.getQuery) {
    let categoriesArray: string[] | undefined;

    if (Array.isArray(categories)) {
      categoriesArray = categories;
    } else if (categories) {
      categoriesArray = [categories];
    }

    const cacheKey =
      `products:${sortBy ?? "default"}:${sortDir}:${skip}:${take}:` +
      `${name ?? ""}:${productStatus ?? ""}:${categoriesArray?.join(",") ?? ""}:` +
      `${collection ?? ""}`;

    type getProduct = Product & {
      img: string | null;
      priceMin: number | null;
      priceMax: number | null;
      totalStock: number;
    };

    if (localCache.has(cacheKey)) {
      return localCache.get(cacheKey) as getProduct[];
    }

    const direction = sortDir ?? "asc";
    const orderByField = sortBy ?? "name";

    const conditions: SQL.Query<unknown>[] = [];
    if (productStatus) {
      conditions.push(sql`p.status = ${productStatus}`);
    }
    if (name) {
      conditions.push(
        sql`to_tsvector('french', p.name) @@ plainto_tsquery('french', ${name})`
      );
    }
    if (categoriesArray?.length) {
      conditions.push(
        sql`p."categoryId" IN (SELECT id FROM "Category" WHERE name IN ${sql(categoriesArray)})`
      );
    }

    const whereClause =
      conditions.length > 0
        ? conditions.reduce(
            (prev, curr) => sql`${prev} AND ${curr}`,
            sql`WHERE ${conditions[0]}`
          )
        : sql``;

    const isPriceSort =
      orderByField === "priceMin" || orderByField === "priceMax";
    const byCollection = collectionClauses(
      collection,
      sortBy !== undefined,
      isPriceSort
        ? sql`v_agg.${sql(orderByField)}`
        : sql`p.${sql(orderByField)}`
    );
    const nullsClause = isPriceSort ? sql`NULLS LAST` : sql``;

    const orderDirection = direction === "asc" ? sql`ASC` : sql`DESC`;
    const offsetClause = skip === undefined ? sql`` : sql`OFFSET ${skip}`;
    const limitClause = take === undefined ? sql`` : sql`LIMIT ${take}`;

    const products = await sql<getProduct[]>`SELECT
			p.*,
			(SELECT "urlThumb" FROM "Image" WHERE "productId" = p.id AND "isThumbnail" = true LIMIT 1) AS "img",
			v_agg."priceMin",
			v_agg."priceMax",
			v_agg."totalStock"
		FROM "Product" p
		${byCollection.join}
		LEFT JOIN LATERAL (
			SELECT
				MIN(price) FILTER (WHERE stock > 0) AS "priceMin",
				MAX(price) FILTER (WHERE stock > 0) AS "priceMax",
				COALESCE(SUM(stock), 0)::int AS "totalStock"
			FROM "ProductVariant"
			WHERE "productId" = p.id
		) v_agg ON true
		${whereClause}
		ORDER BY ${byCollection.orderBy} ${orderDirection} ${nullsClause} ${limitClause} ${offsetClause}`;

    localCache.set(cacheKey, [...products]);
    return [...products];
  },

  /** Newest first; only the author's display name leaves the server. */
  async getComments({
    id,
    skip,
    take,
  }: uuidGuard & ProductModel.commentsQuery) {
    const [comments, total] = await Promise.all([
      db.query.comment.findMany({
        where: { productId: id },
        orderBy: { createdAt: "desc", id: "desc" },
        offset: skip,
        limit: take,
        columns: { id: true, text: true, createdAt: true },
        with: { user: { columns: { name: true } } },
      }),
      db.$count(commentTable, eq(commentTable.productId, id)),
    ]);
    return { comments, total };
  },

  async getById({ id }: uuidGuard) {
    return await prisma.product.findUniqueOrThrow({
      where: { id },
      include: {
        category: {
          include: { attributes: { include: { values: true } } },
        },
        images: {
          orderBy: { id: "asc" },
        },
        variants: {
          include: {
            attributeValues: true,
          },
        },
      },
    });
  },

  async getBySlug({ slug }: { slug: string }) {
    return await prisma.product.findUniqueOrThrow({
      where: { slug },
      include: {
        category: {
          include: { attributes: { include: { values: true } } },
        },
        images: {
          orderBy: { id: "asc" },
        },
        variants: {
          include: {
            attributeValues: true,
          },
        },
      },
    });
  },

  count({ status: productStatus }: ProductModel.countQuery) {
    const where = productStatus ? { status: productStatus } : {};
    return prisma.product.count({ where });
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
    if ("status" in category) {
      return category;
    }
    validateVariants({ vOps, category });
    validateSingleThumbnail({ imagesOps: iOps });

    const categoryHasAttributes = category.attributes.length > 0;

    let validationResults: ValidationResults = {
      priceValid: true,
      attributesValid: true,
    };

    if (requestedStatus === "PUBLISHED") {
      const priceResult = validatePublishHasPositivePrice({
        currentVariants: [],
        variantsToCreate: vOps.create,
      });
      const attrResult = validatePublishAttributeRequirements({
        categoryHasAttributes,
        currentVariants: [],
        variantsToCreate: vOps.create,
      });
      validationResults = {
        priceValid: priceResult.success,
        attributesValid: attrResult.success,
      };
    }

    const finalStatus = setFinalStatus({ requestedStatus, validationResults });

    const { data: uploadMap, error: uploadError } = await uploadFiles(
      name,
      iOps.create.map((img) => img.file)
    );
    if (uploadError || !uploadMap) {
      return uploadFileErrStatus(uploadError ?? "Unknown upload error");
    }

    try {
      const newProduct = await prisma.$transaction(async (tx) => {
        const product = await tx.product.create({
          data: {
            name,
            slug: name.toLowerCase().replace(/\s+/gu, "-"),
            description,
            status: finalStatus,
            categoryId,
            images: {
              createMany: {
                data: iOps.create.map((op, index) => {
                  const file = uploadMap[index] as MultiSizeUploadData;
                  return {
                    keyThumb: file.thumb.key,
                    keyMedium: file.medium.key,
                    keyLarge: file.large.key,
                    urlThumb: file.thumb.ufsUrl,
                    urlMedium: file.medium.ufsUrl,
                    urlLarge: file.large.ufsUrl,
                    altText: op.altText ?? `${name} image`,
                    isThumbnail: op.isThumbnail ?? false,
                  };
                }),
              },
            },
          },
          include: {
            category: true,
            images: true,
          },
        });

        // Create variants
        const createdVariants = await Promise.all(
          vOps.create.map((variant) =>
            tx.productVariant.create({
              data: {
                productId: product.id,
                price: variant.price,
                sku: variant.sku,
                stock: variant.stock ?? 0,
                currency: variant.currency ?? "EUR",
                attributeValues: {
                  connect: variant.attributeValueIds.map((id) => ({ id })),
                },
              },
              include: {
                attributeValues: true,
              },
            })
          )
        );

        return {
          ...product,
          variants: createdVariants,
        };
      });

      invalidateProductListings({
        categoryIds: [categoryId],
        statuses: [finalStatus],
      });

      return status("Created", newProduct);
    } catch (err: unknown) {
      if (uploadMap.length > 0) {
        await deleteUploads(uploadMap);
      }
      throw err;
    }
  },

  // biome-ignore lint/complexity/noExcessiveCognitiveComplexity: Keep dependent validation and writes together in this atomic product/category operation.
  async patch({
    id,
    name,
    status: requestedStatus,
    description,
    categoryId,
    images: iOps,
    variants: vOps,
    _version,
  }: ProductModel.patchBody & uuidGuard) {
    const currentProduct = await this.getById({ id });

    if (_version !== undefined && _version !== currentProduct.version) {
      throw status("Conflict", {
        message: `Product modified. Expected version ${_version}, current is ${currentProduct.version}`,
        code: "VERSION_CONFLICT",
      });
    }

    if (iOps) {
      validateImages({ imagesOps: iOps, currentImages: currentProduct.images });
      validateSingleThumbnail({
        imagesOps: iOps,
        currentImages: currentProduct.images,
      });
    }

    const hasProductChange = hasProductChanges({
      newData: { name, description, requestedStatus, categoryId, iOps, vOps },
      currentProduct,
    });
    if (!hasProductChange) {
      return currentProduct; // Early return - avoids validation, status computation, everything
    }

    const hasCategoryChanged =
      categoryId !== undefined && categoryId !== currentProduct.categoryId;
    const categoryChange = hasCategoryChanged
      ? await categoryService.getById({ id: categoryId })
      : null;
    if (categoryChange && "status" in categoryChange) {
      return categoryChange;
    }

    if (hasCategoryChanged || vOps) {
      validateVariants({
        category: categoryChange ?? currentProduct.category,
        vOps,
        currVariants: currentProduct.variants.map((v) => ({
          id: v.id,
          attributeValueIds: v.attributeValues.map((av) => av.id),
        })),
      });
    }

    // Analyze variant operations once - used by both status determination and attribute clearing
    const analysis: VariantAnalysis = analyzeVariantOperations(
      vOps,
      currentProduct.variants.map((v) => ({
        id: v.id,
        attributeValues: v.attributeValues,
      })),
      (categoryChange ?? currentProduct.category).attributes.length > 0,
      !!categoryChange // Flag if category is changing
    );

    // Determine final status using pre-computed analysis
    const { finalStatus } = determineStatus(
      { status: requestedStatus, variants: vOps },
      {
        category: currentProduct.category,
        variants: currentProduct.variants,
        status: currentProduct.status,
      },
      categoryChange,
      analysis
    );

    const oldKeysToDelete: string[] = [];

    // Step 1: Upload files BEFORE transaction - PARALLEL
    const productName = name ?? currentProduct.name;
    const [createUploads, updateUploads] = await Promise.all([
      iOps?.create?.length
        ? uploadFiles(
            productName,
            iOps.create.map((img) => img.file)
          )
        : Promise.resolve({ data: [] as MultiSizeUploadData[], error: null }),
      iOps?.update?.filter((op) => op.file)?.length
        ? uploadFiles(
            productName,
            iOps.update.filter((op) => op.file).map((op) => op.file as File)
          )
        : Promise.resolve({ data: [] as MultiSizeUploadData[], error: null }),
    ]);

    // Handle upload errors
    if (createUploads.error || updateUploads.error) {
      const allSuccessful = [
        ...(createUploads.data ?? []),
        ...(updateUploads.data ?? []),
      ];
      if (allSuccessful.length > 0) {
        await deleteUploads(allSuccessful);
      }
      return uploadFileErrStatus({
        message: [createUploads.error, updateUploads.error]
          .filter(Boolean)
          .join(", "),
      });
    }

    const updateOpsWithFiles = iOps?.update?.filter((op) => op.file) ?? [];

    try {
      // biome-ignore lint/complexity/noExcessiveCognitiveComplexity: Keep dependent validation and writes together in this atomic product/category operation.
      const product = await prisma.$transaction(async (tx) => {
        // 1. Update product (must be first - needed for image altText fallback)
        const updatedProduct = await tx.product.update({
          where: { id },
          data: {
            ...(name && {
              name,
              slug: name.toLowerCase().replace(/\s+/gu, "-"),
            }),
            ...(description !== undefined && { description }),
            status: finalStatus,
            ...(categoryId && {
              category: { connect: { id: categoryId } },
            }),
            version: { increment: 1 },
          },
          include: {
            category: true,
          },
        });

        // The product update locks the row; reject image operations validated against a stale version.
        if (iOps && updatedProduct.version !== currentProduct.version + 1) {
          throw status("Conflict", {
            message:
              "Product modified while updating images. Reload and retry.",
            code: "VERSION_CONFLICT",
          });
        }

        // 2. Parallel execution of independent operations
        const operationPromises: Promise<unknown>[] = [];

        // Image operations
        if (iOps) {
          // Delete images
          if (iOps.delete && iOps.delete.length > 0) {
            operationPromises.push(
              (async () => {
                const oldImages = await tx.image.findMany({
                  where: { id: { in: iOps.delete } },
                  select: { keyThumb: true, keyMedium: true, keyLarge: true },
                });
                await tx.image.deleteMany({
                  where: { id: { in: iOps.delete } },
                });
                oldKeysToDelete.push(
                  ...oldImages.flatMap((i) => [
                    i.keyThumb,
                    i.keyMedium,
                    i.keyLarge,
                  ])
                );
              })()
            );
          }

          // Create new images
          if (iOps.create && iOps.create.length > 0 && createUploads.data) {
            operationPromises.push(
              tx.image.createMany({
                data: iOps.create.map((op, index) => {
                  // biome-ignore lint/style/noNonNullAssertion: ok
                  const file = createUploads.data![
                    index
                  ] as MultiSizeUploadData;
                  return {
                    keyThumb: file.thumb.key,
                    keyMedium: file.medium.key,
                    keyLarge: file.large.key,
                    urlThumb: file.thumb.ufsUrl,
                    urlMedium: file.medium.ufsUrl,
                    urlLarge: file.large.ufsUrl,
                    altText: op.altText ?? `${updatedProduct.name} image`,
                    isThumbnail: op.isThumbnail ?? false,
                    productId: id,
                  };
                }),
              })
            );
          }

          // Update images - optimized with updateMany for thumbnail-only updates
          if (iOps.update && iOps.update.length > 0) {
            const updates = iOps.update; // Capture for TypeScript
            operationPromises.push(
              (async () => {
                // Separate thumbnail-only updates (no file, no altText) from complex updates
                const thumbnailOnlyUpdates = updates.filter(
                  (op) =>
                    op.isThumbnail !== undefined && !op.file && !op.altText
                );
                const complexUpdates = updates.filter(
                  (op) => op.file || op.altText
                );

                // Batch update thumbnails only - single query for all
                if (thumbnailOnlyUpdates.length > 0) {
                  await Promise.all(
                    thumbnailOnlyUpdates.map((op) =>
                      tx.image.update({
                        where: { id: op.id },
                        data: { isThumbnail: op.isThumbnail },
                      })
                    )
                  );
                }

                // Complex updates (with file upload or altText change)
                if (complexUpdates.length > 0) {
                  const currentImages = await Promise.all(
                    complexUpdates.map((op) =>
                      tx.image.findUnique({ where: { id: op.id } })
                    )
                  );

                  await Promise.all(
                    // biome-ignore lint/complexity/noExcessiveCognitiveComplexity: Keep dependent validation and writes together in this atomic product/category operation.
                    complexUpdates.map((op, index) => {
                      const currentImage = currentImages[index];
                      if (!currentImage) {
                        throw new Error(`Image not found: ${op.id}`);
                      }

                      const uploadIndex = updateOpsWithFiles.findIndex(
                        (uop) => uop.id === op.id
                      );
                      const uploaded =
                        uploadIndex !== -1 && updateUploads.data
                          ? updateUploads.data[uploadIndex]
                          : null;

                      if (uploaded) {
                        oldKeysToDelete.push(
                          currentImage.keyThumb,
                          currentImage.keyMedium,
                          currentImage.keyLarge
                        );
                      }

                      return tx.image.update({
                        where: { id: op.id },
                        data: uploaded
                          ? {
                              keyThumb: uploaded.thumb.key,
                              keyMedium: uploaded.medium.key,
                              keyLarge: uploaded.large.key,
                              urlThumb: uploaded.thumb.ufsUrl,
                              urlMedium: uploaded.medium.ufsUrl,
                              urlLarge: uploaded.large.ufsUrl,
                              altText: op.altText ?? currentImage.altText,
                              isThumbnail:
                                op.isThumbnail ?? currentImage.isThumbnail,
                            }
                          : {
                              altText: op.altText ?? currentImage.altText,
                              isThumbnail:
                                op.isThumbnail ?? currentImage.isThumbnail,
                            },
                      });
                    })
                  );
                }
              })()
            );
          }
        }

        // Variant operations (independent from images)
        if (vOps) {
          if (vOps.delete && vOps.delete.length > 0) {
            operationPromises.push(
              tx.productVariant.deleteMany({
                where: { id: { in: vOps.delete }, productId: id },
              })
            );
          }

          if (vOps.update && vOps.update.length > 0) {
            operationPromises.push(
              Promise.all(
                vOps.update.map((variant) =>
                  tx.productVariant.update({
                    where: { id: variant.id },
                    data: {
                      ...(variant.price !== undefined && {
                        price: variant.price,
                      }),
                      ...(variant.sku !== undefined && { sku: variant.sku }),
                      ...(variant.stock !== undefined && {
                        stock: variant.stock,
                      }),
                      ...(variant.currency !== undefined && {
                        currency: variant.currency,
                      }),
                      ...(variant.attributeValueIds !== undefined && {
                        attributeValues: {
                          set: variant.attributeValueIds.map((aid) => ({
                            id: aid,
                          })),
                        },
                      }),
                    },
                    include: { attributeValues: true },
                  })
                )
              )
            );
          }

          if (vOps.create && vOps.create.length > 0) {
            const createPromises = vOps.create.map(async (variant) => {
              const created = await tx.productVariant.create({
                data: {
                  productId: id,
                  price: variant.price,
                  sku: variant.sku,
                  stock: variant.stock ?? 0,
                  currency: variant.currency ?? "EUR",
                  attributeValues: {
                    connect: variant.attributeValueIds.map((aid) => ({
                      id: aid,
                    })),
                  },
                },
                include: { attributeValues: true },
              });
              return created;
            });
            operationPromises.push(Promise.all(createPromises));
          }
        }

        // Execute all independent operations in parallel
        await Promise.all(operationPromises);

        // 3. Clear attributeValues if category changed (depends on variant operations above)
        if (hasCategoryChanged && !analysis.isProperlyReconfigured) {
          const variants = await tx.productVariant.findMany({
            where: { productId: id },
            select: { id: true },
          });

          await Promise.all(
            variants.map((v) =>
              tx.productVariant.update({
                where: { id: v.id },
                data: { attributeValues: { set: [] } },
              })
            )
          );
        }

        // 4. Fetch and return updated product
        const [updatedVariants, updatedImages] = await Promise.all([
          tx.productVariant.findMany({
            where: { productId: id },
            include: { attributeValues: true },
          }),
          tx.image.findMany({ where: { productId: id } }),
        ]);

        return {
          ...updatedProduct,
          variants: updatedVariants,
          images: updatedImages,
        };
      });

      if (oldKeysToDelete.length > 0) {
        await utapi.deleteFiles(oldKeysToDelete);
      }

      invalidateProductListings({
        categoryIds: [product.categoryId],
        statuses: [product.status],
      });

      // Refetch product to include all updates
      const updatedProduct = await prisma.product.findUnique({
        where: { id: product.id },
        include: {
          category: true,
          images: true,
          variants: {
            include: { attributeValues: true },
          },
        },
      });

      if (!updatedProduct) {
        throw new Error(`Product ${product.id} not found after update`);
      }

      return updatedProduct;
    } catch (err: unknown) {
      // Clean up orphaned files if transaction fails
      const allUploaded = [
        ...(createUploads.data ?? []),
        ...(updateUploads.data ?? []),
      ];
      if (allUploaded.length > 0) {
        await deleteUploads(allUploaded);
      }
      throw err;
    }
  },

  async bulkPatch({
    ids,
    status: requestedStatus,
    categoryId,
  }: ProductModel.bulkPatchBody) {
    localCache.clear();

    // If requesting PUBLISHED, validate each product first
    if (requestedStatus === "PUBLISHED") {
      const products = await prisma.product.findMany({
        where: { id: { in: ids } },
        include: {
          variants: {
            include: { attributeValues: true },
          },
          category: {
            include: { attributes: true },
          },
        },
      });

      for (const product of products) {
        const categoryHasAttributes = product.category.attributes.length > 0;
        const variantsData = product.variants.map((v) => ({
          id: v.id,
          price: v.price,
          attributeValueIds: v.attributeValues.map((av) => av.id),
        }));

        // PUB1
        const priceResult = validatePublishHasPositivePrice({
          currentVariants: variantsData,
        });

        if (!priceResult.success) {
          throw status("Bad Request", {
            message: `Product "${product.name}": ${priceResult.error.message}`,
            code: "PUB1",
          });
        }

        // PUB2
        const attrResult = validatePublishAttributeRequirements({
          categoryHasAttributes,
          currentVariants: variantsData,
        });

        if (!attrResult.success) {
          throw status("Bad Request", {
            message: `Product "${product.name}": ${attrResult.error.message}`,
            code: "PUB2",
          });
        }
      }
    }

    return prisma.$transaction(async (tx) => {
      const result = await tx.product.updateMany({
        where: { id: { in: ids } },
        data: {
          ...(requestedStatus && { status: requestedStatus }),
          ...(categoryId && { categoryId }),
        },
      });

      if (categoryId) {
        const variants = await tx.productVariant.findMany({
          where: { productId: { in: ids } },
          select: { id: true },
        });

        await Promise.all(
          variants.map((v) =>
            tx.productVariant.update({
              where: { id: v.id },
              data: { attributeValues: { set: [] } },
            })
          )
        );
      }

      return result;
    });
  },

  async delete({ id }: uuidGuard) {
    const deletedProduct = await prisma.product.delete({
      where: { id },
      include: { images: true },
    });

    invalidateProductListings({
      categoryIds: [deletedProduct.categoryId],
      statuses: [deletedProduct.status],
    });

    return deletedProduct;
  },
};
