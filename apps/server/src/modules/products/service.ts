import { uploadFiles, utapi } from "@spice-world/server/lib/images";
import { prisma } from "@spice-world/server/lib/prisma";
import type { Product } from "@spice-world/server/prisma/client";
import { sql } from "bun";
import { status } from "elysia";
import { LRUCache } from "lru-cache";
import type { UploadedFileData } from "uploadthing/types";
import { uploadFileErrStatus, type uuidGuard } from "../shared";
import { MAX_IMAGES_PER_PRODUCT, type ProductModel } from "./model";
import {
	executeImageCreates,
	executeImageDeletes,
	executeImageUpdates,
} from "./operations";
import {
	computeFinalVariantCount,
	countVariantsWithAttributeValues,
	determineStatusAfterCategoryChange,
	ensureThumbnailAfterDelete,
	validateImagesOps,
	validatePublishAttributeRequirements,
	validatePublishHasPositivePrice,
	validateVariantAttributeValues,
} from "./validators";

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
		status: requestedStatus,
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

		const thumbnailCount = imagesOps.create.filter(
			(op) => op.isThumbnail === true,
		).length;
		if (thumbnailCount > 1) {
			throw status("Bad Request", {
				message: `Only one image can be set as thumbnail (${thumbnailCount} found)`,
				code: "POST_MULTIPLE_THUMBNAILS",
			});
		}

		const hasNoThumbnail = thumbnailCount === 0;
		if (hasNoThumbnail && imagesOps.create.length > 0) {
			// biome-ignore lint/style/noNonNullAssertion: imagesOps.create[0] is mandatory in the model
			imagesOps.create[0]!.isThumbnail = true;
		}

		// Fetch category to check if it has attributes (for PUB2 validation)
		const category = await prisma.category.findUnique({
			where: { id: categoryId },
			select: {
				id: true,
				attributes: { select: { id: true } },
			},
		});

		if (!category) {
			throw status("Bad Request", {
				message: `Category ${categoryId} not found`,
				code: "CATEGORY_NOT_FOUND",
			});
		}

		const categoryHasAttributes = category.attributes.length > 0;

		// Determine final status based on publish validation rules
		let finalStatus = requestedStatus;

		if (requestedStatus === "PUBLISHED") {
			// PUB1: Check price > 0
			const priceResult = validatePublishHasPositivePrice({
				currentVariants: [],
				variantsToCreate: variants.create,
			});

			if (!priceResult.isValid) {
				finalStatus = "DRAFT";
			} else {
				// PUB2: Check attribute requirements
				const attrResult = validatePublishAttributeRequirements({
					categoryHasAttributes,
					currentVariants: [],
					variantsToCreate: variants.create,
				});

				if (!attrResult.isValid) {
					finalStatus = "DRAFT";
				}
			}
		}

		try {
			const product = await prisma.$transaction(async (tx) => {
				const productPromise = tx.product.create({
					data: {
						name,
						slug: name.toLowerCase().replace(/\s+/g, "-"),
						description,
						status: finalStatus,
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
						validateVariantAttributeValues(
							variant.sku ?? "",
							variant.attributeValueIds,
							allowedAttributeValues,
						);
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
		status: requestedStatus,
		description,
		categoryId,
		images,
		imagesOps,
		variants,
		_version,
	}: ProductModel.patchBody & uuidGuard) {
		localCache.clear();

		// 1. Fetch current product state
		const currentProduct = await prisma.product.findUniqueOrThrow({
			where: { id },
			select: {
				name: true,
				description: true,
				status: true,
				version: true,
				categoryId: true,
				slug: true,
				createdAt: true,
				updatedAt: true,
				category: {
					select: {
						id: true,
						attributes: { select: { id: true } },
					},
				},
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

		// 3. Detect changes
		const isCategoryChanging =
			categoryId !== undefined && categoryId !== currentProduct.categoryId;

		const hasProductFieldChanges =
			(name !== undefined && name !== currentProduct.name) ||
			(description !== undefined &&
				description !== currentProduct.description) ||
			(requestedStatus !== undefined &&
				requestedStatus !== currentProduct.status) ||
			isCategoryChanging;

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
				const fileChanged = updateOp.fileIndex !== undefined;

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

		// Early exit if no changes
		if (
			!hasProductFieldChanges &&
			!hasRealImageUpdates &&
			!hasImageChanges &&
			!hasRealVariantUpdates &&
			!hasVariantChanges
		) {
			const { _count, category, ...result } = currentProduct;
			return { ...result, category: { id: category.id, name: "" } };
		}

		// 4. Category change validation
		if (isCategoryChanging) {
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

			if (deleteCount !== currentVariantCount) {
				throw status("Bad Request", {
					message: `Changing category requires deleting ALL existing variants. Expected to delete ${currentVariantCount} variants, but only ${deleteCount} provided.`,
					code: "CATEGORY_CHANGE_REQUIRES_DELETE_ALL",
				});
			}

			if (createCount < 1) {
				throw status("Bad Request", {
					message:
						"Changing category requires creating at least one new variant with attributes from the new category.",
					code: "CATEGORY_CHANGE_REQUIRES_CREATE",
				});
			}
		}

		// 5. Variant count validation (only if NOT changing category)
		if (variants && !isCategoryChanging) {
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

		// 6. Image operations validation
		if (imagesOps) {
			ensureThumbnailAfterDelete(currentProduct.images, imagesOps);

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

			if (images && images.length > 0) {
				validateImagesOps(images, imagesOps);
			}
		}

		// 7. Publish validation (PUB1 & PUB2)
		const newCategoryId = categoryId ?? currentProduct.categoryId;
		let newCategory = currentProduct.category;

		if (isCategoryChanging) {
			const fetchedCategory = await prisma.category.findUnique({
				where: { id: newCategoryId },
				select: {
					id: true,
					attributes: { select: { id: true } },
				},
			});

			if (!fetchedCategory) {
				throw status("Bad Request", {
					message: `Category ${newCategoryId} not found`,
					code: "CATEGORY_NOT_FOUND",
				});
			}
			newCategory = fetchedCategory;
		}

		const categoryHasAttributes = newCategory.attributes.length > 0;
		const targetStatus = requestedStatus ?? currentProduct.status;
		const isCurrentlyPublished = currentProduct.status === "PUBLISHED";
		const isRequestingPublish = targetStatus === "PUBLISHED";

		// Prepare variant data for validation
		const currentVariantsForValidation = currentProduct.variants.map((v) => ({
			id: v.id,
			price: v.price,
			attributeValueIds: v.attributeValues.map((av) => av.id),
		}));

		const variantsToCreate = variants?.create?.map((v) => ({
			price: v.price,
			attributeValueIds: v.attributeValueIds,
		}));

		const variantsToUpdate = variants?.update?.map((v) => ({
			id: v.id,
			price: v.price,
			attributeValueIds: v.attributeValueIds,
		}));

		const variantsToDelete = variants?.delete;

		// Determine final status
		let finalStatus = targetStatus;

		// Case 1: Category change - may auto-draft
		if (isCategoryChanging) {
			const finalVariantCount = computeFinalVariantCount(
				currentProduct._count.variants,
				variantsToCreate,
				variantsToDelete,
			);

			const variantsWithAttrs = countVariantsWithAttributeValues(
				currentVariantsForValidation,
				variantsToCreate,
				variantsToUpdate,
				variantsToDelete,
			);

			finalStatus = determineStatusAfterCategoryChange({
				currentStatus: currentProduct.status,
				requestedStatus,
				newCategoryHasAttributes: categoryHasAttributes,
				finalVariantCount,
				variantsWithAttributeValues: variantsWithAttrs,
			});
		}
		// Case 2: Requesting PUBLISH or currently PUBLISHED - validate PUB1 & PUB2
		else if (isRequestingPublish || isCurrentlyPublished) {
			// PUB1: Price > 0 validation
			const priceResult = validatePublishHasPositivePrice({
				currentVariants: currentVariantsForValidation,
				variantsToCreate,
				variantsToUpdate,
				variantsToDelete,
			});

			if (!priceResult.isValid) {
				throw status("Bad Request", {
					message: priceResult.message,
					code: "PUB1",
				});
			}

			// PUB2: Attribute requirements validation
			const attrResult = validatePublishAttributeRequirements({
				categoryHasAttributes,
				currentVariants: currentVariantsForValidation,
				variantsToCreate,
				variantsToUpdate,
				variantsToDelete,
			});

			if (!attrResult.isValid) {
				throw status("Bad Request", {
					message: attrResult.message,
					code: "PUB2",
				});
			}
		}

		// 8. Upload files
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
				// Update base product
				const updatedProduct = await tx.product.update({
					where: { id },
					data: {
						...(name && {
							name,
							slug: name.toLowerCase().replace(/\s+/g, "-"),
						}),
						...(description !== undefined && { description }),
						status: finalStatus,
						...(categoryId && { category: { connect: { id: categoryId } } }),
						version: { increment: 1 },
					},
					include: {
						category: true,
					},
				});

				// Image operations
				if (imagesOps?.create && imagesOps.create.length > 0) {
					await executeImageCreates(
						tx,
						id,
						updatedProduct.name,
						imagesOps.create,
						uploadMap,
					);
				}

				if (imagesOps?.update && imagesOps.update.length > 0) {
					const deletedKeys = await executeImageUpdates(
						tx,
						id,
						imagesOps.update,
						uploadMap,
					);
					oldKeysToDelete.push(...deletedKeys);
				}

				if (imagesOps?.delete && imagesOps.delete.length > 0) {
					const deletedKeys = await executeImageDeletes(
						tx,
						id,
						imagesOps.delete,
					);
					oldKeysToDelete.push(...deletedKeys);
				}

				// Variant operations
				if (variants) {
					const allowedAttributeValues = await tx.attributeValue.findMany({
						where: { attribute: { categoryId: updatedProduct.categoryId } },
						select: { id: true, attributeId: true },
					});

					const promises: Promise<unknown>[] = [];

					if (variants.delete && variants.delete.length > 0) {
						promises.push(
							tx.productVariant.deleteMany({
								where: { id: { in: variants.delete }, productId: id },
							}),
						);
					}

					if (variants.update && variants.update.length > 0) {
						for (const variant of variants.update) {
							if (variant.attributeValueIds !== undefined) {
								validateVariantAttributeValues(
									variant.sku ?? variant.id,
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
									include: { attributeValues: true },
								}),
							);
						}
					}

					if (variants.create && variants.create.length > 0) {
						for (const variant of variants.create) {
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
									include: { attributeValues: true },
								}),
							);
						}
					}

					await Promise.all(promises);
				}

				// Fetch final state
				const [updatedVariants, updatedImages] = await Promise.all([
					tx.productVariant.findMany({
						where: { productId: id },
						include: { attributeValues: true },
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

			if (oldKeysToDelete.length > 0) {
				await utapi.deleteFiles(oldKeysToDelete);
			}

			return product;
		} catch (err: unknown) {
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

				if (!priceResult.isValid) {
					throw status("Bad Request", {
						message: `Product "${product.name}": ${priceResult.message}`,
						code: "PUB1",
					});
				}

				// PUB2
				const attrResult = validatePublishAttributeRequirements({
					categoryHasAttributes,
					currentVariants: variantsData,
				});

				if (!attrResult.isValid) {
					throw status("Bad Request", {
						message: `Product "${product.name}": ${attrResult.message}`,
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
};

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
	if (referencedIndices.length === 0) {
		return { data: new Map<number, UploadedFileData>(), error: null };
	}

	const sortedIndices = referencedIndices.sort((a, b) => a - b);
	const filesToUpload = sortedIndices.map((idx) => images[idx] as File);
	const { data: uploaded, error } = await uploadFiles(
		productName,
		filesToUpload,
	);
	if (error || !uploaded) {
		return { data: null, error };
	}

	const uploadMap = new Map<number, UploadedFileData>();
	uploaded.forEach((file, i) => {
		uploadMap.set(sortedIndices[i] as number, file);
	});

	return { data: uploadMap, error: null };
}
