/*
  Warnings:

  - A unique constraint covering the columns `[categoryId]` on the table `Image` will be added. If there are existing duplicate values, this will fail.

*/
-- DropForeignKey
ALTER TABLE "Category" DROP CONSTRAINT "Category_imageId_fkey";

-- DropIndex
DROP INDEX "Category_imageId_key";

-- AlterTable
ALTER TABLE "Category" ALTER COLUMN "imageId" DROP NOT NULL;

-- AlterTable
ALTER TABLE "Image" ADD COLUMN     "categoryId" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "Image_categoryId_key" ON "Image"("categoryId");

-- AddForeignKey
ALTER TABLE "Image" ADD CONSTRAINT "Image_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "Category"("id") ON DELETE CASCADE ON UPDATE CASCADE;
