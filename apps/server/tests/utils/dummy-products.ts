import {
  categoryTable,
  imageTable,
  inventoryTable,
  productTable,
  productVariantTable,
} from "../../drizzle/schema";
import { refreshListing } from "../../src/modules/products/service";
import type { TestDatabase } from "./db-manager";

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
      position: 0,
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
      position: 0,
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
      position: 0,
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
      position: 0,
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
      position: 0,
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

export async function createDummyProducts({ db }: Pick<TestDatabase, "db">) {
  const categories = categoriesData.map(({ image, ...category }) => ({
    ...category,
    imageId: Bun.randomUUIDv7(),
    image,
  }));
  const products = productsData.flatMap(({ category: name, ...product }) => {
    const category = categories.find((cat) => cat.name === name);
    return category
      ? [
          {
            ...product,
            id: Bun.randomUUIDv7(),
            status: Math.random() > 0.5 ? "PUBLISHED" : "DRAFT",
            categoryId: category.id,
          } as const,
        ]
      : [];
  });

  return await db.transaction(async (tx) => {
    await tx
      .insert(imageTable)
      .values(categories.map(({ image, imageId: id }) => ({ ...image, id })));
    await tx
      .insert(categoryTable)
      .values(categories.map(({ image, ...category }) => category));
    await tx.insert(productTable).values(products);
    const variants = products.flatMap(({ id: productId, slug }) =>
      ["001", "002"].map((suffix) => ({
        id: Bun.randomUUIDv7(),
        productId,
        inventoryId: Bun.randomUUIDv7(),
        price: Math.floor(Math.random() * 100),
        sku: `${slug.toUpperCase()}-${suffix}`,
      })),
    );
    await tx.insert(inventoryTable).values(
      variants.map(({ inventoryId: id, productId }) => ({
        id,
        productId,
        quantity: Math.floor(Math.random() * 100),
      })),
    );
    await tx.insert(productVariantTable).values(variants);
    await refreshListing(
      tx,
      products.map(({ id }) => id),
    );
    await tx.insert(imageTable).values(
      products.flatMap(({ id: productId, name, slug }) =>
        [1, 2].map((n) => ({
          id: Bun.randomUUIDv7(),
          productId,
          keyThumb: `${slug}-image-key-${n}-thumb`,
          keyMedium: `${slug}-image-key-${n}-medium`,
          keyLarge: `${slug}-image-key-${n}-large`,
          urlThumb: `https://test-url.com/${slug}-image-${n}-thumb.jpg`,
          urlMedium: `https://test-url.com/${slug}-image-${n}-medium.jpg`,
          urlLarge: `https://test-url.com/${slug}-image-${n}-large.jpg`,
          altText: `${name} Image ${n}`,
          position: n - 1,
        })),
      ),
    );
    return { categories, products };
  });
}
