import { env } from "@spice-world/server/lib/env";
import { and, DrizzleQueryError, gt, inArray, sql } from "drizzle-orm";
import { UTApi, UTFile } from "uploadthing/server";
import type { UploadedFileData } from "uploadthing/types";

import { imageDeletionTable } from "../../drizzle/schema";
import { db } from "./db";

/** Queue keys to be checked after the delay: deleted from UploadThing unless still referenced by "Image". */
export const enqueueImageCheck = (
  exec: Pick<typeof db, "insert">,
  keys: string[],
  delayMinutes = 0,
) =>
  keys.length > 0
    ? exec
        .insert(imageDeletionTable)
        .values(
          keys.map((fileKey) => ({
            fileKey,
            notBefore: sql`statement_timestamp() + ${delayMinutes}::int * interval '1 minute'`,
          })),
        )
        .onConflictDoUpdate({
          target: imageDeletionTable.fileKey,
          set: { notBefore: sql`excluded."notBefore"` },
        })
    : undefined;

/**
 * Claims uploads for the current transaction. Throws (→ rollback) when the cleanup already took
 * a key, so a committed "Image" never references a deleted file. Call it right before the write
 * that references the keys: an early return commits the transaction, and the claim with it.
 */
export async function claimUploads(
  tx: Pick<typeof db, "delete">,
  uploads: MultiSizeUploadData[],
) {
  const keys = uploads.flatMap((u) => [u.thumb.key, u.medium.key, u.large.key]);
  const claimed = await tx
    .delete(imageDeletionTable)
    .where(
      and(
        inArray(imageDeletionTable.fileKey, keys),
        gt(imageDeletionTable.notBefore, sql`statement_timestamp()`),
      ),
    )
    .returning({ fileKey: imageDeletionTable.fileKey });
  if (claimed.length !== keys.length) {
    throw new Error("Upload expired before commit");
  }
}

type UTFetch = NonNullable<
  NonNullable<ConstructorParameters<typeof UTApi>[0]>["fetch"]
>;

export const utapi = new UTApi({
  token: env.UPLOADTHING_TOKEN,
  defaultKeyType: "customId",
  fetch: ((input: string | URL | Request, init?: RequestInit) => {
    const timeout = AbortSignal.timeout(60_000);
    return fetch(input, {
      ...init,
      signal: init?.signal ? AbortSignal.any([init.signal, timeout]) : timeout,
    });
  }) as unknown as UTFetch,
});

// Image size configurations for multi-size upload
const IMAGE_SIZES = {
  large: { quality: 85, width: 1200 },
  medium: { quality: 80, width: 500 },
  thumb: { quality: 75, width: 128 },
} as const;

type ImageSize = keyof typeof IMAGE_SIZES;

export type UploadError = "INVALID_IMAGE" | "UPLOAD_FAILED";

type UploadResult =
  | { data: MultiSizeUploadData[]; error: null }
  | { data: null; error: UploadError };

export interface MultiSizeUploadData {
  large: UploadedFileData;
  medium: UploadedFileData;
  thumb: UploadedFileData;
}

interface ImageVariant {
  file: UTFile & { customId: string };
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
  originalIndex: number,
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
        file: new UTFile([blob], name, {
          customId: Bun.randomUUIDv7(),
          type: blob.type,
        }) as ImageVariant["file"],
        originalIndex,
        size,
      };
    }),
  );
};

/**
 * Upload all image variants in a single atomic batch call
 * All succeed or all fail
 */
const uploadBatch = async (
  allVariants: ImageVariant[],
): Promise<UploadResult> => {
  const filesToUpload = allVariants.map((variant) => variant.file);
  // Orphan by default, queued before upload: only a claim by a committed transaction keeps a file.
  await enqueueImageCheck(
    db,
    filesToUpload.map((f) => f.customId),
    15, // longer than any upload, so the cleanup cannot delete files before their claim
  );
  const results = await utapi.uploadFiles(filesToUpload);

  const errors = results.filter((r) => r.error);
  if (errors.length > 0) {
    console.error("Image upload failed", errors);
    return { data: null, error: "UPLOAD_FAILED" };
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
    imageData[variant!.size] = {
      // biome-ignore lint/style/noNonNullAssertion: loop bounds guarantee existence
      ...(result!.data as UploadedFileData),
      // biome-ignore lint/style/noNonNullAssertion: loop bounds guarantee existence
      key: variant!.file.customId,
    };
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
 * Upload multiple images with all size variants
 * Atomic operation - all succeed or all fail
 */
export const uploadFiles = async (
  filename: string,
  files: File[] | File,
): Promise<UploadResult> => {
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
    // Not an upload failure: leave it to drizzleErrorPlugin, which hides the SQL.
    if (error instanceof DrizzleQueryError) {
      throw error;
    }
    console.error("Image upload failed", error);
    const { code } = error as { code?: string };
    return {
      data: null,
      error: code?.startsWith("ERR_IMAGE_") ? "INVALID_IMAGE" : "UPLOAD_FAILED",
    };
  }
};
