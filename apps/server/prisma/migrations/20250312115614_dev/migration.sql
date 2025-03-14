/*
  Warnings:

  - Made the column `categoryId` on table `Attribute` required. This step will fail if there are existing NULL values in that column.

*/
-- DropIndex
DROP INDEX "Attribute_name_key";

-- AlterTable
ALTER TABLE "Attribute" ALTER COLUMN "categoryId" SET NOT NULL;
