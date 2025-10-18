import { prisma } from "../../src/lib/prisma";

export const resetDb = async () =>
	await prisma.$transaction([
		// Delete in order of dependencies (children first, then parents)
		prisma.productVariant.deleteMany(),
		prisma.product.deleteMany(),
		prisma.category.deleteMany(),
		prisma.image.deleteMany(),
		prisma.attributeValue.deleteMany(),
		prisma.attribute.deleteMany(),
		prisma.tag.deleteMany(),
		prisma.user.deleteMany(),
	]);

resetDb();
