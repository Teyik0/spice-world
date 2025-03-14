import prisma from "../../src/libs/prisma";

const data = await prisma.$transaction([
  prisma.category.deleteMany(),
  prisma.tag.deleteMany(),
  prisma.product.deleteMany(),
  prisma.image.deleteMany(),
]);

console.log(data);
