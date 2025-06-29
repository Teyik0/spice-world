import { prisma } from "../../src/lib/prisma";
import type {
	Category,
	Image,
	Product,
	ProductVariant,
} from "../../src/prisma/client";

const categoriesData = [
	{
		name: "Spices",
		id: "00000000-0000-0000-0000-000000000001",
		image: {
			key: "spices-key",
			url: "https://test-url.com/spices.webp",
			altText: "Spices",
			isThumbnail: true,
		},
	},
	{
		name: "Herbs",
		id: "00000000-0000-0000-0000-000000000002",
		image: {
			key: "herbs-key",
			url: "https://test-url.com/herbs.webp",
			altText: "Herbs",
			isThumbnail: true,
		},
	},
	{
		name: "Seasonings",
		id: "00000000-0000-0000-0000-000000000003",
		image: {
			key: "seasonings-key",
			url: "https://test-url.com/seasonings.webp",
			altText: "Seasonings",
			isThumbnail: true,
		},
	},
	{
		name: "Extracts",
		id: "00000000-0000-0000-0000-000000000004",
		image: {
			key: "extracts-key",
			url: "https://test-url.com/extracts.webp",
			altText: "Extracts",
			isThumbnail: true,
		},
	},
	{
		name: "Blends",
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
		name: "Cinnamon",
		slug: "cinnamon",
		description: "High-quality cinnamon",
		category: "Spices",
	},
	{
		name: "Ginger",
		slug: "ginger",
		description: "Fresh ginger",
		category: "Spices",
	},
	{
		name: "Vanilla",
		slug: "vanilla",
		description: "Pure vanilla extract",
		category: "Extracts",
	},
	{
		name: "Paprika",
		slug: "paprika",
		description: "Smoked paprika",
		category: "Spices",
	},
	{
		name: "Basil",
		slug: "basil",
		description: "Dried basil leaves",
		category: "Herbs",
	},
	{
		name: "Oregano",
		slug: "oregano",
		description: "Organic oregano",
		category: "Herbs",
	},
	{
		name: "Thyme",
		slug: "thyme",
		description: "Fresh thyme",
		category: "Herbs",
	},
	{
		name: "Rosemary",
		slug: "rosemary",
		description: "Dried rosemary",
		category: "Herbs",
	},
	{
		name: "Cumin",
		slug: "cumin",
		description: "Ground cumin",
		category: "Spices",
	},
	{
		name: "Turmeric",
		slug: "turmeric",
		description: "Organic turmeric",
		category: "Spices",
	},
	{
		name: "Coriander",
		slug: "coriander",
		description: "Ground coriander",
		category: "Spices",
	},
	{
		name: "Nutmeg",
		slug: "nutmeg",
		description: "Whole nutmeg",
		category: "Spices",
	},
	{
		name: "Cloves",
		slug: "cloves",
		description: "Whole cloves",
		category: "Spices",
	},
	{
		name: "Cardamom",
		slug: "cardamom",
		description: "Green cardamom pods",
		category: "Spices",
	},
	{
		name: "Saffron",
		slug: "saffron",
		description: "Premium saffron",
		category: "Spices",
	},
	{
		name: "Pepper",
		slug: "pepper",
		description: "Black peppercorns",
		category: "Spices",
	},
	{
		name: "Chili Powder",
		slug: "chili-powder",
		description: "Hot chili powder",
		category: "Spices",
	},
	{
		name: "Garlic Powder",
		slug: "garlic-powder",
		description: "Garlic powder",
		category: "Seasonings",
	},
	{
		name: "Onion Powder",
		slug: "onion-powder",
		description: "Onion powder",
		category: "Seasonings",
	},
	{
		name: "Curry Powder",
		slug: "curry-powder",
		description: "Curry powder blend",
		category: "Blends",
	},
	{
		name: "Italian Seasoning",
		slug: "italian-seasoning",
		description: "Italian herb blend",
		category: "Blends",
	},
	{
		name: "Taco Seasoning",
		slug: "taco-seasoning",
		description: "Taco seasoning blend",
		category: "Blends",
	},
	{
		name: "BBQ Rub",
		slug: "bbq-rub",
		description: "BBQ spice rub",
		category: "Blends",
	},
	{
		name: "Bay Leaves",
		slug: "bay-leaves",
		description: "Dried bay leaves",
		category: "Herbs",
	},
	{
		name: "Mint",
		slug: "mint",
		description: "Fresh mint leaves",
		category: "Herbs",
	},
];

export async function createDummyProducts() {
	const categories: Category[] = [];

	await prisma.$transaction(async (prisma) => {
		for (const categoryData of categoriesData) {
			const category = await prisma.category.create({
				data: {
					name: categoryData.name,
					id: categoryData.id,
					image: {
						create: {
							key: categoryData.image.key,
							url: categoryData.image.url,
							altText: categoryData.image.altText,
							isThumbnail: categoryData.image.isThumbnail,
						},
					},
				},
			});
			categories.push(category);
		}
	});

	const products: (Product & {
		variants: ProductVariant[];
		images: Image[];
	})[] = [];

	await prisma.$transaction(async (prisma) => {
		for (const productData of productsData) {
			const category = categories.find(
				(cat) => cat.name === productData.category,
			);
			if (!category) continue;

			const product = await prisma.product.create({
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
								key: `${productData.slug}-image-key-1`,
								url: `https://test-url.com/${productData.slug}-image-1.jpg`,
								altText: `${productData.name} Image 1`,
								isThumbnail: true,
							},
							{
								key: `${productData.slug}-image-key-2`,
								url: `https://test-url.com/${productData.slug}-image-2.jpg`,
								altText: `${productData.name} Image 2`,
								isThumbnail: false,
							},
						],
					},
				},
				include: {
					variants: true,
					images: true,
				},
			});
			products.push(product);
		}
	});
	return { categories, products };
}
