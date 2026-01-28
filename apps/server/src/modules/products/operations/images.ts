import type { PrismaClient } from "@spice-world/server/prisma/client";
import type { MultiSizeUploadData } from "../../../lib/images";
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
	uploadMap: Map<number, MultiSizeUploadData>,
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
				keyThumb: file.thumb.key,
				keyMedium: file.medium.key,
				keyLarge: file.large.key,
				urlThumb: file.thumb.url,
				urlMedium: file.medium.url,
				urlLarge: file.large.url,
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
	uploadMap: Map<number, MultiSizeUploadData>,
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
				select: { keyThumb: true, keyMedium: true, keyLarge: true },
			});
			if (oldImg) {
				oldKeysToDelete.push(oldImg.keyThumb, oldImg.keyMedium, oldImg.keyLarge);
			}

			const file = uploadMap.get(op.fileIndex);
			if (!file) {
				throw new Error(`File not found for index ${op.fileIndex}`);
			}

			await tx.image.update({
				where: { id: op.id },
				data: {
					keyThumb: file.thumb.key,
					keyMedium: file.medium.key,
					keyLarge: file.large.key,
					urlThumb: file.thumb.url,
					urlMedium: file.medium.url,
					urlLarge: file.large.url,
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
		select: { keyThumb: true, keyMedium: true, keyLarge: true },
	});

	await tx.image.deleteMany({
		where: { id: { in: deleteIds }, productId },
	});

	return toDelete.flatMap((img) => [img.keyThumb, img.keyMedium, img.keyLarge]);
}
