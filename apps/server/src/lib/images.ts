import { ResizeFit, Transformer } from "@napi-rs/image";
import { env } from "@spice-world/server/lib/env";
import type { BunFile } from "bun";
import { UTApi } from "uploadthing/server";
import type { UploadedFileData } from "uploadthing/types";

export const utapi = new UTApi({
	token: env.UPLOADTHING_TOKEN,
});

// Image size configurations for multi-size upload
const IMAGE_SIZES = {
	thumb: { width: 128, quality: 75 },
	medium: { width: 500, quality: 80 },
	large: { width: 1200, quality: 85 },
} as const;

type ImageSize = keyof typeof IMAGE_SIZES;

export interface MultiSizeUploadData {
	thumb: UploadedFileData;
	medium: UploadedFileData;
	large: UploadedFileData;
}

interface ImageVariant {
	originalIndex: number;
	size: ImageSize;
	filename: string;
	file: File;
}

/**
 * Transform a single image to all 3 sizes in parallel
 * Returns variants ready for batch upload
 */
const transformImage = async (
	filename: string,
	file: File | BunFile,
	originalIndex: number,
): Promise<ImageVariant[]> => {
	const arrayBuffer = await file.arrayBuffer();
	const buffer = Buffer.from(arrayBuffer);

	const sizes: ImageSize[] = ["thumb", "medium", "large"];

	// Transform all sizes in parallel
	const transformPromises = sizes.map(async (size) => {
		const config = IMAGE_SIZES[size];
		const transformer = new Transformer(buffer);
		const outputBuffer = await transformer
			.resize({
				width: config.width,
				height: config.width,
				fit: ResizeFit.Cover,
			})
			.webp(config.quality);

		const variantFile = new File(
			[new Uint8Array(outputBuffer)],
			`${filename}-${size}.webp`,
		);

		return {
			originalIndex,
			size,
			filename: `${filename}-${size}.webp`,
			file: variantFile,
		};
	});

	return Promise.all(transformPromises);
};

/**
 * Upload all image variants in a single atomic batch call
 * All succeed or all fail
 */
const uploadBatch = async (
	allVariants: ImageVariant[],
): Promise<{ data: MultiSizeUploadData[] | null; error: string | null }> => {
	const filesToUpload = allVariants.map((variant) => variant.file);

	// Single atomic upload call
	const results = await utapi.uploadFiles(filesToUpload);

	// Check for any errors
	const errors = results.filter((r) => r.error);
	if (errors.length > 0) {
		// Cleanup any successful uploads
		const successfulUploads = results
			.filter((r) => r.data)
			.map((r) => r.data as UploadedFileData);

		if (successfulUploads.length > 0) {
			await utapi.deleteFiles(successfulUploads.map((u) => u.key));
		}

		return {
			data: null,
			error: errors.map((e) => e.error?.message || "Upload failed").join(", "),
		};
	}

	// Group results back by original image index
	const resultsByIndex = new Map<number, Partial<MultiSizeUploadData>>();

	for (let i = 0; i < allVariants.length; i++) {
		const variant = allVariants[i];
		const result = results[i];

		// biome-ignore lint/style/noNonNullAssertion: loop bounds guarantee existence
		if (!resultsByIndex.has(variant!.originalIndex)) {
			// biome-ignore lint/style/noNonNullAssertion: loop bounds guarantee existence
			resultsByIndex.set(variant!.originalIndex, {});
		}

		// biome-ignore lint/style/noNonNullAssertion: loop bounds guarantee existence
		const imageData = resultsByIndex.get(variant!.originalIndex)!;
		// biome-ignore lint/style/noNonNullAssertion: loop bounds guarantee existence
		imageData[variant!.size] = result!.data as UploadedFileData;
	}

	// Convert map to array maintaining order
	const numImages = Math.max(...allVariants.map((v) => v.originalIndex)) + 1;
	const uploadData: MultiSizeUploadData[] = [];

	for (let i = 0; i < numImages; i++) {
		const data = resultsByIndex.get(i);
		if (data?.thumb && data?.medium && data?.large) {
			uploadData.push(data as MultiSizeUploadData);
		}
	}

	return { data: uploadData, error: null };
};

/**
 * Delete uploaded files by their upload data
 * Useful for cleanup on rollback
 */
export const deleteUploads = async (
	uploads: MultiSizeUploadData[],
): Promise<void> => {
	if (uploads.length === 0) return;

	const keys = uploads.flatMap((upload) => [
		upload.thumb.key,
		upload.medium.key,
		upload.large.key,
	]);

	await utapi.deleteFiles(keys);
};

/**
 * Upload multiple images with all size variants
 * Atomic operation - all succeed or all fail
 */
export const uploadFiles = async (
	filename: string,
	files: Array<File | BunFile> | File | BunFile,
): Promise<{ data: MultiSizeUploadData[] | null; error: string | null }> => {
	try {
		// Transform all images to all sizes in parallel
		const transformPromises = Array.isArray(files)
			? files.map((file, index) => {
					const sanitizedFilename = `${filename.toLowerCase().replace(/\s+/g, "-")}-${index}`;
					return transformImage(sanitizedFilename, file, index);
				})
			: [
					transformImage(
						`${filename.toLowerCase().replace(/\s+/g, "-")}`,
						files,
						0,
					),
				];

		const transformedBatches = await Promise.all(transformPromises);

		// Flatten all variants into a single array
		const allVariants = transformedBatches.flat();

		// Single atomic upload
		const result = await uploadBatch(allVariants);

		return result;
	} catch (error) {
		return {
			data: null,
			error: error instanceof Error ? error.message : "Upload failed",
		};
	}
};
