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
			Product[]
		>`SELECT p.*${selectClause} FROM "Product" p ${whereClause}
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
	}: ProductModel.postBody) {
		const { data: uploadedImages, error: uploadError } = await uploadFiles(
			name,
			images,
		);
		if (uploadError || !uploadedImages) {
			return status("Bad Gateway", uploadError);
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
						...(uploadedImages.length > 0 && {
							images: {
								createMany: {
									data: uploadedImages.map((img, index) => ({
										key: img.key,
										url: img.ufsUrl,
										altText: `$nameimage $index + 1`,
										isThumbnail: index === 0, // First image is thumbnail by default
									})),
								},
							},
						}),
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
						select: { id: true },
					}),
				]);

				const allowedAttributeValueIds = new Set(
					allowedAttributeValues.map((a) => a.id),
				);

				const createdVariants = await Promise.all(
					variants.map((variant) => {
						// This check if an attribute ID from another category is set, which is forbidden
						validateVariantAttributeValues(
							variant.sku ?? "",
							variant.attributeValueIds,
							allowedAttributeValueIds,
						);
						// createMany does not handle connect
						return tx.productVariant.create({
							data: {
								productId: product.id,
								price: variant.price,
								sku: variant.sku,
								stock: variant.stock || 0,
								currency: variant.currency || "EUR",
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
			uploadedImages.length > 0 &&
				(await utapi.deleteFiles(uploadedImages.map((img) => img.key)));
			throw err;
		}
	},

	async beforePatchUploadImages({
		id,
		images,
		_version,
		name,
		imagesCreate,
	}: uuidGuard & {
		images: ProductModel.imageOperations | undefined;
		imagesCreate: File[] | undefined;
		_version: number | undefined;
		name: string | undefined;
	}) {
		const product = await prisma.product.findUniqueOrThrow({
			where: { id },
			select: {
				images: true,
				name: true,
				version: true,
			},
		});
		if (imagesCreate && imagesCreate.length > 0) {
			if (_version !== undefined && product.version !== _version) {
				return {
					data: null,
					error: status(
						"Conflict",
						`Product has been modified. Expected version $_version, current is $product.version`,
					),
				};
			}

			// Validate total image count
			const deleteCount = images?.delete?.length ?? 0;
			const currentCount = product.images.length;
			const newTotal = currentCount - deleteCount + imagesCreate.length;

			if (newTotal > MAX_IMAGES_PER_PRODUCT) {
				return {
					data: null,
					error: status(
						"Bad Request",
						`Maximum $MAX_IMAGES_PER_PRODUCTimages per product. Current: $currentCount, attempting to add: $imagesCreate.length, deleting: $deleteCount`,
					),
				};
			}

			const { data: uploadedImages, error: uploadError } = await uploadFiles(
				name ?? product.name,
				imagesCreate,
			);

			if (uploadError || !uploadedImages) {
				return {
					data: null,
					error: status("Bad Gateway", uploadError ?? "Upload failed"),
				};
			}

			return {
				data: { uploadedImages, oldImages: product.images },
				error: null,
			};
		}
		return {
			data: { uploadedImages: null, oldImages: product.images },
			error: null,
		};
	},

	async patch({
		id,
		name,
		status: productStatus,
		description,
		categoryId,
		images,
		variants,
		uploadedImages,
	}: ProductModel.patchBody &
		uuidGuard & { uploadedImages: UploadedFileData[] | null }) {
		try {
			const product = await prisma.$transaction(async (tx) => {
				// 1. - Update base product
				const updatedProduct = await tx.product.update({
					where: { id },
					data: {
						name,
						slug: name ? name.toLowerCase().replace(/s+/g, "-") : undefined,
						description,
						version: { increment: 1 },
						status: productStatus,
						category: categoryId ? { connect: { id: categoryId } } : undefined,
						// Update with the new given images
						images: {
							...(uploadedImages &&
								uploadedImages.length > 0 && {
									createMany: {
										data: uploadedImages.map((img) => ({
											key: img.key,
											url: img.ufsUrl,
											altText: img.name,
											isThumbnail: false, // Don't automatically make new images thumbnails
										})),
									},
								}),

							...(images?.update &&
								images.update.length > 0 && {
									update: images.update.map((img) => ({
										where: { id: img.id },
										data: {
											...(img.altText !== undefined && {
												altText: img.altText,
											}),
											...(img.isThumbnail !== undefined && {
												isThumbnail: img.isThumbnail,
											}),
										},
									})),
								}),

							...(images?.delete &&
								images.delete.length > 0 && {
									deleteMany: { id: { in: images.delete } },
								}),
						},
					},
					include: {
						images: true,
					},
				});

				const promises = [];
				if (variants) {
					const allowedAttributeValueIds = new Set(
						(
							await tx.attributeValue.findMany({
								where: { attribute: { categoryId: updatedProduct.categoryId } },
								select: { id: true },
							})
						).map((v) => v.id),
					);

					if (variants.delete && variants.delete.length > 0) {
						promises.push(
							tx.productVariant.deleteMany({
								where: { id: { in: variants.delete }, productId: id },
							}),
						);
					}

					if (variants.update && variants.update.length > 0) {
						variants.update.forEach((variant) => {
							validateVariantAttributeValues(
								variant.id,
								variant.attributeValueIds,
								allowedAttributeValueIds,
							);
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
								allowedAttributeValueIds,
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
				const updatedVariants = await tx.productVariant.findMany({
					where: { productId: id },
					include: {
						attributeValues: true,
					},
				});

				return {
					...updatedProduct,
					variants: updatedVariants,
				};
			});
			return product;
		} catch (err: unknown) {
			if (uploadedImages && uploadedImages.length > 0) {
				await Promise.all(
					uploadedImages.map((img) => utapi.deleteFiles(img.key)),
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
	allowedAttributeValueIds: Set<string>,
) {
	if (!attributeValueIds || attributeValueIds.length === 0) return;

	const invalidIds = attributeValueIds.filter(
		(id) => !allowedAttributeValueIds.has(id),
	);

	if (invalidIds.length > 0) {
		throw status(
			"Bad Request",
			`Invalid attribute values for variant ${variantSkuOrId}: ${invalidIds.join(
				", ",
			)}. Attribute values should match product category.`,
		);
	}
}
