import type { PrismaClient } from "@spice-world/server/prisma/client";

const categoriesData = [
	{
		name: "spices",
		id: "00000000-0000-0000-0000-000000000001",
		image: {
			keyThumb: "spices-key-thumb",
			keyMedium: "spices-key-medium",
			keyLarge: "spices-key-large",
			urlThumb: "https://test-url.com/spices-thumb.webp",
			urlMedium: "https://test-url.com/spices-medium.webp",
			urlLarge: "https://test-url.com/spices-large.webp",
			altText: "Spices",
			isThumbnail: true,
		},
	},
	{
		name: "herbs",
		id: "00000000-0000-0000-0000-000000000002",
		image: {
			keyThumb: "herbs-key-thumb",
			keyMedium: "herbs-key-medium",
			keyLarge: "herbs-key-large",
			urlThumb: "https://test-url.com/herbs-thumb.webp",
			urlMedium: "https://test-url.com/herbs-medium.webp",
			urlLarge: "https://test-url.com/herbs-large.webp",
			altText: "Herbs",
			isThumbnail: true,
		},
	},
	{
		name: "seasonings",
		id: "00000000-0000-0000-0000-000000000003",
		image: {
			keyThumb: "seasonings-key-thumb",
			keyMedium: "seasonings-key-medium",
			keyLarge: "seasonings-key-large",
			urlThumb: "https://test-url.com/seasonings-thumb.webp",
			urlMedium: "https://test-url.com/seasonings-medium.webp",
			urlLarge: "https://test-url.com/seasonings-large.webp",
			altText: "Seasonings",
			isThumbnail: true,
		},
	},
	{
		name: "extracts",
		id: "00000000-0000-0000-0000-000000000004",
		image: {
			keyThumb: "extracts-key-thumb",
			keyMedium: "extracts-key-medium",
			keyLarge: "extracts-key-large",
			urlThumb: "https://test-url.com/extracts-thumb.webp",
			urlMedium: "https://test-url.com/extracts-medium.webp",
			urlLarge: "https://test-url.com/extracts-large.webp",
			altText: "Extracts",
			isThumbnail: true,
		},
	},
	{
		name: "blends",
		id: "00000000-0000-0000-0000-000000000005",
		image: {
			keyThumb: "blends-key-thumb",
			keyMedium: "blends-key-medium",
			keyLarge: "blends-key-large",
			urlThumb: "https://test-url.com/blends-thumb.webp",
			urlMedium: "https://test-url.com/blends-medium.webp",
			urlLarge: "https://test-url.com/blends-large.webp",
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

export async function createDummyProducts(prisma: PrismaClient) {
	await prisma.$transaction(async (tx) => {
		await Promise.all(
			categoriesData.map((categoryData) =>
				tx.category.create({
					data: {
						name: categoryData.name,
						id: categoryData.id,
						image: {
							create: {
								keyThumb: categoryData.image.keyThumb,
								keyMedium: categoryData.image.keyMedium,
								keyLarge: categoryData.image.keyLarge,
								urlThumb: categoryData.image.urlThumb,
								urlMedium: categoryData.image.urlMedium,
								urlLarge: categoryData.image.urlLarge,
								altText: categoryData.image.altText,
								isThumbnail: categoryData.image.isThumbnail,
							},
						},
					},
				}),
			),
		);
	});

	const categories = await prisma.category.findMany();

	await Promise.all(
		productsData.map(async (productData) => {
			const category = categories.find(
				(cat) => cat.name === productData.category,
			);
			if (!category) return;

			return prisma.product.create({
				data: {
					name: productData.name,
					slug: productData.slug,
					description: productData.description,
					status: Math.random() > 0.5 ? "PUBLISHED" : "DRAFT",
					categoryId: category.id,
					variants: {
						create: [
							{
								price: Math.random() * 100,
								sku: `${productData.slug.toUpperCase()}-001`,
								stock: Math.floor(Math.random() * 100),
							},
							{
								price: Math.random() * 100,
								sku: `${productData.slug.toUpperCase()}-002`,
								stock: Math.floor(Math.random() * 100),
							},
						],
					},
					images: {
						create: [
							{
								keyThumb: `${productData.slug}-image-key-1-thumb`,
								keyMedium: `${productData.slug}-image-key-1-medium`,
								keyLarge: `${productData.slug}-image-key-1-large`,
								urlThumb: `https://test-url.com/${productData.slug}-image-1-thumb.jpg`,
								urlMedium: `https://test-url.com/${productData.slug}-image-1-medium.jpg`,
								urlLarge: `https://test-url.com/${productData.slug}-image-1-large.jpg`,
								altText: `${productData.name} Image 1`,
								isThumbnail: true,
							},
							{
								keyThumb: `${productData.slug}-image-key-2-thumb`,
								keyMedium: `${productData.slug}-image-key-2-medium`,
								keyLarge: `${productData.slug}-image-key-2-large`,
								urlThumb: `https://test-url.com/${productData.slug}-image-2-thumb.jpg`,
								urlMedium: `https://test-url.com/${productData.slug}-image-2-medium.jpg`,
								urlLarge: `https://test-url.com/${productData.slug}-image-2-large.jpg`,
								altText: `${productData.name} Image 2`,
								isThumbnail: false,
							},
						],
					},
				},
			});
		}),
	);
	const products = await prisma.product.findMany({
		include: {
			images: true,
			variants: true,
		},
	});
	return { categories, products };
}
