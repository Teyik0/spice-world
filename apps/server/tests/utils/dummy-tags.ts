import type { PrismaClient } from "../../src/prisma/client";

export const createDummyTags = async (prisma: PrismaClient) => {
	const tag1 = await prisma.tag.create({
		data: {
			name: "spicy",
			badgeColor: "#FF032F",
		},
	});

	const tag2 = await prisma.tag.create({
		data: {
			name: "hot",
			badgeColor: "#FF032F",
		},
	});

	const tag3 = await prisma.tag.create({
		data: {
			name: "medium",
			badgeColor: "#FF032F",
		},
	});
	return [tag1, tag2, tag3];
};

export const deleteDummyTags = async (prisma: PrismaClient) => {
	await prisma.tag.deleteMany();
};
