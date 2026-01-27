import { uploadFile, utapi } from "@spice-world/server/lib/images";
import { prisma } from "@spice-world/server/lib/prisma";
import { status } from "elysia";
import type { UploadedFileData } from "uploadthing/types";
import { uploadFileErrStatus, type uuidGuard } from "../shared";
import type { CategoryModel } from "./model";

export const categoryService = {
	async get({ skip, take, name }: CategoryModel.getQuery) {
		const categories = await prisma.category.findMany({
			skip,
			take,
			where: {
				name: {
					contains: name,
				},
			},
			include: {
				image: {
					select: {
						url: true,
					},
				},
			},
		});
		return categories;
	},

	async getById({ id }: uuidGuard) {
		return await prisma.category.findUniqueOrThrow({
			where: { id },
			include: {
				image: true,
				attributes: {
					include: { values: true },
				},
			},
		});
	},

	async post({ name, file, attributes }: CategoryModel.postBody) {
		const { data: image, error: fileError } = await uploadFile(name, file);
		if (fileError || !image) {
			return uploadFileErrStatus(fileError);
		}

		try {
			const category = await prisma.category.create({
				data: {
					name,
					image: {
						create: {
							key: image.key,
							url: image.ufsUrl,
							altText: name,
							isThumbnail: true,
						},
					},
					...(attributes?.create &&
						attributes.create.length > 0 && {
							attributes: {
								create: attributes.create.map((attr) => ({
									name: attr.name,
									values: {
										createMany: {
											data: attr.values.map((value) => ({ value })),
										},
									},
								})),
							},
						}),
				},
				include: {
					image: true,
					attributes: {
						include: {
							values: true,
						},
					},
				},
			});
			return status("Created", category);
		} catch (err: unknown) {
			await utapi.deleteFiles(image.key); // Cleanup uploaded file
			throw err;
		}
	},

	async patch({
		id,
		name,
		file,
		attributes,
	}: CategoryModel.patchBody & uuidGuard) {
		let newFile: UploadedFileData | null = null;

		if (file) {
			const { data: image, error: fileError } = await uploadFile(name, file);
			if (fileError || !image) {
				return { data: null, error: uploadFileErrStatus(fileError) };
			}
			newFile = image;
		}

		try {
			const tx = await prisma.$transaction(async (tx) => {
				const category = await tx.category.findUniqueOrThrow({
					where: { id },
					include: {
						image: { select: { key: true } },
						attributes: { include: { values: true } },
					},
				});

				if (attributes) {
					if (attributes.create) {
						const existingNames = category.attributes.map((a) => a.name);
						const newNames = attributes.create.map((a) => a.name);
						const duplicates = newNames.filter((n) =>
							existingNames.includes(n),
						);
						if (duplicates.length > 0) {
							throw status(
								"Conflict",
								`Attribute names already exist: ${duplicates.join(", ")}`,
							);
						}
					}

					if (attributes.update) {
						const updateIds = attributes.update.map((u) => u.id);
						const updateNames = attributes.update
							.filter((u) => u.name !== undefined)
							.map((u) => u.name as string);
						const otherAttributes = category.attributes
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

						// Validation for values operations
						for (const attrUpdate of attributes.update) {
							const existingAttr = category.attributes.find(
								(a) => a.id === attrUpdate.id,
							);
							if (!existingAttr) {
								throw status(
									"Not Found",
									`Attribute ${attrUpdate.id} not found`,
								);
							}

							if (attrUpdate.values?.create) {
								// Check for duplicates with existing values
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
								// Verify all value IDs exist
								const valueIds = existingAttr.values.map((v) => v.id);
								const invalidIds = attrUpdate.values.delete.filter(
									(id) => !valueIds.includes(id),
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

				const updatedCategory = await tx.category.update({
					where: { id },
					data: {
						name,
						...(newFile && {
							image: {
								update: {
									key: newFile.key,
									url: newFile.ufsUrl,
								},
							},
						}),
						...(attributes && {
							attributes: {
								...(attributes.create &&
									attributes.create.length > 0 && {
										create: attributes.create.map((attr) => ({
											name: attr.name,
											values: {
												createMany: {
													data: attr.values.map((value) => ({ value })),
												},
											},
										})),
									}),
								...(attributes.update &&
									attributes.update.length > 0 && {
										update: attributes.update.map((attr) => ({
											where: { id: attr.id },
											data: {
												...(attr.name && { name: attr.name }),
												...(attr.values && {
													values: {
														...(attr.values.create && {
															create: attr.values.create.map((value) => ({
																value,
															})),
														}),
														...(attr.values.delete && {
															deleteMany: {
																id: { in: attr.values.delete },
															},
														}),
													},
												}),
											},
										})),
									}),
								...(attributes.delete &&
									attributes.delete.length > 0 && {
										delete: attributes.delete.map((attrId) => ({ id: attrId })),
									}),
							},
						}),
					},
					include: {
						image: true,
						attributes: {
							include: {
								values: true,
							},
						},
					},
				});
				return { updatedCategory, oldImage: category.image };
			});

			return { data: tx, error: null };
		} catch (err: unknown) {
			newFile && (await utapi.deleteFiles(newFile.key));
			throw err;
		}
	},

	async delete({ id }: uuidGuard) {
		const tx = await prisma.$transaction(async (tx) => {
			const deletedCategory = await tx.category.delete({ where: { id } });
			const deletedImage = await tx.image.delete({
				where: { id: deletedCategory.imageId },
			});
			return {
				deletedCategory,
				deletedImage,
			};
		});

		return tx;
	},

	async count() {
		const count = await prisma.category.count();
		return count;
	},
};
