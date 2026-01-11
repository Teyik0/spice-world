import { faker } from "@faker-js/faker";
import type { createTestDatabase } from "@spice-world/server/utils/db-manager";

export function randomLowerString(length: number = 10): string {
	const chars = "abcdefghijklmnopqrstuvwxyz";
	let result = "";
	for (let i = 0; i < length; i++) {
		result += chars.charAt(Math.floor(Math.random() * chars.length));
	}
	return result;
}

const ATTRIBUTE_VALUES = {
	Size: ["Small", "Medium", "Large", "XL", "XXL"],
	Color: ["Black", "White", "Red", "Blue", "Green"],
	Weight: ["50g", "100g", "250g", "500g", "1kg"],
	Material: ["Cotton", "Polyester", "Leather", "Metal", "Wood"],
	Style: ["Classic", "Modern", "Vintage", "Minimalist", "Rustic"],
	Origin: ["France", "Italy", "Japan", "USA", "Spain"],
} as const satisfies Record<string, readonly string[]>;

export const ATTRIBUTE_NAMES = Object.keys(ATTRIBUTE_VALUES) as Array<
	keyof typeof ATTRIBUTE_VALUES
>;

export const CATEGORY_NAMES = [
	"Electronics",
	"Clothing",
	"Food & Beverages",
	"Home & Garden",
	"Sports & Outdoors",
	"Books & Media",
	"Health & Beauty",
	"Toys & Games",
	"Automotive",
	"Office Supplies",
];

interface CreateTestCategoryOptions {
	testDb: Awaited<ReturnType<typeof createTestDatabase>>;
	name?: string;
	attributeCount?: number;
}
export const createTestCategory = async ({
	testDb,
	name,
	attributeCount,
}: CreateTestCategoryOptions) => {
	const testId = randomLowerString(8);
	const categoryName = name ?? `test category ${testId}`;

	if (attributeCount && attributeCount > ATTRIBUTE_NAMES.length) {
		throw new Error(
			`attributeCount cannot be greater than ${ATTRIBUTE_NAMES.length}`,
		);
	}
	const selectedAttributes = faker.helpers.arrayElements(
		ATTRIBUTE_NAMES,
		attributeCount ?? { min: 1, max: ATTRIBUTE_NAMES.length },
	);

	const category = await testDb.client.category.create({
		data: {
			name: categoryName,
			image: {
				create: {
					key: `key-${testId}`,
					url: `https://test-url.com/${testId}.webp`,
					altText: categoryName,
					isThumbnail: true,
				},
			},
			attributes: {
				create: selectedAttributes.map((attrName) => ({
					name: attrName,
					values: {
						create: faker.helpers
							.arrayElements(
								ATTRIBUTE_VALUES[attrName],
								faker.number.int({
									min: 2,
									max: ATTRIBUTE_VALUES[attrName].length,
								}),
							)
							.map((value) => ({ value })),
					},
				})),
			},
		},
		include: { attributes: { include: { values: true } } },
	});

	return category;
};
