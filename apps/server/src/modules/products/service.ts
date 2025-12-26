import { uploadFiles, utapi } from "@spice-world/server/lib/images";
import { prisma } from "@spice-world/server/lib/prisma";
import type { Product } from "@spice-world/server/prisma/client";
import { sql } from "bun";
import { status } from "elysia";
import type { UploadedFileData } from "uploadthing/types";
import type { uuidGuard } from "../shared";
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
		const direction = sortDir ?? "asc";
		const orderByField = sortBy ?? "name";

		const conditions = [];
		if (status) conditions.push(sql`p.status = ${status}`);
		if (name) conditions.push(sql`p.name ILIKE ${`%${name}%`}`);
		if (categories?.length) {
			conditions.push(
				sql`p."categoryId" IN (SELECT id FROM "Category" WHERE name IN (${categories}))`,
			);
		}

		const whereClause =
			conditions.length > 0
				? conditions.reduce(
						(prev, curr) => sql`${prev} AND ${curr}`,
						sql`WHERE ${conditions[0]}`, // initial value
					)
				: sql``;

		const orderByClause =
			orderByField === "price" ? sql`minprice` : sql`p.${sql(orderByField)}`;
		const selectClause =
			orderByField === "price"
				? sql`, (SELECT MIN(price) FROM "ProductVariant" WHERE "productId" = p.id) AS minprice`
				: sql``;
		const nullsClause = orderByField === "price" ? sql`NULLS LAST` : sql``; // If product has no productVariants

		const orderDirection = direction === "asc" ? sql`ASC` : sql`DESC`;
		const offsetClause = skip !== undefined ? sql`OFFSET ${skip}` : sql``;
		const limitClause = take !== undefined ? sql`LIMIT ${take}` : sql``;

		const products = await sql<
			(Product & { img: string | null })[]
		>`SELECT p.*${selectClause}, (SELECT url FROM "Image" WHERE "productId" = p.id AND "isThumbnail" = true LIMIT 1) AS "img"
		  FROM "Product" p ${whereClause}
		  ORDER BY ${orderByClause} ${orderDirection} ${nullsClause} ${limitClause} ${offsetClause}`;

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
		const { data: uploadMap, error: uploadError } =
			await validateAndUploadFiles(images, imagesOps, name);
		if (uploadError || !uploadMap) {
			return status("Bad Gateway", uploadError ?? "Upload failed");
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
					variants.map((variant) => {
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
		// 1. Get current product for name, version, category, and variants check
		const currentProduct = await prisma.product.findUniqueOrThrow({
			where: { id },
			select: {
				name: true,
				version: true,
				images: true,
				categoryId: true,
				_count: { select: { variants: true } },
			},
		});

		// 2. Version check (optimistic locking)
		if (_version !== undefined && currentProduct.version !== _version) {
			return status(
				"Conflict",
				`Product has been modified. Expected version ${_version}, current is ${currentProduct.version}`,
			);
		}

		// 2b. Validate category change (requires atomic delete all + create new)
		if (categoryId && categoryId !== currentProduct.categoryId) {
			// Category is changing - enforce atomic variant replacement
			if (!variants) {
				return status("Bad Request", {
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
				return status("Bad Request", {
					message: `Changing category requires deleting ALL existing variants. Expected to delete ${currentVariantCount} variants, but only ${deleteCount} provided.`,
					code: "CATEGORY_CHANGE_REQUIRES_DELETE_ALL",
				});
			}

			// Must create at least 1 new variant
			if (createCount < 1) {
				return status("Bad Request", {
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
				return status("Bad Request", {
					message: `Product must have at least 1 variant. Current: ${currentVariantCount}, deleting: ${deleteCount}, creating: ${createCount}`,
					code: "INSUFFICIENT_VARIANTS",
				});
			}
		}

		// 3. Validate image operations
		if (imagesOps) {
			// 3a. Validate total image count
			const currentCount = currentProduct.images.length;
			const createCount = imagesOps.create?.length ?? 0;
			const deleteCount = imagesOps.delete?.length ?? 0;
			const newTotal = currentCount + createCount - deleteCount;

			if (newTotal > MAX_IMAGES_PER_PRODUCT) {
				return status(
					"Bad Request",
					`Maximum ${MAX_IMAGES_PER_PRODUCT} images per product. Current: ${currentCount}, adding: ${createCount}, deleting: ${deleteCount}`,
				);
			}

			if (newTotal < 1) {
				return status(
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
			return status("Bad Gateway", uploadErr ?? "Upload failed");
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
				});

				// 2. CREATE new images
				if (imagesOps?.create && imagesOps.create.length > 0) {
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
		return { data: null, error: error ?? "Upload failed" };
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
		| typeof ProductModel.imageCreate.static
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
