ALTER TABLE "Product" ALTER COLUMN "version" SET DEFAULT 1;--> statement-breakpoint
UPDATE "Product" SET "version" = 1 WHERE "version" = 0;
