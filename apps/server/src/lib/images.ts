import { ResizeFit, Transformer } from "@napi-rs/image";
import type { BunFile } from "bun";
import { UTApi } from "uploadthing/server";
import type { UploadedFileData } from "uploadthing/types";

export const utapi = new UTApi({
	token: process.env.UPLOADTHING_TOKEN,
});

// Image size configurations for multi-size upload
const IMAGE_SIZES = {
	thumb: { width: 128, quality: 75 },
	medium: { width: 500, quality: 80 },
	large: { width: 1500, quality: 85 },
} as const;

type ImageSize = keyof typeof IMAGE_SIZES;

export interface MultiSizeUploadData {
	thumb: UploadedFileData;
	medium: UploadedFileData;
	large: UploadedFileData;
}

// Upload a single size variant of an image
const _uploadSingleSize = async (
	filename: string,
	file: File | BunFile,
	size: ImageSize,
) => {
	const config = IMAGE_SIZES[size];
	const arrayBuffer = await file.arrayBuffer();
	const buffer = Buffer.from(arrayBuffer);
	const transformer = new Transformer(buffer);
	const outputBuffer = await transformer
		.resize({ width: config.width, height: config.width, fit: ResizeFit.Cover })
		.webp(config.quality);

	return await utapi.uploadFiles(
		new File([new Uint8Array(outputBuffer)], `${filename}-${size}.webp`),
	);
};

// Upload all size variants of an image
const _uploadFile = async (filename: string, file: File | BunFile) => {
	const sizes: ImageSize[] = ["thumb", "medium", "large"];
	const uploadPromises = sizes.map((size) =>
		_uploadSingleSize(filename, file, size),
	);
	const results = await Promise.all(uploadPromises);

	// Check for errors in any upload
	const errors = results.filter((r) => r.error);
	if (errors.length > 0) {
		// Cleanup successful uploads if any failed
		for (const result of results) {
			if (result.data) {
				await utapi.deleteFiles(result.data.key);
			}
		}
		// biome-ignore lint/style/noNonNullAssertion: ok
		return { data: null, error: errors[0]!.error };
	}

	return {
		data: {
			// biome-ignore-start lint/style/noNonNullAssertion: ok
			thumb: results[0]!.data as UploadedFileData,
			medium: results[1]!.data as UploadedFileData,
			large: results[2]!.data as UploadedFileData,
			// biome-ignore-end lint/style/noNonNullAssertion: ok
		} as MultiSizeUploadData,
		error: null,
	};
};

export const uploadFile = async (filename: string, file: File | BunFile) => {
	for (let attempt = 0; attempt < 3; attempt++) {
		const resp = await _uploadFile(filename, file);
		if (resp.error && attempt === 2) return { data: null, error: resp.error };
		if (resp.error && attempt < 2) continue;
		if (resp.data) return { data: resp.data, error: null };
	}

	return {
		data: null,
		error: { message: "Upload failed after 3 attempts" },
	};
};

export const uploadFiles = async (
	filename: string,
	files: Array<File | BunFile>,
) => {
	const uploadPromises = files.map((file, i) => {
		return uploadFile(
			`${filename.toLowerCase().replace(/\s+/g, "-")}-${i}`,
			file,
		);
	});
	const results = await Promise.all(uploadPromises);

	// Check for errors in the results
	const errors = results.filter((result) => result.error);
	const successfulUploads = results.filter(
		(result): result is { data: MultiSizeUploadData; error: null } =>
			!!result?.data,
	);

	if (errors.length > 0) {
		// Clean up if any upload has failed
		for (const upload of successfulUploads) {
			await utapi.deleteFiles([
				upload.data.thumb.key,
				upload.data.medium.key,
				upload.data.large.key,
			]);
		}
		return { data: null, error: errors.map((e) => e.error).join(", ") };
	}

	return { data: successfulUploads.map((upload) => upload.data), error: null };
};
