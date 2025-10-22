import type {
	Attribute,
	AttributeValue,
	PrismaClient,
} from "../../src/prisma/client";

export type AttributeWithValues = Attribute & {
	values: AttributeValue[];
};

// need to be use some categories to be created
export const createDummyAttributes = async (
	prisma: PrismaClient,
): Promise<AttributeWithValues[]> => {
	const categories = await prisma.category.findMany();

	const attribute1 = await prisma.attribute.create({
		data: {
			name: "heat level",
			categoryId: categories[0].id,
			values: {
				create: [{ value: "mild" }, { value: "medium" }, { value: "hot" }],
			},
		},
		include: { values: true },
	});

	const attribute2 = await prisma.attribute.create({
		data: {
			name: "origin",
			categoryId: categories[0].id,
			values: {
				create: [{ value: "india" }, { value: "mexico" }, { value: "italy" }],
			},
		},
		include: { values: true },
	});

	return [attribute1, attribute2];
};
