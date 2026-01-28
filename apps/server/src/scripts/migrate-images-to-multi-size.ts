/**
 * Migration script: Convert existing single-size images to multi-size format
 *
 * This script:
 * 1. Reads all existing images from DB (old format: key, url)
 * 2. Downloads each image from UploadThing CDN
 * 3. Generates 3 sizes: thumb (128px), medium (500px), large (1500px)
 * 4. Uploads the 3 new sizes to UploadThing
 * 5. Updates DB with new multi-size fields
 * 6. Optionally deletes old single-size images
 *
 * Usage:
 *   bun run src/scripts/migrate-images-to-multi-size.ts --dry-run
 *   bun run src/scripts/migrate-images-to-multi-size.ts --execute
 *   bun run src/scripts/migrate-images-to-multi-size.ts --execute --delete-old
 */

import { ResizeFit, Transformer } from "@napi-rs/image";
import { prisma } from "../lib/prisma";
import { utapi } from "../lib/images";

// Image size configurations
const IMAGE_SIZES = {
	thumb: { width: 128, quality: 75 },
	medium: { width: 500, quality: 80 },
	large: { width: 1500, quality: 85 },
} as const;

type ImageSize = keyof typeof IMAGE_SIZES;

interface OldImageData {
	id: string;
	key: string;
	url: string;
	altText: string | null;
	isThumbnail: boolean;
	productId: string | null;
}

interface MultiSizeData {
	thumb: { key: string; url: string };
	medium: { key: string; url: string };
	large: { key: string; url: string };
}

// Parse CLI arguments
const args = process.argv.slice(2);
const isDryRun = args.includes("--dry-run");
const isExecute = args.includes("--execute");
const deleteOld = args.includes("--delete-old");

if (!isDryRun && !isExecute) {
	console.error("❌ Error: You must specify --dry-run or --execute");
	console.log("\nUsage:");
	console.log("  bun run src/scripts/migrate-images-to-multi-size.ts --dry-run");
	console.log("  bun run src/scripts/migrate-images-to-multi-size.ts --execute");
	console.log("  bun run src/scripts/migrate-images-to-multi-size.ts --execute --delete-old");
	process.exit(1);
}

/**
 * Download image from URL
 */
async function downloadImage(url: string): Promise<Buffer> {
	const response = await fetch(url);
	if (!response.ok) {
		throw new Error(`Failed to download image: ${response.statusText}`);
	}
	const arrayBuffer = await response.arrayBuffer();
	return Buffer.from(arrayBuffer);
}

/**
 * Generate a specific size variant of an image
 */
async function generateImageSize(
	buffer: Buffer,
	size: ImageSize,
): Promise<Buffer> {
	const config = IMAGE_SIZES[size];
	const transformer = new Transformer(buffer);
	return await transformer
		.resize({ width: config.width, height: config.width, fit: ResizeFit.Cover })
		.webp(config.quality);
}

/**
 * Upload all 3 size variants to UploadThing
 */
async function uploadMultiSize(
	basename: string,
	buffer: Buffer,
): Promise<MultiSizeData | null> {
	const sizes: ImageSize[] = ["thumb", "medium", "large"];
	const uploadPromises = sizes.map(async (size) => {
		const sizedBuffer = await generateImageSize(buffer, size);
		const filename = `${basename}-${size}.webp`;
		return {
			size,
			result: await utapi.uploadFiles(
				new File([new Uint8Array(sizedBuffer)], filename),
			),
		};
	});

	const results = await Promise.all(uploadPromises);

	// Check for errors
	const errors = results.filter((r) => r.result.error);
	if (errors.length > 0) {
		// Cleanup any successful uploads
		for (const result of results) {
			if (result.result.data) {
				await utapi.deleteFiles(result.result.data.key);
			}
		}
		console.error(`  ❌ Upload failed: ${errors[0].result.error}`);
		return null;
	}

	// Extract data
	const thumb = results[0].result.data!;
	const medium = results[1].result.data!;
	const large = results[2].result.data!;

	return {
		thumb: { key: thumb.key, url: thumb.url },
		medium: { key: medium.key, url: medium.url },
		large: { key: large.key, url: large.url },
	};
}

/**
 * Migrate a single image
 */
async function migrateImage(
	image: OldImageData,
	dryRun: boolean,
): Promise<boolean> {
	const productInfo = image.productId ? ` (Product: ${image.productId})` : "";
	console.log(`\n📸 Processing image: ${image.id}${productInfo}`);
	console.log(`  Old key: ${image.key}`);
	console.log(`  Old URL: ${image.url}`);

	if (dryRun) {
		console.log("  ⏭️  [DRY RUN] Skipping actual processing");
		return true;
	}

	try {
		// Step 1: Download the original image
		console.log("  ⬇️  Downloading original image...");
		const imageBuffer = await downloadImage(image.url);
		console.log(`  ✅ Downloaded ${(imageBuffer.length / 1024).toFixed(2)} KB`);

		// Step 2: Generate and upload 3 sizes
		console.log("  🔄 Generating 3 sizes and uploading...");
		const basename = image.key.replace(/\.(jpg|jpeg|png|webp)$/i, "");
		const multiSizeData = await uploadMultiSize(basename, imageBuffer);

		if (!multiSizeData) {
			console.error("  ❌ Failed to upload multi-size images");
			return false;
		}

		console.log(`  ✅ Thumb uploaded: ${multiSizeData.thumb.key}`);
		console.log(`  ✅ Medium uploaded: ${multiSizeData.medium.key}`);
		console.log(`  ✅ Large uploaded: ${multiSizeData.large.key}`);

		// Step 3: Update database
		console.log("  💾 Updating database...");
		await prisma.$executeRaw`
			UPDATE "Image"
			SET
				"keyThumb" = ${multiSizeData.thumb.key},
				"keyMedium" = ${multiSizeData.medium.key},
				"keyLarge" = ${multiSizeData.large.key},
				"urlThumb" = ${multiSizeData.thumb.url},
				"urlMedium" = ${multiSizeData.medium.url},
				"urlLarge" = ${multiSizeData.large.url}
			WHERE id = ${image.id}
		`;
		console.log("  ✅ Database updated");

		// Step 4: Delete old image if requested
		if (deleteOld) {
			console.log("  🗑️  Deleting old image from UploadThing...");
			await utapi.deleteFiles(image.key);
			console.log("  ✅ Old image deleted");
		}

		return true;
	} catch (error) {
		console.error(`  ❌ Error migrating image: ${error}`);
		return false;
	}
}

/**
 * Main migration function
 */
async function main() {
	console.log("\n🚀 Image Migration Script");
	console.log("=" .repeat(50));
	console.log(`Mode: ${isDryRun ? "DRY RUN (no changes)" : "EXECUTE (will modify data)"}`);
	console.log(`Delete old images: ${deleteOld ? "YES" : "NO"}`);
	console.log("=" .repeat(50));

	// Fetch all images with old format
	console.log("\n📊 Fetching images from database...");

	// Check if old columns exist
	const hasOldColumns = await prisma.$queryRaw<{ count: bigint }[]>`
		SELECT COUNT(*) as count
		FROM information_schema.columns
		WHERE table_name = 'Image'
		AND column_name IN ('key', 'url')
	`;

	if (Number(hasOldColumns[0].count) < 2) {
		console.error("\n❌ Error: Old columns 'key' and 'url' not found in Image table");
		console.error("This script should be run BEFORE applying the Prisma migration.");
		console.error("\nSteps:");
		console.error("1. Run this migration script first");
		console.error("2. Then apply Prisma migration");
		process.exit(1);
	}

	const images = await prisma.$queryRaw<OldImageData[]>`
		SELECT id, key, url, "altText", "isThumbnail", "productId"
		FROM "Image"
		WHERE key IS NOT NULL AND url IS NOT NULL
	`;

	console.log(`✅ Found ${images.length} images to migrate\n`);

	if (images.length === 0) {
		console.log("✨ No images to migrate. Exiting.");
		await prisma.$disconnect();
		process.exit(0);
	}

	if (isDryRun) {
		console.log("\n📋 DRY RUN - Images that would be migrated:");
		for (const image of images) {
			console.log(`  - ${image.id}: ${image.key}`);
		}
		console.log(`\n✨ Dry run complete. Run with --execute to perform actual migration.`);
		await prisma.$disconnect();
		process.exit(0);
	}

	// Execute migration
	let successCount = 0;
	let failCount = 0;

	for (let i = 0; i < images.length; i++) {
		const image = images[i];
		console.log(`\n[${i + 1}/${images.length}]`);

		const success = await migrateImage(image, false);
		if (success) {
			successCount++;
		} else {
			failCount++;
		}

		// Small delay to avoid rate limiting
		if (i < images.length - 1) {
			await new Promise((resolve) => setTimeout(resolve, 500));
		}
	}

	// Summary
	console.log("\n" + "=".repeat(50));
	console.log("📊 Migration Summary");
	console.log("=".repeat(50));
	console.log(`✅ Successfully migrated: ${successCount}`);
	console.log(`❌ Failed: ${failCount}`);
	console.log(`📊 Total: ${images.length}`);

	if (failCount > 0) {
		console.log("\n⚠️  Some images failed to migrate. Check the logs above.");
		console.log("You can re-run this script to retry failed images.");
	}

	if (successCount > 0) {
		console.log("\n✨ Migration complete!");
		console.log("\nNext steps:");
		console.log("1. Verify images are working in your application");
		console.log("2. Apply the Prisma migration to remove old columns:");
		console.log("   cd apps/server && bunx prisma migrate deploy");
	}

	await prisma.$disconnect();
	process.exit(failCount > 0 ? 1 : 0);
}

// Run migration
main().catch((error) => {
	console.error("\n❌ Fatal error:", error);
	prisma.$disconnect();
	process.exit(1);
});
