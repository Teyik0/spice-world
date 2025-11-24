import type { BunFile } from "bun";
import sharp from "sharp";

import { UTApi } from "uploadthing/server";
import type { UploadedFileData } from "uploadthing/types";

export const utapi = new UTApi({
	token: process.env.UPLOADTHING_TOKEN as string,
});

const _uploadFile = async (filename: string, file: File | BunFile) => {
	const arrayBuffer = await file.arrayBuffer();
	const buffer = Buffer.from(arrayBuffer);
	const outputImageBuffer = await sharp(buffer)
		.resize(200, 200)
		.webp()
		.toBuffer();

	return await utapi.uploadFiles(
		new File([outputImageBuffer.buffer as ArrayBuffer], `${filename}.webp`),
	);
};

export const uploadFile = async (filename: string, file: File | BunFile) => {
	for (let attempt = 0; attempt < 3; attempt++) {
		const resp = await _uploadFile(filename, file);
		if (resp.error && attempt === 2) return { data: null, error: resp.error };
		if (resp.error && attempt < 2) continue;
		if (resp.data) return { data: resp.data, error: null };
	}

	return { data: null, error: { message: "Upload failed after 3 attempts" } };
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
		(result): result is { data: UploadedFileData; error: null } =>
			!!result?.data,
	);

	if (errors.length > 0) {
		// Clean up if only one upload has failed
		for (const file of successfulUploads) {
			await utapi.deleteFiles(file.data.key);
		}
		return { data: null, error: errors.map((e) => e.error).join(", ") };
	}

	return { data: successfulUploads.map((upload) => upload.data), error: null };
};
