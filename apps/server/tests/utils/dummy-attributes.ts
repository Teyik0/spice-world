import type {
	Attribute,
	AttributeValue,
	PrismaClient,
} from "@spice-world/server/prisma/client";
import { expectDefined } from "./helper";

export type AttributeWithValues = Attribute & {
	values: AttributeValue[];
};

// need to be use some categories to be created
export const createDummyAttributes = async (
	prisma: PrismaClient,
): Promise<AttributeWithValues[]> => {
	const firstCategory = await prisma.category.findUniqueOrThrow({
		where: { name: "spices" },
	});
	expectDefined(firstCategory);

	const attribute1 = await prisma.attribute.create({
		data: {
			name: "heat level",
			categoryId: firstCategory.id,
			values: {
				create: [{ value: "mild" }, { value: "medium" }, { value: "hot" }],
			},
		},
		include: { values: true },
	});

	const attribute2 = await prisma.attribute.create({
		data: {
			name: "origin",
			categoryId: firstCategory.id,
			values: {
				create: [{ value: "india" }, { value: "mexico" }, { value: "italy" }],
			},
		},
		include: { values: true },
	});

	const secondCategory = await prisma.category.findUniqueOrThrow({
		where: { name: "herbs" },
	});
	expectDefined(secondCategory);

	const attribute3 = await prisma.attribute.create({
		data: {
			name: "form", // relevant for herbs
			categoryId: secondCategory.id,
			values: {
				create: [{ value: "fresh" }, { value: "dried" }, { value: "powdered" }],
			},
		},
		include: { values: true },
	});

	return [attribute1, attribute2, attribute3];
};
