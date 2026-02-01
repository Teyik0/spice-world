import { faker } from "@faker-js/faker";
import { prisma } from "../src/lib/prisma";
import type { Image } from "../src/prisma/client";

const NUM_PRODUCTS = 100_000;
const VARIANTS_PER_PRODUCT = 5;
const BATCH_SIZE = 1000; // Products per createMany

// Cache: categoryId -> { attributeId -> attributeValueIds[] }
const categoryAttributesCache = new Map<string, Map<string, string[]>>();

const ATTRIBUTE_VALUES: Record<string, string[]> = {
	Size: ["Small", "Medium", "Large", "XL"],
	Color: ["Black", "White", "Red", "Blue", "Green"],
	Weight: ["50g", "100g", "250g", "500g", "1kg"],
	Material: ["Cotton", "Polyester", "Leather", "Metal", "Wood"],
	Style: ["Classic", "Modern", "Vintage", "Minimalist"],
	Origin: ["France", "Italy", "Japan", "USA", "Spain"],
};

const ATTRIBUTE_NAMES = Object.keys(ATTRIBUTE_VALUES);
const CATEGORY_NAMES = [
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

async function getOrCreateCategoryWithAttributes(categoryName: string) {
	const imageKey = `category-${faker.string.nanoid()}`;

	const category = await prisma.category.upsert({
		where: { name: categoryName },
		update: {},
		create: {
			name: categoryName,
			image: {
				create: {
					urlThumb: faker.image.url({ width: 128, height: 128 }),
					keyThumb: imageKey,
					urlMedium: faker.image.url({ width: 500, height: 500 }),
					keyMedium: imageKey,
					urlLarge: faker.image.url({ width: 1200, height: 1200 }),
					keyLarge: imageKey,
					isThumbnail: true,
				},
			},
		},
		include: {
			attributes: {
				include: {
					values: true,
				},
			},
		},
	});

	if (categoryAttributesCache.has(category.id)) {
		return {
			category,
			attributesByAttrId: categoryAttributesCache.get(category.id) as Map<
				string,
				string[]
			>,
		};
	}

	const attributesByAttrId = new Map<string, string[]>();

	if (category.attributes.length > 0) {
		for (const attr of category.attributes) {
			attributesByAttrId.set(
				attr.id,
				attr.values.map((v) => v.id),
			);
		}
	} else {
		const selectedAttrNames = faker.helpers.arrayElements(
			ATTRIBUTE_NAMES,
			faker.number.int({ min: 2, max: 3 }),
		);

		for (const attrName of selectedAttrNames) {
			const values = ATTRIBUTE_VALUES[attrName];

			const attr = await prisma.attribute.create({
				data: {
					name: attrName,
					categoryId: category.id,
					values: {
						create: values.map((v) => ({ value: v })),
					},
				},
				include: { values: true },
			});

			attributesByAttrId.set(
				attr.id,
				attr.values.map((v) => v.id),
			);
		}
	}

	categoryAttributesCache.set(category.id, attributesByAttrId);
	return { category, attributesByAttrId };
}

function pickRandomAttributeValueIds(
	attributesByAttrId: Map<string, string[]>,
): string[] {
	const selectedIds: string[] = [];
	const entries = Array.from(attributesByAttrId.values());
	for (const valueIds of entries) {
		const randomValueId = faker.helpers.arrayElement(valueIds);
		selectedIds.push(randomValueId);
	}
	return selectedIds;
}

async function seedCategoriesAndAttributes() {
	console.log("Creating categories and attributes...");

	for (const categoryName of CATEGORY_NAMES) {
		await getOrCreateCategoryWithAttributes(categoryName);
	}

	console.log(
		`✓ Created ${CATEGORY_NAMES.length} categories with attributes\n`,
	);
}

async function createProductBatch(batchSize: number): Promise<void> {
	// Step 1: Generate product data
	const productsData: Array<{
		name: string;
		slug: string;
		description: string;
		status: "DRAFT" | "ARCHIVED" | "PUBLISHED";
		categoryId: string;
	}> = [];
	const productsWithCategoryInfo: Array<{
		index: number;
		categoryId: string;
		attributesByAttrId: Map<string, string[]>;
	}> = [];

	for (let i = 0; i < batchSize; i++) {
		const categoryName = faker.helpers.arrayElement(CATEGORY_NAMES);
		const { category, attributesByAttrId } =
			await getOrCreateCategoryWithAttributes(categoryName);

		const baseName = faker.commerce.productName().toLowerCase();
		const uniqueSuffix = faker.string.alpha({ length: 6, casing: "lower" });
		const name = `${baseName} ${uniqueSuffix}`; // Guaranteed unique
		const slug = `${faker.helpers.slugify(baseName)}-${uniqueSuffix}`; // Guaranteed unique

		productsData.push({
			name,
			slug,
			description: faker.commerce.productDescription().toLowerCase(),
			status: faker.helpers.arrayElement(["DRAFT", "ARCHIVED", "PUBLISHED"]),
			categoryId: category.id,
		});

		productsWithCategoryInfo.push({
			index: i,
			categoryId: category.id,
			attributesByAttrId,
		});
	}

	// Step 2: Bulk insert products
	await prisma.product.createMany({
		data: productsData,
		skipDuplicates: true,
	});

	// Step 3: Fetch created products to get IDs
	const createdProducts = await prisma.product.findMany({
		where: {
			slug: {
				in: productsData.map((p) => p.slug),
			},
		},
		select: {
			id: true,
			slug: true,
			categoryId: true,
		},
	});

	// Step 4: Create a map of slug -> product
	const productMap = new Map(createdProducts.map((p) => [p.slug, p]));

	// Step 5: Generate variants and images data
	const variantsData: Array<{
		productId: string;
		price: number;
		stock: number;
		attributeValueIds: string[];
	}> = [];
	const imagesData: Omit<Image, "altText" | "id">[] = [];

	for (let i = 0; i < productsData.length; i++) {
		const productData = productsData[i];
		const product = productMap.get(productData.slug);
		if (!product) continue;

		const categoryInfo = productsWithCategoryInfo[i];

		// Generate variants
		for (let v = 0; v < VARIANTS_PER_PRODUCT; v++) {
			const attributeValueIds = pickRandomAttributeValueIds(
				categoryInfo.attributesByAttrId,
			);

			variantsData.push({
				productId: product.id,
				price: Number.parseFloat(faker.commerce.price({ min: 5, max: 100 })),
				stock: faker.number.int({ min: 0, max: 500 }),
				attributeValueIds,
			});
		}

		// Generate images
		imagesData.push(
			{
				productId: product.id,
				urlThumb: faker.image.url({ width: 128, height: 128 }),
				keyThumb: `${product.id}-1-thumb`,
				urlMedium: faker.image.url({ width: 500, height: 500 }),
				keyMedium: `${product.id}-1-medium`,
				urlLarge: faker.image.url({ width: 1200, height: 1200 }),
				keyLarge: `${product.id}-1-large`,
				isThumbnail: true,
			},
			{
				productId: product.id,
				urlThumb: faker.image.url({ width: 128, height: 128 }),
				keyThumb: `${product.id}-thumb`,
				urlMedium: faker.image.url({ width: 500, height: 500 }),
				keyMedium: `${product.id}-medium`,
				urlLarge: faker.image.url({ width: 1200, height: 1200 }),
				keyLarge: `${product.id}-large`,
				isThumbnail: false,
			},
		);
	}

	// Step 6: Bulk insert images
	await prisma.image.createMany({
		data: imagesData,
		skipDuplicates: true,
	});

	// Step 7: Create variants with attributeValue connections (must use individual creates)
	await prisma.$transaction(
		async (tx) => {
			for (const variantData of variantsData) {
				await tx.productVariant.create({
					data: {
						productId: variantData.productId,
						price: variantData.price,
						stock: variantData.stock,
						attributeValues: {
							connect: variantData.attributeValueIds.map((id) => ({ id })),
						},
					},
				});
			}
		},
		{
			maxWait: 30000,
			timeout: 120000,
		},
	);
}

async function main() {
	console.log(
		`Generating ${NUM_PRODUCTS} products in batches of ${BATCH_SIZE}...\n`,
	);

	// Step 1: Pre-create all categories and attributes
	await seedCategoriesAndAttributes();

	// Step 2: Create products in batches
	const totalBatches = Math.ceil(NUM_PRODUCTS / BATCH_SIZE);
	const startTime = Date.now();

	for (let batchIndex = 0; batchIndex < totalBatches; batchIndex++) {
		const isLastBatch = batchIndex === totalBatches - 1;
		const currentBatchSize = isLastBatch
			? NUM_PRODUCTS - batchIndex * BATCH_SIZE
			: BATCH_SIZE;

		const batchStartTime = Date.now();

		await createProductBatch(batchIndex);

		const batchDuration = ((Date.now() - batchStartTime) / 1000).toFixed(2);
		const totalCreated = Math.min((batchIndex + 1) * BATCH_SIZE, NUM_PRODUCTS);
		const progress = ((totalCreated / NUM_PRODUCTS) * 100).toFixed(1);
		const elapsed = ((Date.now() - startTime) / 1000).toFixed(0);
		const rate = (totalCreated / (Date.now() - startTime)) * 1000;
		const eta = ((NUM_PRODUCTS - totalCreated) / rate).toFixed(0);

		console.log(
			`Batch ${batchIndex + 1}/${totalBatches} (${currentBatchSize} products) completed in ${batchDuration}s | ` +
				`Total: ${totalCreated.toLocaleString()}/${NUM_PRODUCTS.toLocaleString()} (${progress}%) | ` +
				`Rate: ${rate.toFixed(0)}/s | Elapsed: ${elapsed}s | ETA: ${eta}s`,
		);
	}

	const totalDuration = ((Date.now() - startTime) / 1000).toFixed(2);
	console.log(
		`\n✓ Done! Created ${NUM_PRODUCTS.toLocaleString()} products in ${totalDuration}s 🎉`,
	);
}

main()
	.catch((e) => console.error(e))
	.finally(async () => await prisma.$disconnect());
