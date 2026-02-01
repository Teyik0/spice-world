-- Cleanup migration: Remove old single-size columns after data migration
-- Run this ONLY after the data migration script has completed successfully

-- Make new columns NOT NULL (all images should have been migrated)
ALTER TABLE "Image" ALTER COLUMN "keyThumb" SET NOT NULL;
ALTER TABLE "Image" ALTER COLUMN "keyMedium" SET NOT NULL;
ALTER TABLE "Image" ALTER COLUMN "keyLarge" SET NOT NULL;
ALTER TABLE "Image" ALTER COLUMN "urlThumb" SET NOT NULL;
ALTER TABLE "Image" ALTER COLUMN "urlMedium" SET NOT NULL;
ALTER TABLE "Image" ALTER COLUMN "urlLarge" SET NOT NULL;

-- Drop old columns
DROP INDEX IF EXISTS "Image_key_key";
ALTER TABLE "Image" DROP COLUMN IF EXISTS "key";
ALTER TABLE "Image" DROP COLUMN IF EXISTS "url";
