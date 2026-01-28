import {
	attribute,
	attributeValue,
	category,
	db,
	image,
} from "@spice-world/server/db";
import { uploadFile, utapi } from "@spice-world/server/lib/images";
import { NotFoundError } from "@spice-world/server/plugins/db.plugin";
import { and, eq, ilike, inArray } from "drizzle-orm";
import { status } from "elysia";
import type { UploadedFileData } from "uploadthing/types";
import { uploadFileErrStatus, type uuidGuard } from "../shared";
import type { CategoryModel } from "./model";

export const categoryService = {
	async get({ skip, take, name }: CategoryModel.getQuery) {
		const categories = await db.query.category.findMany({
			limit: take,
			offset: skip,
			where: name ? ilike(category.name, `%${name}%`) : undefined,
			with: {
				image: {
					columns: { url: true },
				},
			},
		});
		return categories;
	},

	async getById({ id }: uuidGuard) {
		const result = await db.query.category.findFirst({
			where: eq(category.id, id),
			with: {
				image: true,
				attributes: {
					with: { values: true },
				},
			},
		});

		if (!result) {
			throw new NotFoundError("Category");
		}

		return result;
	},

	async post({ name, file, attributes: attrs }: CategoryModel.postBody) {
		const { data: uploadedImage, error: fileError } = await uploadFile(
			name,
			file,
		);
		if (fileError || !uploadedImage) {
			return uploadFileErrStatus(fileError);
		}

		try {
			// Create image first
			const [newImage] = await db
				.insert(image)
				.values({
					key: uploadedImage.key,
					url: uploadedImage.ufsUrl,
					altText: name,
					isThumbnail: true,
				})
				.returning();

			if (!newImage) {
				throw new Error("Failed to create image");
			}

			// Create category
			const [newCategory] = await db
				.insert(category)
				.values({
					name,
					imageId: newImage.id,
				})
				.returning();

			if (!newCategory) {
				throw new Error("Failed to create category");
			}

			// Create attributes if provided
			if (attrs?.create && attrs.create.length > 0) {
				for (const attr of attrs.create) {
					const [newAttr] = await db
						.insert(attribute)
						.values({
							name: attr.name,
							categoryId: newCategory.id,
						})
						.returning();

					if (newAttr && attr.values.length > 0) {
						await db.insert(attributeValue).values(
							attr.values.map((value) => ({
								value,
								attributeId: newAttr.id,
							})),
						);
					}
				}
			}

			// Fetch the complete category
			const createdCategory = await db.query.category.findFirst({
				where: eq(category.id, newCategory.id),
				with: {
					image: true,
					attributes: {
						with: { values: true },
					},
				},
			});

			return status("Created", createdCategory);
		} catch (err: unknown) {
			await utapi.deleteFiles(uploadedImage.key);
			throw err;
		}
	},

	async patch({
		id,
		name,
		file,
		attributes: attrs,
	}: CategoryModel.patchBody & uuidGuard) {
		let newFile: UploadedFileData | null = null;

		if (file) {
			const { data: uploadedImage, error: fileError } = await uploadFile(
				name,
				file,
			);
			if (fileError || !uploadedImage) {
				return { data: null, error: uploadFileErrStatus(fileError) };
			}
			newFile = uploadedImage;
		}

		try {
			// Fetch current category
			const currentCategory = await db.query.category.findFirst({
				where: eq(category.id, id),
				with: {
					image: { columns: { key: true } },
					attributes: { with: { values: true } },
				},
			});

			if (!currentCategory) {
				throw new NotFoundError("Category");
			}

			// Validate attributes operations
			if (attrs) {
				if (attrs.create) {
					const existingNames = currentCategory.attributes.map((a) => a.name);
					const newNames = attrs.create.map((a) => a.name);
					const duplicates = newNames.filter((n) => existingNames.includes(n));
					if (duplicates.length > 0) {
						throw status(
							"Conflict",
							`Attribute names already exist: ${duplicates.join(", ")}`,
						);
					}
				}

				if (attrs.update) {
					const updateIds = attrs.update.map((u) => u.id);
					const updateNames = attrs.update
						.filter((u) => u.name !== undefined)
						.map((u) => u.name as string);
					const otherAttributes = currentCategory.attributes
						.filter((a) => !updateIds.includes(a.id))
						.map((a) => a.name);
					const conflicts = updateNames.filter((n) =>
						otherAttributes.includes(n),
					);
					if (conflicts.length > 0) {
						throw status(
							"Conflict",
							`Attribute name conflicts: ${conflicts.join(", ")}`,
						);
					}

					for (const attrUpdate of attrs.update) {
						const existingAttr = currentCategory.attributes.find(
							(a) => a.id === attrUpdate.id,
						);
						if (!existingAttr) {
							throw status("Not Found", `Attribute ${attrUpdate.id} not found`);
						}

						if (attrUpdate.values?.create) {
							const existingValues = existingAttr.values.map((v) => v.value);
							const newValues = attrUpdate.values.create;
							const duplicates = newValues.filter((v) =>
								existingValues.includes(v),
							);

							if (duplicates.length > 0) {
								throw status(
									"Conflict",
									`Attribute ${existingAttr.name} already has values: ${duplicates.join(", ")}`,
								);
							}
						}

						if (attrUpdate.values?.delete) {
							const valueIds = existingAttr.values.map((v) => v.id);
							const invalidIds = attrUpdate.values.delete.filter(
								(valId) => !valueIds.includes(valId),
							);

							if (invalidIds.length > 0) {
								throw status(
									"Not Found",
									`Value IDs not found: ${invalidIds.join(", ")}`,
								);
							}
						}
					}
				}
			}

			// Update category name
			await db.update(category).set({ name }).where(eq(category.id, id));

			// Update image if new file provided
			if (newFile) {
				await db
					.update(image)
					.set({
						key: newFile.key,
						url: newFile.ufsUrl,
					})
					.where(eq(image.id, currentCategory.imageId));
			}

			// Handle attributes operations
			if (attrs) {
				// Delete attributes
				if (attrs.delete && attrs.delete.length > 0) {
					await db
						.delete(attribute)
						.where(
							and(
								eq(attribute.categoryId, id),
								inArray(attribute.id, attrs.delete),
							),
						);
				}

				// Update attributes
				if (attrs.update && attrs.update.length > 0) {
					for (const attrUpdate of attrs.update) {
						if (attrUpdate.name) {
							await db
								.update(attribute)
								.set({ name: attrUpdate.name })
								.where(eq(attribute.id, attrUpdate.id));
						}

						if (attrUpdate.values?.create) {
							await db.insert(attributeValue).values(
								attrUpdate.values.create.map((value) => ({
									value,
									attributeId: attrUpdate.id,
								})),
							);
						}

						if (attrUpdate.values?.delete) {
							await db
								.delete(attributeValue)
								.where(inArray(attributeValue.id, attrUpdate.values.delete));
						}
					}
				}

				// Create new attributes
				if (attrs.create && attrs.create.length > 0) {
					for (const attr of attrs.create) {
						const [newAttr] = await db
							.insert(attribute)
							.values({
								name: attr.name,
								categoryId: id,
							})
							.returning();

						if (newAttr && attr.values.length > 0) {
							await db.insert(attributeValue).values(
								attr.values.map((value) => ({
									value,
									attributeId: newAttr.id,
								})),
							);
						}
					}
				}
			}

			// Fetch updated category
			const updatedCategory = await db.query.category.findFirst({
				where: eq(category.id, id),
				with: {
					image: true,
					attributes: {
						with: { values: true },
					},
				},
			});

			return {
				data: { updatedCategory, oldImage: currentCategory.image },
				error: null,
			};
		} catch (err: unknown) {
			newFile && (await utapi.deleteFiles(newFile.key));
			throw err;
		}
	},

	async delete({ id }: uuidGuard) {
		// Fetch category to get image ID
		const categoryToDelete = await db.query.category.findFirst({
			where: eq(category.id, id),
		});

		if (!categoryToDelete) {
			throw new NotFoundError("Category");
		}

		// Delete category (will cascade to attributes due to onDelete: cascade)
		const [deletedCategory] = await db
			.delete(category)
			.where(eq(category.id, id))
			.returning();

		// Delete the image
		const [deletedImage] = await db
			.delete(image)
			.where(eq(image.id, categoryToDelete.imageId))
			.returning();

		return {
			deletedCategory,
			deletedImage,
		};
	},

	async count() {
		const result = await db.select().from(category);
		return result.length;
	},
};
