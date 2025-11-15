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
		const category = await prisma.category.findUnique({
			where: { id },
			include: {
				image: {
					select: {
						key: true,
						url: true,
					},
				},
			},
		});
		return category ?? status("Not Found", "Category not found");
	},

	async post({ name, file }: CategoryModel.postBody) {
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
				},
				select: {
					id: true,
					name: true,
					image: true,
				},
			});
			return status("Created", category);
		} catch (err: unknown) {
			await utapi.deleteFiles(image.key); // Cleanup uploaded file
			throw err;
		}
	},

	async patch({ id, name, file }: CategoryModel.patchBody & uuidGuard) {
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
					include: { image: { select: { key: true } } },
				});
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
					},
					include: { image: true },
				});
				return { updatedCategory, oldImage: category.image };
			});

			return { data: tx, error: null };
		} catch (err: unknown) {
			newFile && (await utapi.deleteFiles(newFile.key)); // Cleanup uploaded file
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

	async checkExists({ name }: { name: string }) {
		const category = await prisma.category.findUnique({
			where: { name },
		});
		return category !== null;
	},
};
