-- AlterTable Image: Replace single-size fields with multi-size fields
-- WARNING: This is a destructive migration that will drop existing data
-- If you have important images in production, create a data migration script first

-- Drop old unique indexes
DROP INDEX IF EXISTS "Image_key_key";

-- Remove old single-size columns
ALTER TABLE "Image" DROP COLUMN IF EXISTS "key";
ALTER TABLE "Image" DROP COLUMN IF EXISTS "url";

-- Add new multi-size columns
ALTER TABLE "Image"
  ADD COLUMN "keyThumb" TEXT NOT NULL DEFAULT '',
  ADD COLUMN "keyMedium" TEXT NOT NULL DEFAULT '',
  ADD COLUMN "keyLarge" TEXT NOT NULL DEFAULT '',
  ADD COLUMN "urlThumb" TEXT NOT NULL DEFAULT '',
  ADD COLUMN "urlMedium" TEXT NOT NULL DEFAULT '',
  ADD COLUMN "urlLarge" TEXT NOT NULL DEFAULT '';

-- Remove default values (only needed for migration)
ALTER TABLE "Image" ALTER COLUMN "keyThumb" DROP DEFAULT;
ALTER TABLE "Image" ALTER COLUMN "keyMedium" DROP DEFAULT;
ALTER TABLE "Image" ALTER COLUMN "keyLarge" DROP DEFAULT;
ALTER TABLE "Image" ALTER COLUMN "urlThumb" DROP DEFAULT;
ALTER TABLE "Image" ALTER COLUMN "urlMedium" DROP DEFAULT;
ALTER TABLE "Image" ALTER COLUMN "urlLarge" DROP DEFAULT;

-- Create unique indexes for each key
CREATE UNIQUE INDEX "Image_keyThumb_key" ON "Image"("keyThumb");
CREATE UNIQUE INDEX "Image_keyMedium_key" ON "Image"("keyMedium");
CREATE UNIQUE INDEX "Image_keyLarge_key" ON "Image"("keyLarge");
