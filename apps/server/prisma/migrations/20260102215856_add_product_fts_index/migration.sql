-- This is an empty migration.
-- Add full-text search GIN index (requires CONCURRENTLY, so outside normal migration flow)
CREATE INDEX CONCURRENTLY IF NOT EXISTS "Product_name_fts_idx"
ON "Product"
USING GIN (to_tsvector('french', name));
