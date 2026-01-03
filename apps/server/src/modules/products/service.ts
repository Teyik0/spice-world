import { uploadFiles, utapi } from "@spice-world/server/lib/images";
import { prisma } from "@spice-world/server/lib/prisma";
import type { Product } from "@spice-world/server/prisma/client";
import { sql } from "bun";
import { status } from "elysia";
import { LRUCache } from "lru-cache";
import type { UploadedFileData } from "uploadthing/types";
import { uploadFileErrStatus, type uuidGuard } from "../shared";
import { MAX_IMAGES_PER_PRODUCT, type ProductModel } from "./model";

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
	max: 500, // Max 500 entries
	ttl: 1000 * 60 * 10, // 10 minutes TTL
	updateAgeOnGet: true,
});

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

		type getResult = Product & {
			img: string | null;
			priceMin: number | null;
			priceMax: number | null;
			totalStock: number;
		};

		if (localCache.has(cacheKey)) {
			return localCache.get(cacheKey) as getResult[];
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
						sql`WHERE ${conditions[0]}`, // initial value
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

		const products = await sql<getResult[]>`SELECT
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
		// We are using Bun.sql here because this query need to be performant for users
		return [...products]; // erase array extra properties given by Bun.sql
	},

	async getById({ id }: uuidGuard) {
		const product = await prisma.product.findUnique({
			where: { id },
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

		return product ?? status("Not Found", "Product not found");
	},

	async getBySlug({ slug }: { slug: string }) {
		const product = await prisma.product.findUnique({
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

		return product ?? status("Not Found", "Product not found");
	},

	async count({ status }: ProductModel.countQuery) {
		const where = status ? { status } : {};
		return prisma.product.count({ where });
	},

	async post({
		name,
		status: productStatus,
		description,
		categoryId,
		variants,
		images,
		imagesOps,
	}: ProductModel.postBody) {
		localCache.clear();

		const { data: uploadMap, error: uploadError } =
			await validateAndUploadFiles(images, imagesOps, name);
		if (uploadError || !uploadMap) {
			return uploadFileErrStatus({ message: uploadError });
		}

		// Validate and ensure exactly one thumbnail for POST
		const thumbnailCount = imagesOps.create.filter(
			(op) => op.isThumbnail === true,
		).length;
		if (thumbnailCount > 1) {
			throw status("Bad Request", {
				message: `Only one image can be set as thumbnail (${thumbnailCount} found)`,
				code: "POST_MULTIPLE_THUMBNAILS",
			});
		}

		// If no thumbnail is set, automatically set the first image as thumbnail
		const hasNoThumbnail = thumbnailCount === 0;
		if (hasNoThumbnail && imagesOps.create.length > 0) {
			// biome-ignore lint/style/noNonNullAssertion: imagesOps.create[0] is mandatory in the model
			imagesOps.create[0]!.isThumbnail = true;
		}

		try {
			const product = await prisma.$transaction(async (tx) => {
				const productPromise = tx.product.create({
					data: {
						name,
						slug: name.toLowerCase().replace(/\s+/g, "-"),
						description,
						status: productStatus,
						categoryId,
						images: {
							createMany: {
								data: imagesOps.create.map((op) => {
									const file = uploadMap.get(op.fileIndex);
									if (!file) {
										throw new Error(`File not found for index ${op.fileIndex}`);
									}
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

				const [product, allowedAttributeValues] = await Promise.all([
					productPromise,
					tx.attributeValue.findMany({
						where: { attribute: { categoryId } },
						select: { id: true, attributeId: true },
					}),
				]);

				const createdVariants = await Promise.all(
					variants.create.map((variant) => {
						// Validate attribute values belong to category and no duplicates per attribute
						validateVariantAttributeValues(
							variant.sku ?? "",
							variant.attributeValueIds,
							allowedAttributeValues,
						);
						// createMany does not handle connect
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
			return status("Created", product);
		} catch (err: unknown) {
			// Cleanup uploaded files
			if (uploadMap.size > 0) {
				await utapi.deleteFiles(
					Array.from(uploadMap.values()).map((file) => file.key),
				);
			}
			throw err;
		}
	},

	async patch({
		id,
		name,
		status: productStatus,
		description,
		categoryId,
		images,
		imagesOps,
		variants,
		_version,
	}: ProductModel.patchBody & uuidGuard) {
		localCache.clear();

		// 1. Get current product for name, version, category, and variants check
		const currentProduct = await prisma.product.findUniqueOrThrow({
			where: { id },
			select: {
				// Fields for comparison
				name: true,
				description: true,
				status: true,
				version: true,
				categoryId: true,
				slug: true,
				createdAt: true,
				updatedAt: true,
				// Relations for return
				category: true,
				images: true,
				variants: {
					include: {
						attributeValues: true,
					},
				},
				_count: { select: { variants: true } },
			},
		});

		// 2. Version check (optimistic locking)
		if (_version !== undefined && currentProduct.version !== _version) {
			throw status(
				"Conflict",
				`Product has been modified. Expected version ${_version}, current is ${currentProduct.version}`,
			);
		}

		const hasProductFieldChanges =
			(name !== undefined && name !== currentProduct.name) ||
			(description !== undefined &&
				description !== currentProduct.description) ||
			(productStatus !== undefined &&
				productStatus !== currentProduct.status) ||
			(categoryId !== undefined && categoryId !== currentProduct.categoryId);

		const hasRealImageUpdates =
			imagesOps?.update?.some((updateOp) => {
				const currentImage = currentProduct.images.find(
					(img) => img.id === updateOp.id,
				);
				if (!currentImage) {
					throw status("Not Found", {
						message: `Image with id ${updateOp.id} not found in product ${id}`,
						code: "IMAGE_NOT_FOUND",
					});
				}

				const altTextChanged =
					updateOp.altText !== undefined &&
					updateOp.altText !== currentImage.altText;
				const thumbnailChanged =
					updateOp.isThumbnail !== undefined &&
					updateOp.isThumbnail !== currentImage.isThumbnail;
				const fileChanged = updateOp.fileIndex !== undefined; // Nouveau fichier

				return altTextChanged || thumbnailChanged || fileChanged;
			}) ?? false;

		const hasImageChanges =
			(imagesOps?.create && imagesOps.create.length > 0) ||
			(imagesOps?.delete && imagesOps.delete.length > 0);

		const hasRealVariantUpdates =
			variants?.update?.some((updateOp) => {
				const currentVariant = currentProduct.variants.find(
					(v) => v.id === updateOp.id,
				);

				if (!currentVariant) {
					throw status("Not Found", {
						message: `Variant with id ${updateOp.id} not found in product ${id}`,
						code: "VARIANT_NOT_FOUND",
					});
				}

				const priceChanged =
					updateOp.price !== undefined &&
					updateOp.price !== currentVariant.price;

				const skuChanged =
					updateOp.sku !== undefined && updateOp.sku !== currentVariant.sku;

				const stockChanged =
					updateOp.stock !== undefined &&
					updateOp.stock !== currentVariant.stock;

				const currencyChanged =
					updateOp.currency !== undefined &&
					updateOp.currency !== currentVariant.currency;

				let attrValuesChanged = false;
				if (updateOp.attributeValueIds !== undefined) {
					const currentAttrIds = currentVariant.attributeValues
						.map((av) => av.id)
						.sort();
					const newAttrIds = [...updateOp.attributeValueIds].sort();

					attrValuesChanged =
						currentAttrIds.length !== newAttrIds.length ||
						currentAttrIds.some((id, index) => id !== newAttrIds[index]);
				}

				return (
					priceChanged ||
					skuChanged ||
					stockChanged ||
					currencyChanged ||
					attrValuesChanged
				);
			}) ?? false;

		const hasVariantChanges =
			(variants?.create && variants.create.length > 0) ||
			(variants?.delete && variants.delete.length > 0);

		if (
			!hasProductFieldChanges &&
			!hasRealImageUpdates &&
			!hasImageChanges &&
			!hasRealVariantUpdates &&
			!hasVariantChanges
		) {
			const { _count, ...result } = currentProduct;
			return result;
		}

		// 2b. Validate category change (requires atomic delete all + create new)
		if (categoryId && categoryId !== currentProduct.categoryId) {
			// Category is changing - enforce atomic variant replacement
			if (!variants) {
				throw status("Bad Request", {
					message:
						"Changing category requires providing variants operations (delete all existing + create at least one new).",
					code: "CATEGORY_CHANGE_REQUIRES_VARIANTS",
				});
			}

			const deleteCount = variants.delete?.length ?? 0;
			const createCount = variants.create?.length ?? 0;
			const currentVariantCount = currentProduct._count.variants;

			// Must delete ALL existing variants
			if (deleteCount !== currentVariantCount) {
				throw status("Bad Request", {
					message: `Changing category requires deleting ALL existing variants. Expected to delete ${currentVariantCount} variants, but only ${deleteCount} provided.`,
					code: "CATEGORY_CHANGE_REQUIRES_DELETE_ALL",
				});
			}

			// Must create at least 1 new variant
			if (createCount < 1) {
				throw status("Bad Request", {
					message:
						"Changing category requires creating at least one new variant with attributes from the new category.",
					code: "CATEGORY_CHANGE_REQUIRES_CREATE",
				});
			}

			// Attribute validation will happen later in transaction with new categoryId
		}

		// 2c. Validate variant count (only if NOT changing category)
		if (variants && (!categoryId || categoryId === currentProduct.categoryId)) {
			const currentVariantCount = currentProduct._count.variants;
			const deleteCount = variants.delete?.length ?? 0;
			const createCount = variants.create?.length ?? 0;
			const finalVariantCount = currentVariantCount - deleteCount + createCount;

			if (finalVariantCount < 1) {
				throw status("Bad Request", {
					message: `Product must have at least 1 variant. Current: ${currentVariantCount}, deleting: ${deleteCount}, creating: ${createCount}`,
					code: "INSUFFICIENT_VARIANTS",
				});
			}
		}

		// 3. Validate image operations
		if (imagesOps) {
			ensureThumbnailAfterDelete(currentProduct.images, imagesOps);
			// 3a. Validate total image count
			const currentCount = currentProduct.images.length;
			const createCount = imagesOps.create?.length ?? 0;
			const deleteCount = imagesOps.delete?.length ?? 0;
			const newTotal = currentCount + createCount - deleteCount;

			if (newTotal > MAX_IMAGES_PER_PRODUCT) {
				throw status(
					"Bad Request",
					`Maximum ${MAX_IMAGES_PER_PRODUCT} images per product. Current: ${currentCount}, adding: ${createCount}, deleting: ${deleteCount}`,
				);
			}

			if (newTotal < 1) {
				throw status(
					"Bad Request",
					"Product must have at least 1 image. Cannot delete all images.",
				);
			}

			// 3b. Validate image operations (duplicates, thumbnails)
			// validateImagesOps throws exceptions if validation fails
			if (images && images.length > 0) {
				validateImagesOps(images, imagesOps);
			}
		}

		// 4. Validate and upload files
		const { data: uploadMap, error: uploadErr } = await validateAndUploadFiles(
			images,
			imagesOps,
			name ?? currentProduct.name,
		);
		if (uploadErr || !uploadMap) {
			return uploadFileErrStatus({ message: uploadErr });
		}

		const oldKeysToDelete: string[] = [];
		try {
			const product = await prisma.$transaction(async (tx) => {
				// 1. Update base product
				const updatedProduct = await tx.product.update({
					where: { id },
					data: {
						...(name && {
							name,
							slug: name.toLowerCase().replace(/\s+/g, "-"),
						}),
						...(description !== undefined && { description }),
						...(productStatus !== undefined && { status: productStatus }),
						...(categoryId && { category: { connect: { id: categoryId } } }),
						version: { increment: 1 },
					},
					include: {
						category: true,
					},
				});

				// 2. CREATE new images
				if (imagesOps?.create && imagesOps.create.length > 0) {
					// If creating a new thumbnail, reset all existing thumbnails first
					const hasNewThumbnail = imagesOps.create.some(
						(op) => op.isThumbnail === true,
					);
					if (hasNewThumbnail) {
						await tx.image.updateMany({
							where: { productId: id },
							data: { isThumbnail: false },
						});
					}

					await tx.image.createMany({
						data: imagesOps.create.map((op) => {
							const file = uploadMap.get(op.fileIndex);
							if (!file) {
								throw new Error(`File not found for index ${op.fileIndex}`);
							}
							return {
								productId: id,
								key: file.key,
								url: file.ufsUrl,
								altText: op.altText || `${updatedProduct.name} image`,
								isThumbnail: op.isThumbnail ?? false,
							};
						}),
					});
				}

				// 3. UPDATE images (metadata or file replacement)
				if (imagesOps?.update && imagesOps.update.length > 0) {
					// If setting a new thumbnail, reset all existing thumbnails first
					const hasNewThumbnail = imagesOps.update.some(
						(op) => op.isThumbnail === true,
					);
					if (hasNewThumbnail) {
						await tx.image.updateMany({
							where: { productId: id },
							data: { isThumbnail: false },
						});
					}

					for (const op of imagesOps.update) {
						if (op.fileIndex !== undefined) {
							// Replace file + update metadata
							const oldImg = await tx.image.findUnique({
								where: { id: op.id },
								select: { key: true },
							});
							if (oldImg) {
								oldKeysToDelete.push(oldImg.key);
							}

							const file = uploadMap.get(op.fileIndex);
							if (!file) {
								throw new Error(`File not found for index ${op.fileIndex}`);
							}

							await tx.image.update({
								where: { id: op.id },
								data: {
									key: file.key,
									url: file.ufsUrl,
									...(op.altText !== undefined && { altText: op.altText }),
									...(op.isThumbnail !== undefined && {
										isThumbnail: op.isThumbnail,
									}),
								},
							});
						} else {
							// Metadata only update
							await tx.image.update({
								where: { id: op.id },
								data: {
									...(op.altText !== undefined && { altText: op.altText }),
									...(op.isThumbnail !== undefined && {
										isThumbnail: op.isThumbnail,
									}),
								},
							});
						}
					}
				}

				// 4. DELETE images
				if (imagesOps?.delete && imagesOps.delete.length > 0) {
					const toDelete = await tx.image.findMany({
						where: { id: { in: imagesOps.delete }, productId: id },
						select: { key: true },
					});
					oldKeysToDelete.push(...toDelete.map((img) => img.key));

					await tx.image.deleteMany({
						where: { id: { in: imagesOps.delete } },
					});
				}

				const promises = [];
				if (variants) {
					const allowedAttributeValues = await tx.attributeValue.findMany({
						where: { attribute: { categoryId: updatedProduct.categoryId } },
						select: { id: true, attributeId: true },
					});

					if (variants.delete && variants.delete.length > 0) {
						promises.push(
							tx.productVariant.deleteMany({
								where: { id: { in: variants.delete }, productId: id },
							}),
						);
					}

					if (variants.update && variants.update.length > 0) {
						variants.update.forEach((variant) => {
							// Only validate if attributeValueIds are being updated
							if (variant.attributeValueIds !== undefined) {
								validateVariantAttributeValues(
									variant.sku ?? variant.id, // Use SKU if provided, otherwise ID for error messages
									variant.attributeValueIds,
									allowedAttributeValues,
								);
							}
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
												set: variant.attributeValueIds.map((id) => ({ id })),
											},
										}),
									},
									include: {
										attributeValues: true,
									},
								}),
							);
						});
					}

					if (variants.create && variants.create.length > 0) {
						variants.create.forEach((variant) => {
							validateVariantAttributeValues(
								variant.sku ?? "",
								variant.attributeValueIds,
								allowedAttributeValues,
							);
							promises.push(
								tx.productVariant.create({
									data: {
										productId: id,
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
								}),
							);
						});
					}
				}

				await Promise.all([...promises]);

				// Get updated variants and images
				const [updatedVariants, updatedImages] = await Promise.all([
					tx.productVariant.findMany({
						where: { productId: id },
						include: {
							attributeValues: true,
						},
					}),
					tx.image.findMany({
						where: { productId: id },
					}),
				]);

				return {
					...updatedProduct,
					variants: updatedVariants,
					images: updatedImages,
				};
			});

			// Cleanup old files after successful transaction
			if (oldKeysToDelete.length > 0) {
				await utapi.deleteFiles(oldKeysToDelete);
			}

			return product;
		} catch (err: unknown) {
			// Cleanup newly uploaded files if transaction failed
			if (uploadMap.size > 0) {
				await utapi.deleteFiles(
					Array.from(uploadMap.values()).map((file) => file.key),
				);
			}
			throw err;
		}
	},

	async delete({ id }: uuidGuard) {
		const deletedProduct = await prisma.product.delete({
			where: { id: id },
			include: { images: true },
		});

		return deletedProduct;
	},

	async bulkPatch({ ids, status, categoryId }: ProductModel.bulkPatchBody) {
		localCache.clear();

		return prisma.$transaction(async (tx) => {
			const result = await tx.product.updateMany({
				where: { id: { in: ids } },
				data: {
					...(status && { status }),
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
};

function validateVariantAttributeValues(
	variantSkuOrId: string,
	attributeValueIds: string[] | undefined,
	allowedAttributeValues: Array<{ id: string; attributeId: string }>,
) {
	if (!attributeValueIds || attributeValueIds.length === 0) return;

	// Check that all IDs are valid
	const allowedIds = new Set(allowedAttributeValues.map((a) => a.id));
	const invalidIds = attributeValueIds.filter((id) => !allowedIds.has(id));

	if (invalidIds.length > 0) {
		throw status("Bad Request", {
			message: `Invalid attribute values for variant ${variantSkuOrId}: ${invalidIds.join(
				", ",
			)}. Attribute values should match product category.`,
			code: "VVA1",
		});
	}

	// Check that there are no multiple values for the same attribute
	const attributeIdMap = new Map<string, string>();

	for (const valueId of attributeValueIds) {
		const attrValue = allowedAttributeValues.find((a) => a.id === valueId);
		if (!attrValue) continue; // Already checked above

		const existingValueId = attributeIdMap.get(attrValue.attributeId);
		if (existingValueId) {
			throw status("Bad Request", {
				message: `Variant ${variantSkuOrId} has multiple values for the same attribute. Found both ${existingValueId} and ${valueId}.`,
				code: "VVA2",
			});
		}

		attributeIdMap.set(attrValue.attributeId, valueId);
	}
}

async function validateAndUploadFiles(
	images: File[] | undefined,
	imagesOps: ProductModel.imageOperations | undefined,
	productName: string,
) {
	if (!images?.length || !imagesOps) {
		return { data: new Map<number, UploadedFileData>(), error: null };
	}
	const referencedIndices = validateImagesOps(images, imagesOps);
	return await uploadValidFiles({
		referencedIndices,
		images,
		productName,
	});
}

function validateImagesOps(
	images: File[],
	imagesOps: ProductModel.imageOperations,
) {
	const imgOpsCreate = validateImgOpsCreateUpdate(imagesOps.create);
	if (!imgOpsCreate.isValid) {
		if (imgOpsCreate.hasDuplicateFileIndex) {
			throw status("Bad Request", {
				message: `Duplicate fileIndex values at imagesOps.create, indices: ${imgOpsCreate.duplicateFileIndices.join(
					", ",
				)}`,
				code: "VIO1",
			});
		}
		if (imgOpsCreate.hasMultipleThumbnails) {
			throw status("Bad Request", {
				message: `Multiple thumbnails set at imagesOps.create (${imgOpsCreate.thumbnailCount} found)`,
				code: "VIO2",
			});
		}
	}

	const imgOpsUpdate = validateImgOpsCreateUpdate(imagesOps.update);
	if (!imgOpsUpdate.isValid) {
		if (imgOpsUpdate.hasDuplicateFileIndex) {
			throw status("Bad Request", {
				message: `Duplicate fileIndex values at imagesOps.update, indices: ${imgOpsUpdate.duplicateFileIndices.join(
					", ",
				)}`,
				code: "VIO3",
			});
		}
		if (imgOpsUpdate.hasMultipleThumbnails) {
			throw status("Bad Request", {
				message: `Multiple thumbnails set at imagesOps.update (${imgOpsUpdate.thumbnailCount} found)`,
				code: "VIO4",
			});
		}
	}

	// Check overlap between create and update
	const createFileIndices = imagesOps.create?.map((op) => op.fileIndex) ?? [];
	const updateFileIndices =
		imagesOps.update
			?.filter((op) => op.fileIndex !== undefined)
			.map((op) => op.fileIndex as number) ?? [];
	const overlap = createFileIndices.filter((idx) =>
		updateFileIndices.includes(idx),
	);
	if (overlap.length > 0) {
		throw status("Bad Request", {
			message: `Duplicate fileIndex ${overlap.join(", ")} used in both create and update`,
			code: "VIO5",
		});
	}

	// Check only one thumbnail across create and update
	const totalThumbnailCount =
		imgOpsCreate.thumbnailCount + imgOpsUpdate.thumbnailCount;
	if (totalThumbnailCount > 1) {
		throw status("Bad Request", {
			message: `Multiple thumbnails across create and update operations (${totalThumbnailCount} found)`,
			code: "VIO6",
		});
	}

	// Collect all referenced indices (no duplicates after validation)
	// And validate indices are within bounds
	const allReferencedIndices = [...createFileIndices, ...updateFileIndices];
	for (const idx of allReferencedIndices) {
		if (idx >= images.length) {
			throw status("Bad Request", {
				message: `Invalid fileIndex ${idx}. Only ${images.length} files provided.`,
				code: "VIO7",
			});
		}
	}

	return allReferencedIndices;
}

interface UploadValidFilesProps {
	referencedIndices: number[];
	images: File[];
	productName: string;
}
async function uploadValidFiles({
	referencedIndices,
	images,
	productName,
}: UploadValidFilesProps): Promise<
	| { data: Map<number, UploadedFileData>; error: null }
	| { data: null; error: string }
> {
	// If nothing to upload return early
	if (referencedIndices.length === 0) {
		return { data: new Map<number, UploadedFileData>(), error: null };
	}

	// Upload only referenced files
	const sortedIndices = referencedIndices.sort((a, b) => a - b);
	const filesToUpload = sortedIndices.map((idx) => images[idx] as File);
	const { data: uploaded, error } = await uploadFiles(
		productName,
		filesToUpload,
	);
	if (error || !uploaded) {
		return { data: null, error };
	}

	// Create mapping: fileIndex → uploaded file data
	const uploadMap = new Map<number, UploadedFileData>();
	uploaded.forEach((file, i) => {
		uploadMap.set(sortedIndices[i] as number, file);
	});

	return { data: uploadMap, error: null };
}

function validateImgOpsCreateUpdate(
	items:
		| (typeof ProductModel.imageOperations.static)["create"]
		| (typeof ProductModel.imageOperations.static)["update"]
		| undefined,
): {
	hasDuplicateFileIndex: boolean;
	hasMultipleThumbnails: boolean;
	duplicateFileIndices: number[]; // which fileIndex values are repeated
	thumbnailCount: number; // total count of items with isThumbnail: true
	isValid: boolean; // true only if NO duplicates AND at most one thumbnail
} {
	if (!items || items.length === 0) {
		return {
			hasDuplicateFileIndex: false,
			hasMultipleThumbnails: false,
			duplicateFileIndices: [],
			thumbnailCount: 0,
			isValid: true,
		};
	}

	const fileIndexCount = new Map<number, number>();
	let thumbnailCount = 0;

	for (const item of items) {
		// Count thumbnails for ALL items (including metadata-only updates)
		if (item.isThumbnail === true) {
			thumbnailCount++;
		}

		// Count fileIndex only for items that have one
		if (item.fileIndex === undefined || item.fileIndex === null) continue;
		fileIndexCount.set(
			item.fileIndex,
			(fileIndexCount.get(item.fileIndex) || 0) + 1,
		);
	}

	const duplicateFileIndices = Array.from(fileIndexCount.entries())
		.filter(([_, count]) => count > 1)
		.map(([fileIndex]) => fileIndex);

	const hasDuplicateFileIndex = duplicateFileIndices.length > 0;
	const hasMultipleThumbnails = thumbnailCount > 1;
	const isValid = !hasDuplicateFileIndex && !hasMultipleThumbnails;

	return {
		hasDuplicateFileIndex,
		hasMultipleThumbnails,
		duplicateFileIndices,
		thumbnailCount,
		isValid,
	};
}

function ensureThumbnailAfterDelete(
	currentImages: ProductModel.patchResult["images"],
	imagesOps: ProductModel.imageOperations | undefined,
) {
	if (!imagesOps?.delete || imagesOps.delete.length === 0) return;

	const currentThumbnail = currentImages.find((img) => img.isThumbnail);
	const willDeleteThumbnail =
		currentThumbnail && imagesOps.delete.includes(currentThumbnail.id);

	const willSetNewThumbnail =
		imagesOps.create?.some((op) => op.isThumbnail) ||
		imagesOps.update?.some((op) => op.isThumbnail === true);

	if (willDeleteThumbnail && !willSetNewThumbnail) {
		const deletedIds = new Set(imagesOps.delete);
		const firstRemaining = currentImages.find((img) => !deletedIds.has(img.id));

		if (firstRemaining) {
			if (!imagesOps.update) {
				imagesOps.update = [];
			}

			const existingUpdate = imagesOps.update.find(
				(op) => op.id === firstRemaining.id,
			);

			if (existingUpdate) {
				existingUpdate.isThumbnail = true;
			} else {
				imagesOps.update.push({
					id: firstRemaining.id,
					isThumbnail: true,
				});
			}
		}
	}
}
