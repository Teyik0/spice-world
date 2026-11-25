import { eq, isNotNull, sql } from "drizzle-orm";
import { reset, seed } from "drizzle-seed";

import * as schema from "../drizzle/schema";
import {
  attributeTable,
  attributeValueTable,
  attributeValueToProductVariantTable,
  categoryTable,
  imageTable,
  productTable,
  productVariantTable,
} from "../drizzle/schema";
import { db } from "../src/lib/db";

const NUM_PRODUCTS = 100_000; // variants (×5) and images (×2) are set via `with` in seedProductBatch
const BATCH_SIZE = 5000; // products per seed() call, one log line each

const ATTRIBUTE_VALUES: Record<string, string[]> = {
  size: ["small", "medium", "large", "xxl"],
  color: ["black", "white", "red", "blue", "green"],
  weight: ["50g", "100g", "250g", "500g", "1kg"],
  material: ["cotton", "polyester", "leather", "metal", "wood"],
  style: ["classic", "modern", "vintage", "minimalist"],
  origin: ["france", "italy", "japan", "usa", "spain"],
};
const ATTRIBUTE_NAMES = Object.keys(ATTRIBUTE_VALUES);
const CATEGORY_NAMES = [
  "electronics",
  "clothing",
  "food and beverages",
  "home and garden",
  "sports and outdoors",
  "books and media",
  "health and beauty",
  "toys and games",
  "automotive",
  "office supplies",
];
const ADJECTIVES = ["rustic", "smoked", "organic", "sleek", "vintage", "wild"];
const NOUNS = ["paprika", "pepper", "saffron", "lamp", "chair", "bottle"];

const imageUrls = (size: number) =>
  Array.from(
    { length: 20 },
    (_, i) => `https://picsum.photos/seed/${i}/${size}/${size}`,
  );

async function seedCategories() {
  const categories = CATEGORY_NAMES.map((name, i) => ({
    id: Bun.randomUUIDv7(),
    name,
    imageId: Bun.randomUUIDv7(),
    image: {
      isThumbnail: true,
      keyThumb: `category-${i}-thumb`,
      keyMedium: `category-${i}-medium`,
      keyLarge: `category-${i}-large`,
      urlThumb: `https://picsum.photos/seed/category-${i}/128/128`,
      urlMedium: `https://picsum.photos/seed/category-${i}/500/500`,
      urlLarge: `https://picsum.photos/seed/category-${i}/1200/1200`,
    },
  }));
  // 2-3 attributes per category, rotating through ATTRIBUTE_NAMES
  const attributes = categories.flatMap(({ id: categoryId }, i) =>
    ATTRIBUTE_NAMES.slice(i % 4, (i % 4) + 2 + (i % 2)).map((name) => ({
      id: Bun.randomUUIDv7(),
      name,
      categoryId,
    })),
  );
  const values = attributes.flatMap(({ id: attributeId, name }) =>
    (ATTRIBUTE_VALUES[name] ?? []).map((value) => ({
      id: Bun.randomUUIDv7(),
      value,
      attributeId,
    })),
  );

  await db.transaction(async (tx) => {
    await tx
      .insert(imageTable)
      .values(
        categories.map(({ imageId, image }) => ({ id: imageId, ...image })),
      );
    await tx.insert(categoryTable).values(categories);
    await tx.insert(attributeTable).values(attributes);
    await tx.insert(attributeValueTable).values(values);
  });
  return categories.map(({ id }) => id);
}

// Uniqueness is only guaranteed within one seed() call: cross-batch unique columns use uuid().
function seedProductBatch(
  categoryIds: string[],
  offset: number,
  count: number,
) {
  return seed(
    db,
    { productTable, productVariantTable, imageTable },
    { seed: offset },
  ).refine((f) => ({
    productTable: {
      count,
      columns: {
        id: f.uuid(),
        name: f.valuesFromArray({
          values: Array.from({ length: count }, (_, j) => {
            const i = offset + j;
            // Letters only, as nameLowerPattern requires
            const suffix = i
              .toString(16)
              .replace(/\d/gu, (digit) => "ghijklmnop".charAt(Number(digit)));
            return `${ADJECTIVES[i % ADJECTIVES.length]} ${NOUNS[Math.floor(i / ADJECTIVES.length) % NOUNS.length]} ${suffix}`;
          }),
          isUnique: true,
        }),
        slug: f.uuid(), // overwritten from name in fixInvariants()
        description: f.loremIpsum({ sentencesCount: 2 }),
        categoryId: f.valuesFromArray({ values: categoryIds }),
        version: false,
      },
      with: { productVariantTable: 5, imageTable: 2 },
    },
    productVariantTable: {
      columns: {
        id: f.uuid(),
        sku: false,
        currency: false,
        price: f.int({ minValue: 500, maxValue: 10_000 }),
        stock: f.int({ minValue: 0, maxValue: 500 }),
      },
    },
    imageTable: {
      columns: {
        id: f.uuid(),
        altText: false,
        isThumbnail: false,
        keyThumb: f.uuid(),
        keyMedium: f.uuid(),
        keyLarge: f.uuid(),
        urlThumb: f.valuesFromArray({ values: imageUrls(128) }),
        urlMedium: f.valuesFromArray({ values: imageUrls(500) }),
        urlLarge: f.valuesFromArray({ values: imageUrls(1200) }),
      },
    },
  }));
}

async function step(label: string, query: PromiseLike<unknown>) {
  const start = performance.now();
  await query;
  console.log(
    `  ✓ ${label} in ${((performance.now() - start) / 1000).toFixed(1)}s`,
  );
}

// Invariants drizzle-seed can't express: derived slug, one thumbnail per product,
// one value per category attribute for each variant.
function fixInvariants() {
  return db.transaction(async (tx) => {
    await step(
      "slugs",
      tx.update(productTable).set({
        slug: sql`regexp_replace(lower(${productTable.name}), '[^a-z0-9]+', '-', 'g')`,
      }),
    );
    await step(
      "thumbnails",
      tx
        .update(imageTable)
        .set({ isThumbnail: true })
        .where(
          sql`${imageTable.id} in ${tx
            .selectDistinctOn([imageTable.productId], { id: imageTable.id })
            .from(imageTable)
            .where(isNotNull(imageTable.productId))
            .orderBy(imageTable.productId, imageTable.id)}`,
        ),
    );
    await step(
      "variant attribute values",
      tx.insert(attributeValueToProductVariantTable).select(
        tx
          .selectDistinctOn([productVariantTable.id, attributeTable.id], {
            a: attributeValueTable.id,
            b: productVariantTable.id,
          })
          .from(productVariantTable)
          .innerJoin(
            productTable,
            eq(productTable.id, productVariantTable.productId),
          )
          .innerJoin(
            attributeTable,
            eq(attributeTable.categoryId, productTable.categoryId),
          )
          .innerJoin(
            attributeValueTable,
            eq(attributeValueTable.attributeId, attributeTable.id),
          )
          .orderBy(productVariantTable.id, attributeTable.id, sql`random()`),
      ),
    );
  });
}

async function main() {
  const start = performance.now();
  await reset(db, schema);
  const categoryIds = await seedCategories();
  console.log(`✓ Seeded ${CATEGORY_NAMES.length} categories with attributes`);

  for (let offset = 0; offset < NUM_PRODUCTS; offset += BATCH_SIZE) {
    const count = Math.min(BATCH_SIZE, NUM_PRODUCTS - offset);
    const batchStart = performance.now();
    // biome-ignore lint/performance/noAwaitInLoops: Keep seed writes sequential to bound database load.
    await seedProductBatch(categoryIds, offset, count);
    const done = offset + count;
    const rate = done / ((performance.now() - start) / 1000);
    console.log(
      `Batch ${offset / BATCH_SIZE + 1}/${Math.ceil(NUM_PRODUCTS / BATCH_SIZE)} in ${((performance.now() - batchStart) / 1000).toFixed(1)}s | ` +
        `${done.toLocaleString()}/${NUM_PRODUCTS.toLocaleString()} | ${rate.toFixed(0)}/s | ETA ${((NUM_PRODUCTS - done) / rate).toFixed(0)}s`,
    );
  }

  console.log("Linking variants to attribute values, thumbnails, slugs...");
  await fixInvariants();
  console.log(
    `✓ Seeded ${NUM_PRODUCTS.toLocaleString()} products in ${((performance.now() - start) / 1000).toFixed(1)}s`,
  );
}

main()
  .catch((e) => console.error(e))
  .finally(async () => await db.$client.close());
