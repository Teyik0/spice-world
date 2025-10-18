import { prisma } from "../../src/lib/prisma";

export const resetDb = async () =>
	await prisma.$transaction([
		prisma.productVariant.deleteMany(),
		prisma.category.deleteMany(),
		prisma.product.deleteMany(),
		prisma.image.deleteMany(),
		prisma.attributeValue.deleteMany(),
		prisma.attribute.deleteMany(),
		prisma.tag.deleteMany(),
		prisma.user.deleteMany(),
	]);

resetDb();
