-- DropForeignKey
ALTER TABLE "Attribute" DROP CONSTRAINT "Attribute_categoryId_fkey";

-- AddForeignKey
ALTER TABLE "Attribute" ADD CONSTRAINT "Attribute_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "Category"("id") ON DELETE CASCADE ON UPDATE CASCADE;
