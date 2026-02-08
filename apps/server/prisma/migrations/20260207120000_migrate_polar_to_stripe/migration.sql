/*
  Warnings:

  - You are about to drop the column `polarCheckoutId` on the `Order` table. All the data in the column will be lost.
  - You are about to drop the column `polarOrderId` on the `Order` table. All the data in the column will be lost.
  - You are about to drop the column `polarProductId` on the `ProductVariant` table. All the data in the column will be lost.
  - You are about to drop the column `polarProductId` on the `OrderItem` table. All the data in the column will be lost.
  - A unique constraint covering the columns `[stripeSessionId]` on the table `Order` will be added. If there are existing duplicate values, this will fail.
  - A unique constraint covering the columns `[stripePaymentIntentId]` on the table `Order` will be added. If there are existing duplicate values, this will fail.

*/
-- DropIndex
DROP INDEX IF EXISTS "Order_polarCheckoutId_key";

-- DropIndex
DROP INDEX IF EXISTS "Order_polarOrderId_key";

-- DropIndex
DROP INDEX IF EXISTS "ProductVariant_polarProductId_key";

-- AlterTable: Rename columns in Order table
ALTER TABLE "Order" RENAME COLUMN "polarCheckoutId" TO "stripeSessionId";
ALTER TABLE "Order" RENAME COLUMN "polarOrderId" TO "stripePaymentIntentId";

-- AlterTable: Remove column from ProductVariant table
ALTER TABLE "ProductVariant" DROP COLUMN IF EXISTS "polarProductId";

-- AlterTable: Remove column from OrderItem table
ALTER TABLE "OrderItem" DROP COLUMN IF EXISTS "polarProductId";

-- CreateIndex
CREATE UNIQUE INDEX "Order_stripeSessionId_key" ON "Order"("stripeSessionId");

-- CreateIndex
CREATE UNIQUE INDEX "Order_stripePaymentIntentId_key" ON "Order"("stripePaymentIntentId");
