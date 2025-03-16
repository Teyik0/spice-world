import prisma from "../../src/libs/prisma";

export const resetDb = async () =>
  await prisma.$transaction([
    prisma.attributeValue.deleteMany(),
    prisma.attribute.deleteMany(),
    prisma.category.deleteMany(),
    prisma.product.deleteMany(),
    prisma.image.deleteMany(),
    prisma.tag.deleteMany(),
  ]);
