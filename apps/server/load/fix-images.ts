import { prisma } from "../src/lib/prisma";

async function fixImages() {
	console.log("Fixing broken Unsplash images...\n");

	// Get all images
	const images = await prisma.image.findMany({
		select: { id: true, url: true },
	});

	console.log(`Found ${images.length.toLocaleString()} images to fix`);

	const brokenImages = images.filter((img) =>
		img.url.includes("source.unsplash.com"),
	);

	console.log(
		`${brokenImages.length.toLocaleString()} images need to be updated\n`,
	);

	// Update in batches
	const BATCH_SIZE = 1000;
	const totalBatches = Math.ceil(brokenImages.length / BATCH_SIZE);

	for (let i = 0; i < totalBatches; i++) {
		const batch = brokenImages.slice(i * BATCH_SIZE, (i + 1) * BATCH_SIZE);

		await prisma.$transaction(
			batch.map((img) =>
				prisma.image.update({
					where: { id: img.id },
					data: {
						url: `https://picsum.photos/seed/${img.id}/1000/1000`,
					},
				}),
			),
		);

		console.log(
			`Batch ${i + 1}/${totalBatches} completed (${Math.min((i + 1) * BATCH_SIZE, brokenImages.length).toLocaleString()}/${brokenImages.length.toLocaleString()})`,
		);
	}

	console.log("\n✓ All images fixed!");
}

fixImages()
	.catch((e) => console.error(e))
	.finally(async () => await prisma.$disconnect());
