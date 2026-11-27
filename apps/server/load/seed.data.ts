import { eq, notExists, sql } from "drizzle-orm";
import { reset, seed } from "drizzle-seed";

import * as schema from "../drizzle/schema";
import {
  attributeTable,
  attributeValueTable,
  attributeValueToProductVariantTable,
  categoryTable,
  imageTable,
  inventoryTable,
  productTable,
  productVariantTable,
} from "../drizzle/schema";
import { db } from "../src/lib/db";
import { refreshListing } from "../src/modules/products/service";

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
      position: 0,
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
  // Every attribute value combination of each category, one row per value: variants pick combos by index
  const combos = categories.flatMap(({ id: categoryId }) => {
    const all = attributes
      .filter((a) => a.categoryId === categoryId)
      .map((a) => values.filter((v) => v.attributeId === a.id).map((v) => v.id))
      .reduce<string[][]>(
        (acc, ids) => acc.flatMap((c) => ids.map((id) => [...c, id])),
        [[]],
      );
    return all.flatMap((valueIds, idx) =>
      valueIds.map((valueId) => ({
        categoryId,
        idx,
        total: all.length,
        valueId,
      })),
    );
  });
  return { categoryIds: categories.map(({ id }) => id), combos };
}

// Uniqueness is only guaranteed within one seed() call: cross-batch unique columns use uuid().
function seedProductBatch(
  categoryIds: string[],
  offset: number,
  count: number,
) {
  return seed(
    db,
    { productTable, inventoryTable, productVariantTable, imageTable },
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
        stockMode: false,
        // derived: refreshListing in fixInvariants
        stockState: false,
        totalStock: false,
        priceMin: false,
        priceMax: false,
      },
      // one inventory per variant (VARIANT); fixInvariants merges them for SHARED products
      with: { inventoryTable: 5, imageTable: 2 },
    },
    inventoryTable: {
      columns: {
        id: f.uuid(),
        dimension: false,
        quantity: f.int({ minValue: 0, maxValue: 500 }),
        // thresholds are the admin's: none by default, low means a sold-out variant
        lowStockAt: f.default({ defaultValue: 0 }),
      },
      with: { productVariantTable: 1 },
    },
    productVariantTable: {
      columns: {
        id: f.uuid(),
        sku: false,
        currency: false,
        stockUsage: false,
        price: f.int({ minValue: 500, maxValue: 10_000 }),
      },
    },
    imageTable: {
      columns: {
        id: f.uuid(),
        altText: false,
        position: f.default({ defaultValue: 0 }), // fixed by fixInvariants
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

// Invariants drizzle-seed can't express: derived slug, image positions 0..n-1 per product,
// variants on the product of their inventory, one distinct attribute value combination per
// variant within a product, and a SHARED MASS stock for the products sold by weight.
function fixInvariants(
  combos: Awaited<ReturnType<typeof seedCategories>>["combos"],
) {
  return db.transaction(async (tx) => {
    await step(
      "slugs",
      tx.update(productTable).set({
        slug: sql`regexp_replace(lower(${productTable.name}), '[^a-z0-9]+', '-', 'g')`,
      }),
    );
    await step(
      "image positions",
      tx.execute(sql`
        update ${imageTable} set position = ordered.position
        from (
          select id, row_number() over (partition by ${imageTable.productId} order by id) - 1 as position
          from ${imageTable} where ${imageTable.productId} is not null
        ) as ordered
        where ${imageTable.id} = ordered.id`),
    );
    await step(
      "variant products",
      tx
        .update(productVariantTable)
        .set({ productId: inventoryTable.productId })
        .from(inventoryTable)
        .where(eq(inventoryTable.id, productVariantTable.inventoryId)),
    );
    await step(
      "variant attribute values",
      // (variant rank + per-product offset) % category combo count (≥ 20 > 5 variants): no duplicates.
      // idx is computed before joining so the join is an equi-join on (category_id, idx).
      tx.execute(sql`
        insert into ${attributeValueToProductVariantTable}
        with c(category_id, idx, total, value_id) as (values ${sql.join(
          combos.map(
            (c) =>
              sql`(${c.categoryId}, ${c.idx}::int, ${c.total}::int, ${c.valueId})`,
          ),
          sql`, `,
        )})
        select c.value_id, v.id
        from (
          select ${productVariantTable.id} as id, t.category_id,
            (row_number() over (partition by ${productVariantTable.productId} order by ${productVariantTable.id}) - 1
              + abs(hashtext(${productVariantTable.productId})::bigint)) % t.total as idx
          from ${productVariantTable}
          join ${productTable} on ${productTable.id} = ${productVariantTable.productId}
          join (select distinct category_id, total from c) t on t.category_id = ${productTable.categoryId}
        ) v
        join c on c.category_id = v.category_id and c.idx = v.idx
      `),
    );
    await step(
      "shared stocks",
      // Variants with a weight value draw from one MASS inventory: "250g" takes 250000 mg.
      tx.execute(sql`
        with weighed as (
          select ${productVariantTable.id} as id, ${productVariantTable.productId} as product_id,
            case when ${attributeValueTable.value} like '%kg'
              then left(${attributeValueTable.value}, -2)::bigint * 1000000
              else left(${attributeValueTable.value}, -1)::bigint * 1000 end as usage,
            min(${productVariantTable.inventoryId}) over (partition by ${productVariantTable.productId}) as shared
          from ${productVariantTable}
          join ${attributeValueToProductVariantTable} on ${attributeValueToProductVariantTable.b} = ${productVariantTable.id}
          join ${attributeValueTable} on ${attributeValueTable.id} = ${attributeValueToProductVariantTable.a}
          join ${attributeTable} on ${attributeTable.id} = ${attributeValueTable.attributeId}
          where ${attributeTable.name} = 'weight'
        ), products as (
          update ${productTable} set "stockMode" = 'SHARED'
          where ${productTable.id} in (select product_id from weighed)
        ), stocks as (
          update ${inventoryTable} set dimension = 'MASS', quantity = quantity * 10000, "lowStockAt" = 500000
          where ${inventoryTable.id} in (select shared from weighed)
        )
        update ${productVariantTable} set "inventoryId" = weighed.shared, "stockUsage" = weighed.usage
        from weighed where ${productVariantTable.id} = weighed.id
      `),
    );
    await step(
      "unused inventories",
      tx
        .delete(inventoryTable)
        .where(
          notExists(
            tx
              .select({ id: productVariantTable.id })
              .from(productVariantTable)
              .where(eq(productVariantTable.inventoryId, inventoryTable.id)),
          ),
        ),
    );
    await step("listing columns", refreshListing(tx));
  });
}

async function main() {
  const start = performance.now();
  await reset(db, schema);
  const { categoryIds, combos } = await seedCategories();
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
  await fixInvariants(combos);
  console.log(
    `✓ Seeded ${NUM_PRODUCTS.toLocaleString()} products in ${((performance.now() - start) / 1000).toFixed(1)}s`,
  );
}

main()
  .catch((e) => console.error(e))
  .finally(async () => await db.$client.close());
