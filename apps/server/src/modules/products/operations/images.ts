import type { PrismaClient } from "@spice-world/server/prisma/client";
import type { UploadedFileData } from "uploadthing/types";
import type { ProductModel } from "../model";

type PrismaTransaction = Omit<
	PrismaClient,
	"$connect" | "$disconnect" | "$on" | "$transaction" | "$use" | "$extends"
>;

export async function executeImageCreates(
	tx: PrismaTransaction,
	productId: string,
	productName: string,
	createOps: NonNullable<ProductModel.imageOperations["create"]>,
	uploadMap: Map<number, UploadedFileData>,
): Promise<void> {
	if (!createOps.length) return;

	const hasNewThumbnail = createOps.some((op) => op.isThumbnail === true);
	if (hasNewThumbnail) {
		await tx.image.updateMany({
			where: { productId },
			data: { isThumbnail: false },
		});
	}

	await tx.image.createMany({
		data: createOps.map((op) => {
			const file = uploadMap.get(op.fileIndex);
			if (!file) {
				throw new Error(`File not found for index ${op.fileIndex}`);
			}
			return {
				productId,
				key: file.key,
				url: file.ufsUrl,
				altText: op.altText || `${productName} image`,
				isThumbnail: op.isThumbnail ?? false,
			};
		}),
	});
}

export async function executeImageUpdates(
	tx: PrismaTransaction,
	productId: string,
	updateOps: NonNullable<ProductModel.imageOperations["update"]>,
	uploadMap: Map<number, UploadedFileData>,
): Promise<string[]> {
	if (!updateOps.length) return [];

	const oldKeysToDelete: string[] = [];

	const hasNewThumbnail = updateOps.some((op) => op.isThumbnail === true);
	if (hasNewThumbnail) {
		await tx.image.updateMany({
			where: { productId },
			data: { isThumbnail: false },
		});
	}

	for (const op of updateOps) {
		if (op.fileIndex !== undefined) {
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
					...(op.isThumbnail !== undefined && { isThumbnail: op.isThumbnail }),
				},
			});
		} else {
			await tx.image.update({
				where: { id: op.id },
				data: {
					...(op.altText !== undefined && { altText: op.altText }),
					...(op.isThumbnail !== undefined && { isThumbnail: op.isThumbnail }),
				},
			});
		}
	}

	return oldKeysToDelete;
}

export async function executeImageDeletes(
	tx: PrismaTransaction,
	productId: string,
	deleteIds: string[],
): Promise<string[]> {
	if (!deleteIds.length) return [];

	const toDelete = await tx.image.findMany({
		where: { id: { in: deleteIds }, productId },
		select: { key: true },
	});

	await tx.image.deleteMany({
		where: { id: { in: deleteIds }, productId },
	});

	return toDelete.map((img) => img.key);
}
