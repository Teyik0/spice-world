import { faker } from "@faker-js/faker";
import { prisma } from "../src/lib/prisma";

async function fixProductNames() {
	console.log("Fixing product names with # numbers...\n");

	// Get all products with # in their name
	const products = await prisma.product.findMany({
		where: {
			name: {
				contains: " #",
			},
		},
		select: { id: true, name: true, slug: true },
	});

	console.log(`Found ${products.length.toLocaleString()} products to fix\n`);

	// Update in batches
	const BATCH_SIZE = 1000;
	const totalBatches = Math.ceil(products.length / BATCH_SIZE);

	for (let i = 0; i < totalBatches; i++) {
		const batch = products.slice(i * BATCH_SIZE, (i + 1) * BATCH_SIZE);

		await prisma.$transaction(
			batch.map((product) => {
				// Remove # and number from name
				const baseName = product.name.replace(/ #\d+$/, "").trim();
				const uniqueSuffix = faker.string.alpha({ length: 6, casing: "lower" });
				const newName = `${baseName} ${uniqueSuffix}`;

				// Remove number from slug
				const baseSlug = product.slug.replace(/-\d+$/, "").trim();
				const newSlug = `${baseSlug}-${uniqueSuffix}`;

				return prisma.product.update({
					where: { id: product.id },
					data: {
						name: newName,
						slug: newSlug,
					},
				});
			}),
		);

		console.log(
			`Batch ${i + 1}/${totalBatches} completed (${Math.min((i + 1) * BATCH_SIZE, products.length).toLocaleString()}/${products.length.toLocaleString()})`,
		);
	}

	console.log("\n✓ All product names fixed!");
}

fixProductNames()
	.catch((e) => console.error(e))
	.finally(async () => await prisma.$disconnect());
