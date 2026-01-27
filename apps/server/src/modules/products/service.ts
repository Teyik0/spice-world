import { uploadFiles, utapi } from "@spice-world/server/lib/images";
import { prisma } from "@spice-world/server/lib/prisma";
import type { Product } from "@spice-world/server/prisma/client";
import { sql } from "bun";
import { status } from "elysia";
import { LRUCache } from "lru-cache";
import type { UploadedFileData } from "uploadthing/types";
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
import {
	CATEGORY_WITH_VALUES_ARGS,
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
		return await prisma.product.findUniqueOrThrow({
			where: { id },
			include: {
				category: {
					include: { attributes: { include: { values: true } } },
				},
				images: true,
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
				category: true,
				images: true,
				variants: {
					include: {
						attributeValues: true,
					},
				},
			},
		});
	},

	async count({ status }: ProductModel.countQuery) {
		const where = status ? { status } : {};
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
		const category = await prisma.category.findUniqueOrThrow({
			where: { id: categoryId },
			...CATEGORY_WITH_VALUES_ARGS,
		});
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
			const product = await prisma.$transaction(async (tx) => {
				const product = await tx.product.create({
					data: {
						name,
						slug: name.toLowerCase().replace(/\s+/g, "-"),
						description,
						status: finalStatus,
						categoryId,
						images: {
							createMany: {
								data: iOps.create.map((op, index) => {
									const file = uploadMap[index] as UploadedFileData;
									return {
										key: file.key,
										url: file.ufsUrl,
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

				const createdVariants = await Promise.all(
					vOps.create.map((variant) => {
						return tx.productVariant.create({
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
						});
					}),
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

			return status("Created", product);
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
				currentThumbnail: currentProduct.images.find((img) => img.isThumbnail),
			});
		}

		const hasCategoryChanged =
			categoryId !== undefined && categoryId !== currentProduct.categoryId;
		const categoryChange = hasCategoryChanged
			? await categoryService.getById({ id: categoryId })
			: null;

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
			!!categoryChange, // Flag if category is changing
		);

		// Determine final status using pre-computed analysis
		const { finalStatus, warnings } = determineStatus(
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
			const product = await prisma.$transaction(async (tx) => {
				// 1. Update product
				const updatedProduct = await tx.product.update({
					where: { id },
					data: {
						...(name && {
							name,
							slug: name.toLowerCase().replace(/\s+/g, "-"),
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

				// 2. Handle image operations
				if (iOps) {
					// Delete images
					if (iOps.delete && iOps.delete.length > 0) {
						const oldImages = await tx.image.findMany({
							where: { id: { in: iOps.delete } },
							select: { key: true },
						});
						await tx.image.deleteMany({
							where: { id: { in: iOps.delete } },
						});
						oldKeysToDelete.push(...oldImages.map((i) => i.key));
					}

					// Create new images (uploadMap sequentially)
					if (iOps.create && iOps.create.length > 0) {
						await tx.image.createMany({
							data: iOps.create.map((op, index) => {
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
						});
					}

					// Update images (find by ID in uploadMap)
					if (iOps.update && iOps.update.length > 0) {
						// Parallel fetch all current images first
						const currentImages = await Promise.all(
							iOps.update.map((op) =>
								tx.image.findUnique({ where: { id: op.id } }),
							),
						);

						// Parallel update all images
						const updatePromises = iOps.update.map((op, index) => {
							const currentImage = currentImages[index];
							if (!currentImage) throw new Error(`Image not found: ${op.id}`);

							// biome-ignore lint/style/noNonNullAssertion: already checked at upload time
							const uploaded = updateUploads.data!.find(
								(_, i) => updateOpsWithFiles[i]?.id === op.id,
							);

							return tx.image.update({
								where: { id: op.id },
								data: uploaded
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
							});
						});

						await Promise.all(updatePromises);
					}
				}

				// 3. Handle variant operations
				if (vOps) {
					const promises: Promise<unknown>[] = [];

					if (vOps.delete && vOps.delete.length > 0) {
						promises.push(
							tx.productVariant.deleteMany({
								where: { id: { in: vOps.delete }, productId: id },
							}),
						);
					}

					if (vOps.update && vOps.update.length > 0) {
						for (const variant of vOps.update) {
							promises.push(
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
								}),
							);
						}
					}

					if (vOps.create && vOps.create.length > 0) {
						for (const variant of vOps.create) {
							promises.push(
								tx.productVariant.create({
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
								}),
							);
						}
					}

					await Promise.all(promises);
				}

				// 4. Clear attributeValues if category changed and not properly reconfigured
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
							}),
						),
					);
				}

				// 5. Fetch and return updated product
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

			return product;
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
						message: `Product "${product.name}": ${priceResult.error?.message ?? "Validation failed"}`,
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
						message: `Product "${product.name}": ${attrResult.error?.message ?? "Validation failed"}`,
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
						}),
					),
				);
			}

			return result;
		});
	},

	async delete({ id }: uuidGuard) {
		const deletedProduct = await prisma.product.delete({
			where: { id: id },
			include: { images: true },
		});

		invalidateProductListings({
			categoryIds: [deletedProduct.categoryId],
			statuses: [deletedProduct.status],
		});

		return deletedProduct;
	},
};
