import { env } from "@spice-world/server/lib/env";
import { UTApi } from "uploadthing/server";
import type { UploadedFileData } from "uploadthing/types";

export const utapi = new UTApi({
  token: env.UPLOADTHING_TOKEN,
});

// Image size configurations for multi-size upload
const IMAGE_SIZES = {
  large: { quality: 85, width: 1200 },
  medium: { quality: 80, width: 500 },
  thumb: { quality: 75, width: 128 },
} as const;

type ImageSize = keyof typeof IMAGE_SIZES;

export interface MultiSizeUploadData {
  large: UploadedFileData;
  medium: UploadedFileData;
  thumb: UploadedFileData;
}

interface ImageVariant {
  file: File;
  originalIndex: number;
  size: ImageSize;
}

/**
 * Transform a single image to all 3 sizes in parallel
 * Returns variants ready for batch upload
 */
const transformImage = (
  filename: string,
  file: File,
  originalIndex: number
): Promise<ImageVariant[]> => {
  const sizes: ImageSize[] = ["thumb", "medium", "large"];

  return Promise.all(
    sizes.map(async (size) => {
      const { width, quality } = IMAGE_SIZES[size];
      const name = `${filename}-${size}.webp`;

      const blob = await file
        .image()
        .resize(width, width, { fit: "inside" })
        .webp({ quality })
        .blob();

      return {
        file: new File([blob], name, { type: blob.type }),
        originalIndex,
        size,
      };
    })
  );
};

/**
 * Upload all image variants in a single atomic batch call
 * All succeed or all fail
 */
const uploadBatch = async (
  allVariants: ImageVariant[]
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

  for (let i = 0; i < allVariants.length; i += 1) {
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

  for (let i = 0; i < numImages; i += 1) {
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
  uploads: MultiSizeUploadData[]
): Promise<void> => {
  if (uploads.length === 0) {
    return;
  }

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
  files: File[] | File
): Promise<{ data: MultiSizeUploadData[] | null; error: string | null }> => {
  try {
    // Transform all images to all sizes in parallel
    const transformPromises = Array.isArray(files)
      ? files.map((file, index) => {
          const sanitizedFilename = `${filename.toLowerCase().replace(/\s+/gu, "-")}-${index}`;
          return transformImage(sanitizedFilename, file, index);
        })
      : [
          transformImage(
            `${filename.toLowerCase().replace(/\s+/gu, "-")}`,
            files,
            0
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
