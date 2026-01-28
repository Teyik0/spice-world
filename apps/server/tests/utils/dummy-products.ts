import type { DrizzleClient } from "@spice-world/server/db";
import * as schema from "@spice-world/server/db/schema";

const categoriesData = [
	{
		name: "spices",
		id: "00000000-0000-0000-0000-000000000001",
		image: {
			key: "spices-key",
			url: "https://test-url.com/spices.webp",
			altText: "Spices",
			isThumbnail: true,
		},
	},
	{
		name: "herbs",
		id: "00000000-0000-0000-0000-000000000002",
		image: {
			key: "herbs-key",
			url: "https://test-url.com/herbs.webp",
			altText: "Herbs",
			isThumbnail: true,
		},
	},
	{
		name: "seasonings",
		id: "00000000-0000-0000-0000-000000000003",
		image: {
			key: "seasonings-key",
			url: "https://test-url.com/seasonings.webp",
			altText: "Seasonings",
			isThumbnail: true,
		},
	},
	{
		name: "extracts",
		id: "00000000-0000-0000-0000-000000000004",
		image: {
			key: "extracts-key",
			url: "https://test-url.com/extracts.webp",
			altText: "Extracts",
			isThumbnail: true,
		},
	},
	{
		name: "blends",
		id: "00000000-0000-0000-0000-000000000005",
		image: {
			key: "blends-key",
			url: "https://test-url.com/blends.webp",
			altText: "Blends",
			isThumbnail: true,
		},
	},
];

const productsData = [
	{
		name: "cinnamon",
		slug: "cinnamon",
		description: "high-quality cinnamon",
		category: "spices",
	},
	{
		name: "ginger",
		slug: "ginger",
		description: "fresh ginger",
		category: "spices",
	},
	{
		name: "vanilla",
		slug: "vanilla",
		description: "Pure vanilla extract",
		category: "Extracts",
	},
	{
		name: "paprika",
		slug: "paprika",
		description: "smoked paprika",
		category: "spices",
	},
	{
		name: "basil",
		slug: "basil",
		description: "dried basil leaves",
		category: "herbs",
	},
	{
		name: "oregano",
		slug: "oregano",
		description: "organic oregano",
		category: "herbs",
	},
	{
		name: "thyme",
		slug: "thyme",
		description: "fresh thyme",
		category: "herbs",
	},
	{
		name: "rosemary",
		slug: "rosemary",
		description: "dried rosemary",
		category: "herbs",
	},
	{
		name: "cumin",
		slug: "cumin",
		description: "ground cumin",
		category: "spices",
	},
	{
		name: "turmeric",
		slug: "turmeric",
		description: "organic turmeric",
		category: "spices",
	},
	{
		name: "coriander",
		slug: "coriander",
		description: "ground coriander",
		category: "spices",
	},
	{
		name: "nutmeg",
		slug: "nutmeg",
		description: "whole nutmeg",
		category: "spices",
	},
	{
		name: "cloves",
		slug: "cloves",
		description: "whole cloves",
		category: "spices",
	},
	{
		name: "cardamom",
		slug: "cardamom",
		description: "green cardamom pods",
		category: "spices",
	},
	{
		name: "saffron",
		slug: "saffron",
		description: "premium saffron",
		category: "spices",
	},
	{
		name: "pepper",
		slug: "pepper",
		description: "black peppercorns",
		category: "spices",
	},
	{
		name: "chili powder",
		slug: "chili-powder",
		description: "hot chili powder",
		category: "spices",
	},
	{
		name: "garlic powder",
		slug: "garlic-powder",
		description: "garlic powder",
		category: "seasonings",
	},
	{
		name: "onion powder",
		slug: "onion-powder",
		description: "onion powder",
		category: "seasonings",
	},
	{
		name: "curry powder",
		slug: "curry-powder",
		description: "curry powder blend",
		category: "blends",
	},
	{
		name: "italian seasoning",
		slug: "italian-seasoning",
		description: "italian herb blend",
		category: "blends",
	},
	{
		name: "taco seasoning",
		slug: "taco-seasoning",
		description: "taco seasoning blend",
		category: "blends",
	},
	{
		name: "bbq rub",
		slug: "bbq-rub",
		description: "bbq spice rub",
		category: "blends",
	},
	{
		name: "bay leaves",
		slug: "bay-leaves",
		description: "dried bay leaves",
		category: "herbs",
	},
	{
		name: "mint",
		slug: "mint",
		description: "fresh mint leaves",
		category: "herbs",
	},
];

export async function createDummyProducts(db: DrizzleClient) {
	// Create images for categories first
	for (const categoryData of categoriesData) {
		const [newImage] = await db
			.insert(schema.image)
			.values({
				key: categoryData.image.key,
				url: categoryData.image.url,
				altText: categoryData.image.altText,
				isThumbnail: categoryData.image.isThumbnail,
			})
			.returning();

		await db.insert(schema.category).values({
			id: categoryData.id,
			name: categoryData.name,
			imageId: newImage!.id,
		});
	}

	const categories = await db.query.category.findMany();

	for (const productData of productsData) {
		const category = categories.find(
			(cat) => cat.name.toLowerCase() === productData.category.toLowerCase(),
		);
		if (!category) continue;

		const [newProduct] = await db
			.insert(schema.product)
			.values({
				name: productData.name,
				slug: productData.slug,
				description: productData.description,
				status: Math.random() > 0.5 ? "PUBLISHED" : "DRAFT",
				categoryId: category.id,
			})
			.returning();

		if (!newProduct) continue;

		// Create variants
		await db.insert(schema.productVariant).values([
			{
				productId: newProduct.id,
				price: Math.random() * 100,
				sku: `${productData.slug.toUpperCase()}-001`,
				stock: Math.floor(Math.random() * 100),
			},
			{
				productId: newProduct.id,
				price: Math.random() * 100,
				sku: `${productData.slug.toUpperCase()}-002`,
				stock: Math.floor(Math.random() * 100),
			},
		]);

		// Create images
		await db.insert(schema.image).values([
			{
				key: `${productData.slug}-image-key-1`,
				url: `https://test-url.com/${productData.slug}-image-1.jpg`,
				altText: `${productData.name} Image 1`,
				isThumbnail: true,
				productId: newProduct.id,
			},
			{
				key: `${productData.slug}-image-key-2`,
				url: `https://test-url.com/${productData.slug}-image-2.jpg`,
				altText: `${productData.name} Image 2`,
				isThumbnail: false,
				productId: newProduct.id,
			},
		]);
	}

	const products = await db.query.product.findMany({
		with: {
			images: true,
			variants: true,
		},
	});

	return { categories, products };
}
