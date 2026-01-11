import { uploadFiles } from "@spice-world/server/lib/images";
import { prisma } from "@spice-world/server/lib/prisma";
import type { UploadedFileData } from "uploadthing/types";
import type { ValidationResult } from "../../shared";
import type { ProductModel } from "../model";
import { validateImagesOps } from "./images";

/**
 * Validates thumbnail count for product creation.
 * - Allows 0 or 1 thumbnail (auto-assign first if none)
 * - Throws error if multiple thumbnails specified
 */
export function validateThumbnailCountForCreate(
	imagesOps: ProductModel.imageOperations | undefined,
): ValidationResult<void> {
	if (!imagesOps?.create?.length) {
		return { success: true, data: undefined };
	}

	const thumbnailCount = imagesOps.create.filter(
		(op) => op.isThumbnail === true,
	).length;

	if (thumbnailCount > 1) {
		return {
			success: false,
			error: {
				code: "VIO_CREATE_THUMBNAILS",
				message: `Only one image can be set as thumbnail (${thumbnailCount} found)`,
			},
		};
	}

	return { success: true, data: undefined };
}

/**
 * Validates and uploads files, returning a map of file indices to uploaded data.
 */
/**
 * Fetches allowed attribute values for a category.
 * Returns a Map of valueId -> attributeId for validation.
 */
export async function fetchAllowedAttributeValues(
	categoryId: string,
): Promise<Map<string, string>> {
	const attributeValues = await prisma.attributeValue.findMany({
		where: { attribute: { categoryId } },
		select: { id: true, attributeId: true },
	});

	const map = new Map<string, string>();
	for (const value of attributeValues) {
		map.set(value.id, value.attributeId);
	}
	return map;
}

export async function validateAndUploadFiles(
	images: File[] | undefined,
	imagesOps: ProductModel.imageOperations | undefined,
	productName: string,
): Promise<ValidationResult<Map<number, UploadedFileData>>> {
	if (!images?.length || !imagesOps) {
		return { success: true, data: new Map<number, UploadedFileData>() };
	}

	// validateImagesOps now returns ValidationResult
	const imageValidation = validateImagesOps(images, imagesOps);
	if (!imageValidation.success) {
		return {
			success: false,
			error: imageValidation.error,
		};
	}

	return await uploadFilesFromIndices({
		referencedIndices: imageValidation.data,
		images,
		productName,
	});
}

export async function uploadFilesFromIndices({
	referencedIndices,
	images,
	productName,
}: {
	referencedIndices: number[];
	images: File[];
	productName: string;
}): Promise<ValidationResult<Map<number, UploadedFileData>>> {
	const sortedIndices = referencedIndices.sort((a, b) => a - b);
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
