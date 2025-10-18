import { Elysia, t } from "elysia";
import type { UploadedFileData } from "uploadthing/types";
import { uploadFiles, utapi } from "../lib/images";
import { prisma } from "../lib/prisma";
import { tryCatch } from "../lib/trycatch";
import { prismaErrorPlugin } from "../plugins/prisma.plugin";
import type {
	Prisma,
	ProductStatus as PrismaProductStatus,
} from "../prisma/client";

const SortField = t.Union([
	t.Literal("name"),
	t.Literal("createdAt"),
	t.Literal("updatedAt"),
	t.Literal("price"),
]);
const SortDirection = t.Union([t.Literal("asc"), t.Literal("desc")]);
export const nameType = t.String({
	pattern: "^[A-ZÀ-Ý][a-zà-ÿ ]*$",
	default: "Hello world",
});
export const ProductStatus = t.Union(
	[t.Literal("DRAFT"), t.Literal("PUBLISHED"), t.Literal("ARCHIVED")],
	{
		additionalProperties: false,
	},
);

const MAX_IMAGES_PER_PRODUCT = 5;

export const productsRouter = new Elysia({
	name: "products",
	prefix: "/products",
	tags: ["Products"],
})
	.use(prismaErrorPlugin("Product"))
	.get(
		"/",
		async ({
			query: { skip, take, name, status, categories, sortBy, sortDir },
		}) => {
			const direction = sortDir || "asc";
			const orderByField = sortBy || "name";

			// Base query
			const baseQuery: Prisma.ProductFindManyArgs = {
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
				include: {
					category: true,
					images: true,
					variants: {
						orderBy: {
							price: direction,
						},
						include: {
							attributeValues: true,
						},
					},
					tags: true,
				},
			};

			// Add sorting
			if (sortBy === "price") {
				// Fetch products with variants ordered by price
				const products = (await prisma.product.findMany(baseQuery)) as Array<{
					id: string;
					name: string;
					slug: string;
					description: string;
					status: PrismaProductStatus;
					categoryId: string | null;
					createdAt: Date;
					updatedAt: Date;
					variants: Array<{
						price: number;
					}>;
				}>;

				// Sort products by the price of the first variant
				products.sort((a, b) => {
					const aMinPrice =
						a.variants.length > 0
							? a.variants[0].price
							: Number.POSITIVE_INFINITY;
					const bMinPrice =
						b.variants.length > 0
							? b.variants[0].price
							: Number.POSITIVE_INFINITY;
					return direction === "asc"
						? aMinPrice - bMinPrice
						: bMinPrice - aMinPrice;
				});

				return products;
			}
			return prisma.product.findMany({
				...baseQuery,
				orderBy: {
					[orderByField]: direction,
				},
			});
		},
		{
			query: t.Object({
				skip: t.Optional(t.Number({ default: 0, minimum: 0 })),
				take: t.Optional(t.Number({ default: 25, minimum: 1, maximum: 100 })),
				name: t.Optional(t.String()),
				status: t.Optional(ProductStatus),
				categories: t.Optional(t.Array(t.String())),
				sortBy: t.Optional(SortField),
				sortDir: t.Optional(SortDirection),
			}),
		},
	)
	.get(
		"/count",
		async ({ query: { status } }) => {
			const where = status ? { status } : {};
			return prisma.product.count({ where });
		},
		{
			query: t.Object({
				status: t.Optional(ProductStatus),
			}),
		},
	)
	.post(
		"/",
		async ({
			body: {
				name,
				description,
				categoryId,
				status: productStatus,
				tags,
				variants,
				images,
			},
			status,
		}) => {
			const { data: uploadedImages, error: uploadError } = await uploadFiles(
				name,
				images,
			);
			if (uploadError || !uploadedImages) {
				return status("Precondition Failed", uploadError);
			}

			const product = await prisma.$transaction(async (tx) => {
				const product = await tx.product.create({
					data: {
						name,
						slug: name.toLowerCase().replace(/\s+/g, "-"),
						description,
						status: productStatus || "DRAFT",
						categoryId,
						...(tags &&
							tags.length > 0 && {
								tags: {
									connect: tags.map((tagId) => ({
										id: tagId,
									})),
								},
							}),
						...(uploadedImages.length > 0 && {
							images: {
								createMany: {
									data: uploadedImages.map((img, index) => ({
										key: img.key,
										url: img.ufsUrl,
										altText: `${name} image ${index + 1}`,
										isThumbnail: index === 0, // First image is thumbnail by default
									})),
								},
							},
						}),
					},
					include: {
						category: true,
						tags: true,
						images: true,
					},
				});

				if (variants && variants.length > 0) {
					await Promise.all(
						variants.map((variant) =>
							tx.productVariant.create({
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
							}),
						),
					);
				}

				// Return the product with all relations
				return tx.product.findUnique({
					where: { id: product.id },
					include: {
						category: true,
						tags: true,
						images: true,
						variants: {
							include: {
								attributeValues: true,
							},
						},
					},
				});
			});

			return status("Created", product);
		},
		{
			body: t.Object({
				name: nameType,
				description: t.String(),
				categoryId: t.Optional(t.String({ format: "uuid" })),
				status: t.Optional(ProductStatus),
				tags: t.Optional(
					t.ArrayString(t.String({ format: "uuid" }), { minItems: 1 }),
				),
				variants: t.Optional(
					t.ArrayString(
						t.Object({
							price: t.Number({ minimum: 0 }),
							sku: t.Optional(t.String()),
							stock: t.Optional(t.Number({ minimum: 0, default: 0 })),
							currency: t.Optional(t.String({ default: "EUR" })),
							attributeValueIds: t.Array(t.String({ format: "uuid" })),
						}),
					),
				),
				images: t.Files({
					minItems: 1,
					maxItems: MAX_IMAGES_PER_PRODUCT,
				}),
			}),
			beforeHandle: async ({ body: { name }, status }) => {
				const existingProduct = await prisma.product.findFirst({
					where: { name },
				});

				if (existingProduct) {
					return status(
						"Conflict",
						`Product with name "${name}" already exists`,
					);
				}
			},
		},
	)
	.guard({ params: t.Object({ id: t.String({ format: "uuid" }) }) })
	.resolve(async ({ params: { id }, status }) => {
		const product = await prisma.product.findUnique({
			where: { id },
			include: {
				category: true,
				images: true,
				tags: true,
				variants: {
					include: {
						attributeValues: true,
					},
				},
			},
		});

		if (!product) {
			return status("Not Found", "Product not found");
		}

		return { product };
	})
	.get("/:id", async ({ product }) => product)
	.patch(
		"/:id",
		async ({
			product,
			body: {
				name,
				description,
				categoryId,
				status: productStatus,
				tags,
				variants,
				images,
			},
			status,
		}) => {
			// 1. Handle new image uploads if any
			let uploadedImages: UploadedFileData[] | null = null;
			if (images && images.length > 0) {
				const totalImageCount = product.images.length + images.length;
				if (totalImageCount > MAX_IMAGES_PER_PRODUCT) {
					return status(
						"Precondition Failed",
						"Maximum number of images exceeded",
					);
				}

				const { data, error: uploadError } = await uploadFiles(
					name || product.name,
					images,
				);

				if (uploadError) {
					return status("Precondition Failed", uploadError);
				}

				uploadedImages = data || [];
			}

			// 2. Update the product with transaction to ensure consistency
			const { data: updatedProduct, error: prismaError } = await tryCatch(
				prisma.$transaction(async (tx) => {
					// 2.1. Update base product
					const productUpdate: Prisma.ProductUpdateInput = {
						name,
						slug: name ? name.toLowerCase().replace(/\s+/g, "-") : undefined,
						description,
						status: productStatus,
						...(categoryId && {
							category: { connect: { id: categoryId } },
						}),
					};

					// 2.2. Handle tag updates if provided
					if (tags && tags?.length > 0) {
						// 2.2.1 Disconnect all existing tags first
						await tx.product.update({
							where: { id: product.id },
							data: {
								tags: {
									set: [], // Remove all existing connections
								},
							},
						});

						// 2.2.2 Then connect the new tags
						productUpdate.tags = {
							connect: tags.map((tagId) => ({ id: tagId })),
						};
					}

					// 2.3. Add new images if provided
					if (uploadedImages && uploadedImages.length > 0) {
						productUpdate.images = {
							createMany: {
								data: uploadedImages.map((img) => ({
									key: img.key,
									url: img.ufsUrl,
									altText: `${name || product.name} image`,
									isThumbnail: false, // Don't automatically make new images thumbnails
								})),
							},
						};
					}

					// 2.4. Update the product with all non-variant changes
					await tx.product.update({
						where: { id: product.id },
						data: productUpdate,
						include: {
							variants: {
								include: {
									attributeValues: true,
								},
							},
						},
					});

					// 2.5 Handling variants
					if (variants && variants.length > 0) {
						// 2.5.1 Disconnect all existing variants first
						await tx.productVariant.deleteMany({
							where: { productId: product.id },
						});

						// 2.5.2 Then connect the new variants
						await Promise.all(
							variants.map((variant) =>
								tx.productVariant.create({
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
								}),
							),
						);
					}

					// Return the updated product with all relations
					return tx.product.findUnique({
						where: { id: product.id },
						include: {
							category: true,
							tags: true,
							images: true,
							variants: {
								include: {
									attributeValues: true,
								},
							},
						},
					});
				}),
			);

			if (prismaError) {
				// Clean up uploaded images if transaction failed
				if (uploadedImages && uploadedImages.length > 0) {
					await Promise.all(
						uploadedImages.map((img) => utapi.deleteFiles(img.key)),
					);
				}
				throw prismaError;
			}

			return updatedProduct;
		},
		{
			body: t.Object({
				name: t.Optional(t.String({ minLength: 3 })),
				description: t.Optional(t.String()),
				categoryId: t.Optional(t.String({ format: "uuid" })),
				status: t.Optional(ProductStatus),
				tags: t.Optional(t.ArrayString(t.String({ format: "uuid" }))),
				variants: t.Optional(
					t.ArrayString(
						t.Object({
							price: t.Number({ minimum: 0 }),
							sku: t.Optional(t.String()),
							stock: t.Optional(t.Number({ minimum: 0, default: 0 })),
							currency: t.Optional(t.String({ default: "EUR" })),
							attributeValueIds: t.ArrayString(t.String({ format: "uuid" })),
						}),
					),
				),
				images: t.Optional(t.Files({ maxItems: MAX_IMAGES_PER_PRODUCT })),
			}),
		},
	)
	.delete(
		"/:id",
		async ({ product }) => {
			const deletedProduct = await prisma.$transaction(async (tx) => {
				// Delete variants first
				await tx.productVariant.deleteMany({
					where: { productId: product.id },
				});

				// Delete the product (will cascade delete images)
				return tx.product.delete({
					where: { id: product.id },
					include: {
						category: true,
						tags: true,
						images: true,
					},
				});
			});

			return deletedProduct;
		},
		{
			afterResponse: async ({ product }) => {
				if (!product.images.length) return;

				// Clean up all image files
				await Promise.all(
					product.images.map(async (img) => {
						const { success } = await utapi.deleteFiles(img.key);
						if (!success) {
							console.warn(`Failed to delete image ${img.key}`);
						}
					}),
				);
			},
		},
	)
	// Special endpoints for image management
	.post(
		"/:id/images",
		async ({ product, body: { images }, status }) => {
			const { data: uploadedImgs, error: uploadError } = await uploadFiles(
				product.name,
				images,
			);

			if (uploadError || !uploadedImgs) {
				return status("Precondition Failed", uploadError || "Upload failed");
			}

			const { data: updatedImgs, error: prismaError } = await tryCatch(
				prisma.$transaction(async (tx) => {
					// Create the new image records
					const newImages = await Promise.all(
						uploadedImgs.map((img) =>
							tx.image.create({
								data: {
									key: img.key,
									url: img.ufsUrl,
									altText: `${product.name} image`,
									isThumbnail: false,
									productId: product.id,
								},
							}),
						),
					);

					// Update the product's image array
					const updatedProduct = await tx.product.update({
						where: { id: product.id },
						data: {
							images: {
								connect: newImages.map((img) => ({ id: img.id })),
							},
						},
						include: {
							images: true,
						},
					});

					return updatedProduct.images;
				}),
			);

			if (prismaError) {
				// Clean up uploaded files
				await Promise.all(
					uploadedImgs.map((img) => utapi.deleteFiles(img.key)),
				);
				throw prismaError;
			}

			return status("Created", updatedImgs);
		},
		{
			body: t.Object({
				images: t.Files({ minItems: 1, maxItems: MAX_IMAGES_PER_PRODUCT }),
			}),
			beforeHandle: ({ product, body: { images }, status }) => {
				if (images && images.length > 0) {
					const totalImageCount = product.images.length + images.length;
					if (totalImageCount > MAX_IMAGES_PER_PRODUCT) {
						return status(
							"Precondition Failed",
							"Maximum number of images exceeded",
						);
					}
				}
			},
		},
	);
