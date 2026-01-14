import { uploadFiles } from "@spice-world/server/lib/images";
import type { PrismaClient } from "@spice-world/server/prisma/client";
import type { UploadedFileData } from "uploadthing/types";
import type { ValidationResult } from "../../shared";
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

/**
 * Uploads files from specified indices and returns a map of index -> uploaded data.
 */
export async function uploadFilesFromIndices({
	referencedIndices,
	images,
	productName,
}: {
	referencedIndices: number[];
	images: File[];
	productName: string;
}): Promise<ValidationResult<Map<number, UploadedFileData>>> {
	const sortedIndices = [...referencedIndices].sort((a, b) => a - b);
	const filesToUpload = sortedIndices.map((idx) => images[idx] as File);
	const { data: uploaded, error } = await uploadFiles(
		productName,
		filesToUpload,
	);

	if (error || !uploaded) {
		return {
			success: false,
			error: {
				code: "UPLOAD_FAILED",
				message: error || "File upload failed",
			},
		};
	}

	const uploadMap = new Map<number, UploadedFileData>();
	uploaded.forEach((file, i) => {
		uploadMap.set(sortedIndices[i] as number, file);
	});

	return { success: true, data: uploadMap };
}
