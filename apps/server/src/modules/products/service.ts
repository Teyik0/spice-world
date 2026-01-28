import { and, eq, inArray } from "drizzle-orm";
import { sql } from "bun";
import { status } from "elysia";
import { LRUCache } from "lru-cache";
import type { UploadedFileData } from "uploadthing/types";
import {
	db,
	product,
	image,
	productVariant,
	productVariantsToAttributeValues,
	type Product,
} from "@spice-world/server/db";
import { uploadFiles, utapi } from "@spice-world/server/lib/images";
import { NotFoundError } from "@spice-world/server/plugins/db.plugin";
import type { CategoryModel } from "../categories/model";
import { categoryService } from "../categories/service";
import { uploadFileErrStatus, type uuidGuard } from "../shared";
import type { ProductModel } from "./model";
import { setFinalStatus, type ValidationResults } from "./operations/status";
import { ensureSingleThumbnail } from "./operations/thumbnail";
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
 * Cache key format: products:{sortBy}:{sortDir}:{skip}:{take}:{name}:{status}:{categories}
 *
 * @param options - Filter options for surgical invalidation
 * @param options.categoryIds - Invalidate entries containing these category IDs
 * @param options.statuses - Invalidate entries with these statuses
 *
 * If no options provided, clears entire cache (fallback for complex operations)
 */
function invalidateProductListings(options?: {
	categoryIds?: string[];
	statuses?: string[];
}) {
	if (!options || (!options.categoryIds?.length && !options.statuses?.length)) {
		localCache.clear();
		return;
	}

	// Get all cache keys
	const keysToDelete: string[] = [];

	for (const key of localCache.keys()) {
		if (!key.startsWith("products:")) continue;

		// Key format: products:{sortBy}:{sortDir}:{skip}:{take}:{name}:{status}:{categories}
		const parts = key.split(":");
		const keyStatus = parts[6] ?? "";
		const keyCategories = parts[7] ?? "";

		let shouldInvalidate = false;

		// Invalidate if status matches or key has no status filter (affects all)
		if (options.statuses?.length) {
			if (keyStatus === "" || options.statuses.includes(keyStatus)) {
				shouldInvalidate = true;
			}
		}

		// Invalidate if category matches or key has no category filter
		if (options.categoryIds?.length) {
			if (
				keyCategories === "" ||
				options.categoryIds.some((catId) => keyCategories.includes(catId))
			) {
				shouldInvalidate = true;
			}
		}

		if (shouldInvalidate) {
			keysToDelete.push(key);
		}
	}

	for (const key of keysToDelete) {
		localCache.delete(key);
	}
}

export const productService = {
	async get({
		name,
		skip,
		take,
		status,
		categories,
		sortBy,
		sortDir,
	}: ProductModel.getQuery) {
		const cacheKey =
			`products:${sortBy ?? "default"}:${sortDir}:${skip}:${take}:` +
			`${name ?? ""}:${status ?? ""}:${categories?.join(",") ?? ""}`;

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

		const conditions = [];
		if (status) conditions.push(sql`p.status = ${status}`);
		if (name)
			conditions.push(
				sql`to_tsvector('french', p.name) @@ plainto_tsquery('french', ${name})`,
			);
		if (categories?.length) {
			conditions.push(
				sql`p."categoryId" IN (SELECT id FROM "Category" WHERE name IN ${sql(categories)})`,
			);
		}

		const whereClause =
			conditions.length > 0
				? conditions.reduce(
						(prev, curr) => sql`${prev} AND ${curr}`,
						sql`WHERE ${conditions[0]}`,
					)
				: sql``;

		const isPriceSort =
			orderByField === "priceMin" || orderByField === "priceMax";
		const orderByClause = isPriceSort
			? sql`v_agg.${sql(orderByField)}`
			: sql`p.${sql(orderByField)}`;
		const nullsClause = isPriceSort ? sql`NULLS LAST` : sql``;

		const orderDirection = direction === "asc" ? sql`ASC` : sql`DESC`;
		const offsetClause = skip !== undefined ? sql`OFFSET ${skip}` : sql``;
		const limitClause = take !== undefined ? sql`LIMIT ${take}` : sql``;

		const products = await sql<getProduct[]>`SELECT
			p.*,
			(SELECT url FROM "Image" WHERE "productId" = p.id AND "isThumbnail" = true LIMIT 1) AS "img",
			v_agg."priceMin",
			v_agg."priceMax",
			v_agg."totalStock"
		FROM "Product" p
		LEFT JOIN LATERAL (
			SELECT
				MIN(price) FILTER (WHERE stock > 0) AS "priceMin",
				MAX(price) FILTER (WHERE stock > 0) AS "priceMax",
				COALESCE(SUM(stock), 0)::int AS "totalStock"
			FROM "ProductVariant"
			WHERE "productId" = p.id
		) v_agg ON true
		${whereClause}
		ORDER BY ${orderByClause} ${orderDirection} ${nullsClause} ${limitClause} ${offsetClause}`;

		localCache.set(cacheKey, [...products]);
		return [...products];
	},

	async getById({ id }: uuidGuard) {
		const result = await db.query.product.findFirst({
			where: eq(product.id, id),
			with: {
				category: {
					with: { attributes: { with: { values: true } } },
				},
				images: true,
				variants: {
					with: {
						attributeValues: {
							with: {
								attributeValue: true,
							},
						},
					},
				},
			},
		});

		if (!result) {
			throw new NotFoundError("Product");
		}

		// Transform the nested attributeValues structure to match Prisma's format
		return {
			...result,
			variants: result.variants.map((v) => ({
				...v,
				attributeValues: v.attributeValues.map((av) => av.attributeValue),
			})),
		};
	},

	async getBySlug({ slug }: { slug: string }) {
		const result = await db.query.product.findFirst({
			where: eq(product.slug, slug),
			with: {
				category: true,
				images: true,
				variants: {
					with: {
						attributeValues: {
							with: {
								attributeValue: true,
							},
						},
					},
				},
			},
		});

		if (!result) {
			throw new NotFoundError("Product");
		}

		// Transform the nested attributeValues structure to match Prisma's format
		return {
			...result,
			variants: result.variants.map((v) => ({
				...v,
				attributeValues: v.attributeValues.map((av) => av.attributeValue),
			})),
		};
	},

	async count({ status: productStatus }: ProductModel.countQuery) {
		const result = await db.query.product.findMany({
			where: productStatus ? eq(product.status, productStatus) : undefined,
			columns: { id: true },
		});
		return result.length;
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
		validateVariants({ vOps, category });
		ensureSingleThumbnail({ imagesOps: iOps });

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
			iOps.create.map((img) => img.file),
		);
		if (uploadError || !uploadMap) {
			return uploadFileErrStatus({ message: uploadError });
		}

		try {
			// Create product
			const [newProduct] = await db
				.insert(product)
				.values({
					name,
					slug: name.toLowerCase().replace(/\s+/g, "-"),
					description,
					status: finalStatus,
					categoryId,
				})
				.returning();

			if (!newProduct) {
				throw new Error("Failed to create product");
			}

			// Create images
			if (iOps.create.length > 0) {
				await db.insert(image).values(
					iOps.create.map((op, index) => {
						const file = uploadMap[index] as UploadedFileData;
						return {
							key: file.key,
							url: file.ufsUrl,
							altText: op.altText ?? `${name} image`,
							isThumbnail: op.isThumbnail ?? false,
							productId: newProduct.id,
						};
					}),
				);
			}

			// Create variants with attributeValues
			const createdVariants = [];
			for (const variant of vOps.create) {
				const [newVariant] = await db
					.insert(productVariant)
					.values({
						productId: newProduct.id,
						price: variant.price,
						sku: variant.sku,
						stock: variant.stock ?? 0,
						currency: variant.currency ?? "EUR",
					})
					.returning();

				if (newVariant && variant.attributeValueIds.length > 0) {
					await db.insert(productVariantsToAttributeValues).values(
						variant.attributeValueIds.map((avId) => ({
							A: avId,
							B: newVariant.id,
						})),
					);
				}

				// Fetch variant with attributeValues
				const variantWithAttrs = await db.query.productVariant.findFirst({
					where: eq(productVariant.id, newVariant!.id),
					with: {
						attributeValues: {
							with: { attributeValue: true },
						},
					},
				});

				if (variantWithAttrs) {
					createdVariants.push({
						...variantWithAttrs,
						attributeValues: variantWithAttrs.attributeValues.map(
							(av) => av.attributeValue,
						),
					});
				}
			}

			// Fetch created product with relations
			const createdProduct = await db.query.product.findFirst({
				where: eq(product.id, newProduct.id),
				with: {
					category: true,
					images: true,
				},
			});

			invalidateProductListings({
				categoryIds: [categoryId],
				statuses: [finalStatus],
			});

			return status("Created", {
				...createdProduct,
				variants: createdVariants,
			});
		} catch (err: unknown) {
			if (uploadMap.length > 0) {
				await utapi.deleteFiles(uploadMap.map((file) => file.key));
			}
			throw err;
		}
	},

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

		const hasProductChange = hasProductChanges({
			newData: { name, description, requestedStatus, categoryId, iOps, vOps },
			currentProduct,
		});
		if (!hasProductChange) return currentProduct; // Early return - avoids validation, status computation, everything

		if (iOps) {
			validateImages({
				imagesOps: iOps,
				currentImages: currentProduct.images,
			});
			ensureSingleThumbnail({
				imagesOps: iOps,
				currentImages: currentProduct.images,
			});
		}

		const hasCategoryChanged =
			categoryId !== undefined && categoryId !== currentProduct.categoryId;
		const categoryChange = hasCategoryChanged
			? await categoryService.getById({ id: categoryId })
			: null;

		if (hasCategoryChanged || vOps) {
			validateVariants({
				category:
					categoryChange ??
					(currentProduct.category as CategoryModel.getByIdResult),
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
			!!categoryChange, // Flag if category is changing
		);

		// Determine final status using pre-computed analysis
		const { finalStatus } = determineStatus(
			{ status: requestedStatus, variants: vOps },
			{
				category: currentProduct.category as CategoryModel.getByIdResult,
				variants: currentProduct.variants,
				status: currentProduct.status,
			},
			categoryChange,
			analysis,
		);

		const oldKeysToDelete: string[] = [];

		// Step 1: Upload files BEFORE transaction - PARALLEL
		const productName = name ?? currentProduct.name;
		const [createUploads, updateUploads] = await Promise.all([
			iOps?.create?.length
				? uploadFiles(
						productName,
						iOps.create.map((img) => img.file),
					)
				: Promise.resolve({ data: [], error: null }),
			iOps?.update?.filter((op) => op.file)?.length
				? uploadFiles(
						productName,
						iOps.update.filter((op) => op.file).map((op) => op.file as File),
					)
				: Promise.resolve({ data: [], error: null }),
		]);

		// Handle upload errors
		if (createUploads.error || updateUploads.error) {
			const allSuccessful = [
				...(createUploads.data ?? []),
				...(updateUploads.data ?? []),
			];
			if (allSuccessful.length > 0) {
				await utapi.deleteFiles(allSuccessful.map((f) => f.key));
			}
			return uploadFileErrStatus({
				message: [createUploads.error, updateUploads.error]
					.filter(Boolean)
					.join(", "),
			});
		}

		const updateOpsWithFiles = iOps?.update?.filter((op) => op.file) ?? [];

		try {
			// 1. Update product
			const [updatedProduct] = await db
				.update(product)
				.set({
					...(name && {
						name,
						slug: name.toLowerCase().replace(/\s+/g, "-"),
					}),
					...(description !== undefined && { description }),
					status: finalStatus,
					...(categoryId && { categoryId }),
					version: currentProduct.version + 1,
				})
				.where(eq(product.id, id))
				.returning();

			if (!updatedProduct) {
				throw new NotFoundError("Product");
			}

			// 2. Handle image operations
			if (iOps) {
				// Delete images
				if (iOps.delete && iOps.delete.length > 0) {
					const oldImages = await db.query.image.findMany({
						where: inArray(image.id, iOps.delete),
						columns: { key: true },
					});
					await db.delete(image).where(inArray(image.id, iOps.delete));
					oldKeysToDelete.push(...oldImages.map((i) => i.key));
				}

				// Create new images
				if (iOps.create && iOps.create.length > 0) {
					await db.insert(image).values(
						iOps.create.map((op, index) => {
							// biome-ignore lint/style/noNonNullAssertion: already checked at upload time
							const file = createUploads.data![index] as UploadedFileData;
							return {
								key: file.key,
								url: file.ufsUrl,
								altText: op.altText ?? `${updatedProduct.name} image`,
								isThumbnail: op.isThumbnail ?? false,
								productId: id,
							};
						}),
					);
				}

				// Update images
				if (iOps.update && iOps.update.length > 0) {
					const currentImages = await db.query.image.findMany({
						where: inArray(
							image.id,
							iOps.update.map((op) => op.id),
						),
					});

					for (const op of iOps.update) {
						const currentImage = currentImages.find((i) => i.id === op.id);
						if (!currentImage) throw new Error(`Image not found: ${op.id}`);

						// biome-ignore lint/style/noNonNullAssertion: already checked at upload time
						const uploaded = updateUploads.data!.find(
							(_, i) => updateOpsWithFiles[i]?.id === op.id,
						);

						await db
							.update(image)
							.set(
								uploaded
									? {
											key: uploaded.key,
											url: uploaded.ufsUrl,
											altText: op.altText ?? currentImage.altText,
											isThumbnail: op.isThumbnail ?? currentImage.isThumbnail,
										}
									: {
											altText: op.altText ?? currentImage.altText,
											isThumbnail: op.isThumbnail ?? currentImage.isThumbnail,
										},
							)
							.where(eq(image.id, op.id));
					}
				}
			}

			// 3. Handle variant operations
			if (vOps) {
				// Delete variants
				if (vOps.delete && vOps.delete.length > 0) {
					await db
						.delete(productVariant)
						.where(
							and(
								inArray(productVariant.id, vOps.delete),
								eq(productVariant.productId, id),
							),
						);
				}

				// Update variants
				if (vOps.update && vOps.update.length > 0) {
					for (const variant of vOps.update) {
						await db
							.update(productVariant)
							.set({
								...(variant.price !== undefined && { price: variant.price }),
								...(variant.sku !== undefined && { sku: variant.sku }),
								...(variant.stock !== undefined && { stock: variant.stock }),
								...(variant.currency !== undefined && {
									currency: variant.currency,
								}),
							})
							.where(eq(productVariant.id, variant.id));

						// Update attributeValues (set operation)
						if (variant.attributeValueIds !== undefined) {
							// Delete existing relations
							await db
								.delete(productVariantsToAttributeValues)
								.where(eq(productVariantsToAttributeValues.B, variant.id));

							// Create new relations
							if (variant.attributeValueIds.length > 0) {
								await db.insert(productVariantsToAttributeValues).values(
									variant.attributeValueIds.map((avId) => ({
										A: avId,
										B: variant.id,
									})),
								);
							}
						}
					}
				}

				// Create new variants
				if (vOps.create && vOps.create.length > 0) {
					for (const variant of vOps.create) {
						const [newVariant] = await db
							.insert(productVariant)
							.values({
								productId: id,
								price: variant.price,
								sku: variant.sku,
								stock: variant.stock ?? 0,
								currency: variant.currency ?? "EUR",
							})
							.returning();

						if (newVariant && variant.attributeValueIds.length > 0) {
							await db.insert(productVariantsToAttributeValues).values(
								variant.attributeValueIds.map((avId) => ({
									A: avId,
									B: newVariant.id,
								})),
							);
						}
					}
				}
			}

			// 4. Clear attributeValues if category changed and not properly reconfigured
			if (hasCategoryChanged && !analysis.isProperlyReconfigured) {
				const variants = await db.query.productVariant.findMany({
					where: eq(productVariant.productId, id),
					columns: { id: true },
				});

				for (const v of variants) {
					await db
						.delete(productVariantsToAttributeValues)
						.where(eq(productVariantsToAttributeValues.B, v.id));
				}
			}

			// 5. Fetch and return updated product
			const [updatedVariants, updatedImages, productCategory] = await Promise.all([
				db.query.productVariant.findMany({
					where: eq(productVariant.productId, id),
					with: {
						attributeValues: {
							with: { attributeValue: true },
						},
					},
				}),
				db.query.image.findMany({
					where: eq(image.productId, id),
				}),
				db.query.category.findFirst({
					where: eq(categoryId ? categoryId : currentProduct.categoryId, categoryId ? categoryId : currentProduct.categoryId),
				}),
			]);

			const finalProduct = {
				...updatedProduct,
				category: productCategory,
				variants: updatedVariants.map((v) => ({
					...v,
					attributeValues: v.attributeValues.map((av) => av.attributeValue),
				})),
				images: updatedImages,
			};

			if (oldKeysToDelete.length > 0) {
				await utapi.deleteFiles(oldKeysToDelete);
			}

			invalidateProductListings({
				categoryIds: [finalProduct.categoryId],
				statuses: [finalProduct.status],
			});

			return finalProduct;
		} catch (err: unknown) {
			// Clean up orphaned files if transaction fails
			if (createUploads.data && createUploads.data.length > 0)
				await utapi.deleteFiles(createUploads.data.map((f) => f.key));
			if (updateUploads.data && updateUploads.data.length > 0)
				await utapi.deleteFiles(updateUploads.data.map((f) => f.key));
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
			const products = await db.query.product.findMany({
				where: inArray(product.id, ids),
				with: {
					variants: {
						with: {
							attributeValues: {
								with: { attributeValue: true },
							},
						},
					},
					category: {
						with: { attributes: true },
					},
				},
			});

			for (const prod of products) {
				const categoryHasAttributes = prod.category.attributes.length > 0;
				const variantsData = prod.variants.map((v) => ({
					id: v.id,
					price: v.price,
					attributeValueIds: v.attributeValues.map((av) => av.attributeValue.id),
				}));

				// PUB1
				const priceResult = validatePublishHasPositivePrice({
					currentVariants: variantsData,
				});

				if (!priceResult.success) {
					throw status("Bad Request", {
						message: `Product "${prod.name}": ${priceResult.error?.message ?? "Validation failed"}`,
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
						message: `Product "${prod.name}": ${attrResult.error?.message ?? "Validation failed"}`,
						code: "PUB2",
					});
				}
			}
		}

		// Update products
		await db
			.update(product)
			.set({
				...(requestedStatus && { status: requestedStatus }),
				...(categoryId && { categoryId }),
			})
			.where(inArray(product.id, ids));

		// Clear attributeValues if category changed
		if (categoryId) {
			const variants = await db.query.productVariant.findMany({
				where: inArray(productVariant.productId, ids),
				columns: { id: true },
			});

			for (const v of variants) {
				await db
					.delete(productVariantsToAttributeValues)
					.where(eq(productVariantsToAttributeValues.B, v.id));
			}
		}

		return { count: ids.length };
	},

	async delete({ id }: uuidGuard) {
		// Fetch product with images first
		const productToDelete = await db.query.product.findFirst({
			where: eq(product.id, id),
			with: { images: true },
		});

		if (!productToDelete) {
			throw new NotFoundError("Product");
		}

		// Delete the product (will cascade to variants and images)
		const [deletedProduct] = await db
			.delete(product)
			.where(eq(product.id, id))
			.returning();

		invalidateProductListings({
			categoryIds: [productToDelete.categoryId],
			statuses: [productToDelete.status],
		});

		return {
			...deletedProduct,
			images: productToDelete.images,
		};
	},
};
