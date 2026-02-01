-- Safe migration: Add multi-size columns WITHOUT dropping old ones
-- This allows running the data migration script first

-- Add new multi-size columns (nullable initially)
ALTER TABLE "Image"
  ADD COLUMN IF NOT EXISTS "keyThumb" TEXT,
  ADD COLUMN IF NOT EXISTS "keyMedium" TEXT,
  ADD COLUMN IF NOT EXISTS "keyLarge" TEXT,
  ADD COLUMN IF NOT EXISTS "urlThumb" TEXT,
  ADD COLUMN IF NOT EXISTS "urlMedium" TEXT,
  ADD COLUMN IF NOT EXISTS "urlLarge" TEXT;

-- Create unique indexes for each key (will fail if duplicates exist)
CREATE UNIQUE INDEX IF NOT EXISTS "Image_keyThumb_key" ON "Image"("keyThumb");
CREATE UNIQUE INDEX IF NOT EXISTS "Image_keyMedium_key" ON "Image"("keyMedium");
CREATE UNIQUE INDEX IF NOT EXISTS "Image_keyLarge_key" ON "Image"("keyLarge");

-- Note: Old columns 'key' and 'url' are kept for now
-- After data migration, run cleanup migration to remove them
