import {
  MAX_CDN_AGE_MINUTES,
  purgeOnSuccess,
  tag,
} from "@spice-world/server/lib/cdn";
import { catchConstraints, db } from "@spice-world/server/lib/db";
import type { MultiSizeUploadData } from "@spice-world/server/lib/images";
import {
  claimUploads,
  enqueueImageCheck,
  uploadColumns,
  uploadFiles,
} from "@spice-world/server/lib/images";
import {
  and,
  asc,
  desc,
  EmptyFilter,
  eq,
  getColumns,
  inArray,
  notExists,
  sql,
} from "drizzle-orm";
import { status } from "elysia";

import {
  attributeValueToProductVariantTable,
  categoryTable,
  collectionProductTable,
  collectionTable,
  commentTable,
  imageTable,
  inventoryTable,
  orderItemTable,
  orderTable,
  productTable,
  productVariantTable,
} from "../../../drizzle/schema";
import { categoryService } from "../categories/service";
import type { ExpectedVersion, uuidGuard } from "../shared";
import { uploadFileErrStatus } from "../shared";
import {
  InsufficientStock,
  ProductCategoryNotFound,
  ProductCollectionNotFound,
  ProductHasComments,
  ProductNameTaken,
  ProductNotFound,
  ProductReserved,
  ProductVersionConflict,
  StockLimitExceeded,
  StockReserved,
  VariantAttributeValueNotFound,
  VariantReserved,
  VariantSkuTaken,
} from "./errors";
import type * as ProductModel from "./model";
import { validateChange } from "./validators/change";
import { hasProductChanges } from "./validators/has-changes";
import { validateImages } from "./validators/images";
import { validateStock } from "./validators/stock";
import { validateVariantIds } from "./validators/variants";

/*
Examples ->

Product: "Organic Paprika Powder"
├─ id: "prod_002"
├─ slug: "organic-paprika-powder"
├─ description: "Sweet Hungarian paprika. Adds vibrant color and mild flavor."
├─ categoryId: "cat_spices_001" → Category: "Spices"
├─ status: "PUBLISHED"
├─ stockMode: "SHARED" → one inventory: { dimension: "MASS", quantity: 5000000 } (5 kg in mg)
├─ images: [
│   { url: "paprika.jpg", position: 0 }
│  ]
└─ variants: [
    Variant 1:
    ├─ id: "variant_002a"
    ├─ price: €3.99
    ├─ sku: "PAP-50G-001"
    ├─ stockUsage: 50000 (50 g)
    ├─ currency: "EUR"
    └─ attributeValues: [
        { id: "val_50g", value: "50g" } → Attribute: "Weight"
       ]

    Variant 2:
    ├─ id: "variant_002b"
    ├─ price: €6.99
    ├─ sku: "PAP-100G-001"
    ├─ stockUsage: 100000 (100 g)
    ├─ currency: "EUR"
    └─ attributeValues: [
        { id: "val_100g", value: "100g" } → Attribute: "Weight"
       ]

    Variant 3:
    ├─ id: "variant_002c"
    ├─ price: €14.99
    ├─ sku: "PAP-250G-001"
    ├─ stockUsage: 250000 (250 g)
    ├─ currency: "EUR"
    └─ attributeValues: [
        { id: "val_250g", value: "250g" } → Attribute: "Weight"
       ]
   ]
*/

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

/** A new name moves a page to a new slug and a new status can hide it: drop those pages. */
const productPurge = (ids: string[], pagesMayMove: boolean) => {
  const pages = ids.map(tag.product);
  return pagesMayMove
    ? { stale: [tag.products], gone: pages }
    : { stale: [tag.products, ...pages] };
};
type ProductKey = { id: string } | { slug: string };

const withInventory = eq(inventoryTable.id, productVariantTable.inventoryId);

/**
 * Recomputes what listings read from products: stockState, totalStock, priceMin and priceMax.
 * Call it in the transaction that changed their variants or inventories, after locking the
 * inventories it changed: these columns are never repaired afterwards.
 * - out: no variant can be sold
 * - low: a variant is sold out, or an inventory is at or under its lowStockAt
 * - the total counts each inventory once
 * - the price range covers the variants that can be sold, null when none can
 * A product without variant keeps its defaults: out, 0, null.
 *
 * Two checkouts of different variants lock different inventories, yet both refresh the
 * product. The product rows are locked first, in a statement of their own: the next
 * statement then reads the variants and inventories as the other transaction committed them.
 * Lock order, everywhere: inventories, then products, each by id.
 */
export async function refreshListing(
  tx: Pick<Tx, "select" | "update">,
  productIds?: string[],
) {
  await tx
    .select({ id: productTable.id })
    .from(productTable)
    .where(productIds && inArray(productTable.id, productIds))
    .orderBy(asc(productTable.id))
    .for("no key update");
  const { quantity, lowStockAt } = inventoryTable;
  const { price, stockUsage, productId } = productVariantTable;
  const sellable = sql`${quantity} >= ${stockUsage}`;
  const listings = tx
    .select({
      productId,
      state: sql`case when not bool_or(${sellable}) then 'out'
        when bool_or(${quantity} < ${stockUsage} or ${quantity} <= ${lowStockAt}) then 'low'
        else 'in' end`.as("state"),
      priceMin: sql`min(${price}) filter (where ${sellable})`.as("priceMin"),
      priceMax: sql`max(${price}) filter (where ${sellable})`.as("priceMax"),
    })
    .from(productVariantTable)
    .innerJoin(inventoryTable, withInventory)
    .where(productIds && inArray(productId, productIds))
    .groupBy(productId)
    .as("listings");
  await tx
    .update(productTable)
    .set({
      stockState: sql`${listings.state}::"StockState"`,
      totalStock: sql`(select coalesce(sum(${quantity}), 0) from ${inventoryTable} where ${inventoryTable.productId} = ${productTable.id})`,
      priceMin: sql`${listings.priceMin}`,
      priceMax: sql`${listings.priceMax}`,
      updatedAt: sql`${productTable.updatedAt}`,
    })
    .from(listings)
    .where(eq(listings.productId, productTable.id));
}

const variantStats = () => {
  const { productId } = productVariantTable;
  return db
    .select({
      stockDimension:
        sql<ProductModel.stockDimension>`coalesce(min(${inventoryTable.dimension}), 'COUNT')`.as(
          "stockDimension",
        ),
      variantCount: sql<number>`count(*)::int`.as("variantCount"),
    })
    .from(productVariantTable)
    .innerJoin(inventoryTable, withInventory)
    .where(eq(productId, productTable.id))
    .as("stats");
};

const listingFilters = ({
  name,
  status: productStatus,
  categories,
  stock,
}: Pick<ProductModel.getQuery, "name" | "status" | "categories" | "stock">) =>
  and(
    productStatus && eq(productTable.status, productStatus),
    name
      ? sql`to_tsvector('french', ${productTable.name}) @@ plainto_tsquery('french', ${name})`
      : undefined,
    categories?.length
      ? inArray(
          productTable.categoryId,
          db
            .select({ id: categoryTable.id })
            .from(categoryTable)
            .where(inArray(categoryTable.name, categories)),
        )
      : undefined,
    stock && eq(productTable.stockState, stock),
  );

async function find(
  {
    status: productStatus,
    ...key
  }: ProductKey & { status?: ProductModel.productStatus },
  tx: Tx | typeof db = db,
) {
  const product = await tx.query.product.findFirst({
    where: { ...key, status: productStatus ?? EmptyFilter },
    with: {
      category: {
        columns: { id: true, name: true },
        with: {
          attributes: {
            columns: { id: true, name: true },
            orderBy: { id: "asc" },
            with: {
              values: {
                columns: { id: true, value: true },
                orderBy: { id: "asc" },
              },
            },
          },
        },
      },
      images: { columns: { productId: false }, orderBy: { position: "asc" } },
      variants: {
        columns: {
          id: true,
          sku: true,
          price: true,
          currency: true,
          stockUsage: true,
        },
        orderBy: { id: "asc" },
        with: {
          inventory: {
            columns: {
              id: true,
              dimension: true,
              quantity: true,
              lowStockAt: true,
            },
          },
          attributeValues: {
            columns: { id: true, value: true, attributeId: true },
            orderBy: { id: "asc" },
          },
        },
      },
      collections: {
        columns: { collectionId: true },
        orderBy: { collectionId: "asc" },
      },
    },
  });
  if (!product) {
    return;
  }
  const { collections, ...columns } = product;
  return {
    ...columns,
    collectionIds: collections.map((c) => c.collectionId),
    variants: product.variants.map((variant) => {
      const { quantity, lowStockAt } = variant.inventory;
      const available = Math.floor(quantity / variant.stockUsage);
      return {
        ...variant,
        available,
        stockState: stockState(available, quantity, lowStockAt),
      };
    }),
  };
}

const stockState = (
  available: number,
  quantity: number,
  lowStockAt: number,
): ProductModel.stockState => {
  if (!available) {
    return "out";
  }
  return quantity <= lowStockAt ? "low" : "in";
};

function validateOperations(
  current: ProductModel.productResult,
  {
    iOps,
    vOps,
    ...stock
  }: {
    inventory?: ProductModel.sharedInventory;
    iOps?: ProductModel.imageOperations;
    mode: ProductModel.stockMode;
    modeChanged: boolean;
    vOps?: ProductModel.variantOperations;
  },
) {
  return (
    (iOps &&
      validateImages({ imagesOps: iOps, currentImages: current.images })) ??
    (vOps && validateVariantIds(current.variants, vOps)) ??
    validateStock({
      ...stock,
      vOps,
      currentIds: current.variants.map((variant) => variant.id),
    })
  );
}

const slugOf = (name: string) => name.toLowerCase().replace(/\s+/gu, "-");

async function insertImages(
  tx: Tx,
  productId: string,
  images: NonNullable<ProductModel.imageOperations["create"]>,
  uploads: MultiSizeUploadData[],
) {
  if (images.length) {
    await tx.insert(imageTable).values(
      images.map(({ altText, position }, index) => ({
        ...uploadColumns(uploads[index] as MultiSizeUploadData),
        id: Bun.randomUUIDv7(),
        productId,
        altText,
        position,
      })),
    );
  }
}

async function linkAttributeValues(
  tx: Tx,
  variants: { id: string; attributeValueIds?: string[] }[],
) {
  const links = variants.flatMap(({ id, attributeValueIds = [] }) =>
    attributeValueIds.map((valueId) => ({ a: valueId, b: id })),
  );
  if (links.length) {
    await tx.insert(attributeValueToProductVariantTable).values(links);
  }
}

async function unlinkAttributeValues(tx: Tx, variantIds: string[]) {
  await tx
    .delete(attributeValueToProductVariantTable)
    .where(inArray(attributeValueToProductVariantTable.b, variantIds));
}

async function insertVariants(
  tx: Tx,
  productId: string,
  variants: NonNullable<ProductModel.variantOperations["create"]>,
  sharedInventoryId?: string,
) {
  const rows = variants.map((variant) => ({
    ...variant,
    id: Bun.randomUUIDv7(),
    productId,
    inventoryId: sharedInventoryId ?? Bun.randomUUIDv7(),
  }));
  if (!rows.length) {
    return;
  }
  const inventories = rows.flatMap(({ inventory, inventoryId }) =>
    inventory ? [{ ...inventory, id: inventoryId, productId }] : [],
  );
  if (inventories.length) {
    await tx.insert(inventoryTable).values(inventories);
  }
  await tx
    .insert(productVariantTable)
    .values(rows.map(({ attributeValueIds, inventory, ...row }) => row));
  await linkAttributeValues(tx, rows);
}

async function adjustInventory(
  tx: Tx,
  inventoryId: string,
  { adjust, lowStockAt }: { adjust?: number; lowStockAt?: number },
) {
  await tx
    .update(inventoryTable)
    .set({
      ...(adjust && { quantity: sql`${inventoryTable.quantity} + ${adjust}` }),
      lowStockAt,
      updatedAt: sql`CURRENT_TIMESTAMP`,
    })
    .where(eq(inventoryTable.id, inventoryId));
}

async function lockStock(
  tx: Tx,
  { variants }: { variants: { inventory: { id: string } }[] },
) {
  const inventoryIds = variants.map(({ inventory }) => inventory.id);
  await tx
    .select({ id: inventoryTable.id })
    .from(inventoryTable)
    .where(inArray(inventoryTable.id, inventoryIds))
    .orderBy(asc(inventoryTable.id))
    .for("update");
  const reserved = await tx
    .selectDistinct({ variantId: orderItemTable.variantId })
    .from(orderItemTable)
    .innerJoin(orderTable, eq(orderTable.id, orderItemTable.orderId))
    .where(
      and(
        inArray(orderItemTable.inventoryId, inventoryIds),
        eq(orderTable.status, "PENDING"),
      ),
    );
  return new Set(reserved.map(({ variantId }) => variantId));
}

const replacesStock = (
  currentMode: ProductModel.stockMode,
  mode: ProductModel.stockMode,
  inventory?: ProductModel.sharedInventory,
) =>
  mode !== currentMode ||
  (mode === "SHARED" && inventory !== undefined && "quantity" in inventory);

function reservedConflict(
  reserved: Set<string | null>,
  modeChanged: boolean,
  deleted: string[] = [],
  relabeled: string[] = [],
) {
  if (modeChanged && reserved.size) {
    return new StockReserved();
  }
  const variantId = deleted.find((id) => reserved.has(id));
  if (variantId) {
    return new VariantReserved(
      `Pending orders reserve variant ${variantId}: it can be deleted once they are paid or cancelled`,
    );
  }
  return relabeledConflict(reserved, relabeled);
}

function relabeledConflict(reserved: Set<string | null>, relabeled: string[]) {
  const variantId = relabeled.find((id) => reserved.has(id));
  if (variantId) {
    return new VariantReserved(
      `Pending orders reserve variant ${variantId}: its attribute values can change once they are paid or cancelled`,
    );
  }
}

async function updateVariants(
  tx: Tx,
  {
    current,
    mode,
    modeChanged,
    inventory,
    updates,
  }: {
    current: ProductModel.productResult;
    inventory?: ProductModel.sharedInventory;
    mode: ProductModel.stockMode;
    modeChanged: boolean;
    updates: NonNullable<ProductModel.variantOperations["update"]>;
  },
) {
  const currentShared = current.variants[0]?.inventory.id;
  const sharedInventoryId =
    mode === "SHARED" && modeChanged ? Bun.randomUUIDv7() : undefined;
  if (inventory && "quantity" in inventory && sharedInventoryId) {
    await tx
      .insert(inventoryTable)
      .values({ ...inventory, id: sharedInventoryId, productId: current.id });
  } else if (inventory && currentShared) {
    await adjustInventory(tx, currentShared, inventory);
  }
  const inventoryOf = new Map(
    current.variants.map((variant) => [variant.id, variant.inventory.id]),
  );
  for (const {
    id,
    price,
    sku,
    currency,
    stockUsage,
    inventory: own,
  } of updates) {
    const ownInventoryId =
      own && "quantity" in own ? Bun.randomUUIDv7() : undefined;
    if (own && ownInventoryId) {
      // biome-ignore lint/performance/noAwaitInLoops: a transaction runs its statements one at a time
      await tx
        .insert(inventoryTable)
        .values({ ...own, id: ownInventoryId, productId: current.id });
    } else if (own) {
      await adjustInventory(tx, inventoryOf.get(id) as string, own);
    }
    await tx
      .update(productVariantTable)
      .set({
        price,
        sku,
        currency,
        stockUsage: ownInventoryId ? 1 : stockUsage,
        inventoryId: ownInventoryId ?? sharedInventoryId,
        updatedAt: sql`CURRENT_TIMESTAMP`,
      })
      .where(eq(productVariantTable.id, id));
  }
  return mode === "SHARED" ? (sharedInventoryId ?? currentShared) : undefined;
}

async function updateImages(
  tx: Tx,
  images: NonNullable<ProductModel.imageOperations["update"]>,
  replacements: Map<string, MultiSizeUploadData>,
) {
  for (const { id, altText, position } of images) {
    const upload = replacements.get(id);
    // biome-ignore lint/performance/noAwaitInLoops: a transaction runs its statements one at a time
    await tx
      .update(imageTable)
      .set({
        ...(upload && uploadColumns(upload)),
        altText,
        position,
        updatedAt: sql`CURRENT_TIMESTAMP`,
      })
      .where(eq(imageTable.id, id));
  }
}

async function setCollections(
  tx: Tx,
  productId: string,
  collectionIds: string[],
) {
  const { collectionId, position } = collectionProductTable;
  const memberships = await tx
    .select({ collectionId })
    .from(collectionProductTable)
    .where(eq(collectionProductTable.productId, productId));
  const current = memberships.map((m) => m.collectionId);
  const added = collectionIds.filter((id) => !current.includes(id));
  const removed = current.filter((id) => !collectionIds.includes(id));
  const changed = [...added, ...removed];
  if (!changed.length) {
    return;
  }
  await tx
    .select({ id: collectionTable.id })
    .from(collectionTable)
    .where(inArray(collectionTable.id, changed))
    .orderBy(asc(collectionTable.id))
    .for("update");
  await tx
    .update(collectionTable)
    .set({ version: sql`${collectionTable.version} + 1` })
    .where(inArray(collectionTable.id, changed));
  await tx
    .delete(collectionProductTable)
    .where(
      and(
        eq(collectionProductTable.productId, productId),
        inArray(collectionId, removed),
      ),
    );
  if (!added.length) {
    return;
  }
  const tails = await tx
    .select({ collectionId, next: sql<number>`max(${position}) + 1` })
    .from(collectionProductTable)
    .where(inArray(collectionId, added))
    .groupBy(collectionId);
  await tx.insert(collectionProductTable).values(
    added.map((id) => ({
      collectionId: id,
      productId,
      position: tails.find((tail) => tail.collectionId === id)?.next ?? 0,
    })),
  );
}

async function deleteUnusedInventories(tx: Tx, productId: string) {
  await tx
    .delete(inventoryTable)
    .where(
      and(
        eq(inventoryTable.productId, productId),
        notExists(
          tx
            .select({ id: productVariantTable.id })
            .from(productVariantTable)
            .where(eq(productVariantTable.inventoryId, inventoryTable.id)),
        ),
      ),
    );
}

export const productService = {
  async get(query: ProductModel.getQuery) {
    const { skip, take, collection, sortBy, sortDir } = query;
    const stats = variantStats();
    const thumbnail = db
      .select({ urlThumb: imageTable.urlThumb })
      .from(imageTable)
      .where(
        and(
          eq(imageTable.productId, productTable.id),
          eq(imageTable.position, 0),
        ),
      )
      .limit(1);

    const listing = db
      .select({
        ...getColumns(productTable),
        img: sql<string | null>`(${thumbnail})`,
        stockDimension: stats.stockDimension,
        variantCount: stats.variantCount,
      })
      .from(productTable)
      .crossJoinLateral(stats)
      .where(listingFilters(query))
      .$dynamic();

    if (collection) {
      listing
        .innerJoin(
          collectionProductTable,
          eq(collectionProductTable.productId, productTable.id),
        )
        .innerJoin(
          collectionTable,
          and(
            eq(collectionTable.id, collectionProductTable.collectionId),
            eq(collectionTable.handle, collection),
          ),
        );
    }

    const sortColumns = {
      name: productTable.name,
      createdAt: productTable.createdAt,
      updatedAt: productTable.updatedAt,
      priceMin: productTable.priceMin,
      priceMax: productTable.priceMax,
      stock: productTable.stockState,
      position: collectionProductTable.position,
    };
    // A collection is listed in its curated order unless a sort is requested.
    const sort = sortBy ?? (collection ? "position" : "name");
    const direction = sortDir === "desc" ? desc : asc;
    const order = direction(sortColumns[sort]);
    return await listing
      .orderBy(
        sort === "priceMin" || sort === "priceMax"
          ? sql`${order} nulls last`
          : order,
        ...(sort === "stock" ? [direction(productTable.totalStock)] : []),
        productTable.id,
      )
      .limit(take ?? 25)
      .offset(skip ?? 0);
  },

  /** Newest first; only the author's display name leaves the server. */
  async getComments({
    id,
    skip,
    take,
    status: productStatus,
  }: uuidGuard & ProductModel.commentsQuery & ProductModel.countQuery) {
    const [comments, total, visible] = await Promise.all([
      db.query.comment.findMany({
        where: { productId: id },
        orderBy: { createdAt: "desc", id: "desc" },
        offset: skip,
        limit: take,
        columns: { id: true, text: true, createdAt: true },
        with: { user: { columns: { name: true } } },
      }),
      db.$count(commentTable, eq(commentTable.productId, id)),
      db.$count(
        productTable,
        and(
          eq(productTable.id, id),
          productStatus && eq(productTable.status, productStatus),
        ),
      ),
    ]);
    return visible ? { comments, total } : new ProductNotFound();
  },

  async getById(query: uuidGuard & ProductModel.countQuery) {
    return (await find(query)) ?? new ProductNotFound();
  },

  async getBySlug(query: { slug: string } & ProductModel.countQuery) {
    return (await find(query)) ?? new ProductNotFound();
  },

  async count({ status: productStatus }: ProductModel.countQuery) {
    return await db.$count(
      productTable,
      productStatus && eq(productTable.status, productStatus),
    );
  },

  async facets(query: ProductModel.facetsQuery) {
    const state = productTable.stockState;
    const [byStatus, [byStock], byCategory] = await Promise.all([
      db
        .select({
          status: productTable.status,
          count: sql<number>`count(*)::int`,
        })
        .from(productTable)
        .where(listingFilters({ ...query, status: undefined }))
        .groupBy(productTable.status),
      db
        .select({
          low: sql<number>`(count(*) filter (where ${state} = 'low'))::int`,
          out: sql<number>`(count(*) filter (where ${state} = 'out'))::int`,
        })
        .from(productTable)
        .where(listingFilters({ ...query, stock: undefined })),
      db
        .select({
          name: categoryTable.name,
          count: sql<number>`count(*)::int`,
        })
        .from(productTable)
        .innerJoin(categoryTable, eq(productTable.categoryId, categoryTable.id))
        .where(listingFilters({ ...query, categories: undefined }))
        .groupBy(categoryTable.name),
    ]);
    const counts: ProductModel.facets["status"] = {
      ALL: 0,
      PUBLISHED: 0,
      DRAFT: 0,
      ARCHIVED: 0,
    };
    for (const row of byStatus) {
      counts[row.status] = row.count;
      counts.ALL += row.count;
    }
    return {
      status: counts,
      stock: byStock ?? { low: 0, out: 0 },
      category: Object.fromEntries(byCategory.map((c) => [c.name, c.count])),
    };
  },

  async post({
    name,
    status: requestedStatus,
    description,
    categoryId,
    variants,
    images,
    collectionIds,
    ...body
  }: ProductModel.postBody) {
    const category = await categoryService.getById({ id: categoryId });
    if (category instanceof Error) {
      return category;
    }

    const invalid = validateChange({
      product: { status: requestedStatus, variants: [] },
      category,
      categoryChanged: true,
      requestedStatus,
      vOps: { create: variants },
    });
    if (invalid instanceof Error) {
      return invalid;
    }

    if (await db.$count(productTable, eq(productTable.name, name))) {
      return new ProductNameTaken();
    }

    const { data: uploads, error } = await uploadFiles(
      name,
      images.map(({ file }) => file),
    );
    if (error || uploads?.length !== images.length) {
      return uploadFileErrStatus(error);
    }

    const id = Bun.randomUUIDv7();
    const product = await catchConstraints(
      [
        ProductNameTaken,
        VariantSkuTaken,
        ProductCategoryNotFound,
        ProductCollectionNotFound,
        VariantAttributeValueNotFound,
      ],
      db.transaction(async (tx) => {
        await claimUploads(tx, uploads);
        await tx.insert(productTable).values({
          id,
          name,
          slug: slugOf(name),
          description,
          categoryId,
          status: requestedStatus,
          stockMode: body.stockMode,
        });
        const [shared] =
          body.stockMode === "SHARED"
            ? await tx
                .insert(inventoryTable)
                .values({
                  ...body.inventory,
                  id: Bun.randomUUIDv7(),
                  productId: id,
                })
                .returning({ id: inventoryTable.id })
            : [];
        await insertImages(tx, id, images, uploads);
        await insertVariants(tx, id, variants, shared?.id);
        await refreshListing(tx, [id]);
        if (collectionIds) {
          await setCollections(tx, id, collectionIds);
        }
        return await find({ id }, tx);
      }),
    );
    if (product instanceof Error) {
      return product;
    }
    return purgeOnSuccess(
      status("Created", product as ProductModel.productResult),
      { stale: [tag.products] },
    );
  },

  async patch({
    id,
    name,
    status: requestedStatus,
    description,
    categoryId,
    stockMode,
    inventory,
    images: iOps,
    variants: vOps,
    collectionIds,
    expectedVersion,
  }: ProductModel.patchBody & uuidGuard & ExpectedVersion) {
    const current = await find({ id });
    if (!current) {
      return new ProductNotFound();
    }
    if (current.version !== expectedVersion) {
      return new ProductVersionConflict();
    }
    const mode = stockMode ?? current.stockMode;
    const modeChanged = replacesStock(current.stockMode, mode, inventory);
    const invalidOperations = validateOperations(current, {
      iOps,
      vOps,
      mode,
      modeChanged,
      inventory,
    });
    if (invalidOperations) {
      return invalidOperations;
    }
    if (
      !hasProductChanges({
        newData: {
          name,
          description,
          requestedStatus,
          categoryId,
          stockMode,
          inventory,
          iOps,
          vOps,
          collectionIds,
        },
        currentProduct: current,
      })
    ) {
      return current;
    }

    const categoryChanged =
      categoryId !== undefined && categoryId !== current.categoryId;
    const category = categoryChanged
      ? await categoryService.getById({ id: categoryId })
      : current.category;
    if (category instanceof Error) {
      return category;
    }
    const invalidChange = validateChange({
      product: current,
      category,
      categoryChanged,
      requestedStatus,
      vOps,
    });
    if (invalidChange) {
      return invalidChange;
    }

    const createdImages = iOps?.create ?? [];
    const updatedImages = iOps?.update ?? [];
    const replacedImages = updatedImages.flatMap(({ id: imageId, file }) =>
      file ? [{ id: imageId, file }] : [],
    );
    const files = [...createdImages, ...replacedImages].map(({ file }) => file);
    const { data: uploads, error } = files.length
      ? await uploadFiles(name ?? current.name, files)
      : { data: [], error: null };
    if (error || uploads?.length !== files.length) {
      return uploadFileErrStatus(error);
    }
    const replacements = new Map(
      replacedImages.map((image, index) => [
        image.id,
        uploads[createdImages.length + index] as MultiSizeUploadData,
      ]),
    );

    const createdVariants = vOps?.create ?? [];
    const relinkedVariants = (vOps?.update ?? []).filter(
      ({ attributeValueIds }) => attributeValueIds,
    );
    const relabeled = (
      categoryChanged ? current.variants : relinkedVariants
    ).map((variant) => variant.id);

    const outcome = await catchConstraints(
      [
        ProductNameTaken,
        VariantSkuTaken,
        ProductCategoryNotFound,
        ProductCollectionNotFound,
        VariantAttributeValueNotFound,
        InsufficientStock,
        StockLimitExceeded,
      ],
      db.transaction(async (tx) => {
        const reserved = reservedConflict(
          await lockStock(tx, current),
          modeChanged,
          vOps?.delete,
          relabeled,
        );
        if (reserved) {
          return reserved;
        }
        const [updated] = await tx
          .update(productTable)
          .set({
            ...(name && { name, slug: slugOf(name) }),
            description,
            categoryId,
            status: requestedStatus,
            stockMode,
            version: expectedVersion + 1,
          })
          .where(
            and(
              eq(productTable.id, id),
              eq(productTable.version, expectedVersion),
            ),
          )
          .returning({ id: productTable.id, name: productTable.name });
        // Everything above was validated against this version. Nothing written yet: safe to return.
        if (!updated) {
          return new ProductVersionConflict();
        }

        if (uploads.length) {
          await claimUploads(tx, uploads);
        }
        const deletedImages = iOps?.delete ?? [];
        await enqueueImageCheck(
          tx,
          current.images
            .filter(
              (image) =>
                deletedImages.includes(image.id) || replacements.has(image.id),
            )
            .flatMap((image) => [
              image.keyThumb,
              image.keyMedium,
              image.keyLarge,
            ]),
          MAX_CDN_AGE_MINUTES, // a cached copy may still show the image
        );
        if (deletedImages.length) {
          await tx
            .delete(imageTable)
            .where(inArray(imageTable.id, deletedImages));
        }
        await updateImages(tx, updatedImages, replacements);
        await insertImages(tx, updated.id, createdImages, uploads);

        if (vOps?.delete?.length) {
          await tx
            .delete(productVariantTable)
            .where(inArray(productVariantTable.id, vOps.delete));
        }
        const sharedInventoryId = await updateVariants(tx, {
          current,
          mode,
          modeChanged,
          inventory,
          updates: vOps?.update ?? [],
        });
        const unlinked = categoryChanged ? current.variants : relinkedVariants;
        if (unlinked.length) {
          await unlinkAttributeValues(
            tx,
            unlinked.map((variant) => variant.id),
          );
        }
        await linkAttributeValues(tx, relinkedVariants);
        await insertVariants(tx, id, createdVariants, sharedInventoryId);
        await deleteUnusedInventories(tx, id);
        await refreshListing(tx, [id]);
        if (collectionIds) {
          await setCollections(tx, id, collectionIds);
        }

        return (await find({ id }, tx)) as ProductModel.productResult;
      }),
    );
    return purgeOnSuccess(
      outcome,
      productPurge([id], name !== undefined || requestedStatus !== undefined),
    );
  },

  async bulkPatch({
    ids,
    status: requestedStatus,
    categoryId,
  }: ProductModel.bulkPatchBody) {
    const category = categoryId
      ? await categoryService.getById({ id: categoryId })
      : undefined;
    if (category instanceof Error) {
      return category;
    }

    const outcome = await catchConstraints(
      [ProductCategoryNotFound],
      db.transaction(async (tx) => {
        await tx
          .select({ id: inventoryTable.id })
          .from(inventoryTable)
          .where(inArray(inventoryTable.productId, ids))
          .orderBy(asc(inventoryTable.id))
          .for("update");
        const locked = await tx
          .select({ id: productTable.id })
          .from(productTable)
          .where(inArray(productTable.id, ids))
          .orderBy(productTable.id)
          .for("update");
        if (locked.length !== ids.length) {
          return new ProductNotFound();
        }
        const products = await tx.query.product.findMany({
          where: { id: { in: ids } },
          columns: { id: true, name: true, categoryId: true, status: true },
          with: {
            category: {
              with: {
                attributes: {
                  columns: { id: true },
                  with: { values: { columns: { id: true } } },
                },
              },
            },
            variants: {
              columns: { id: true, price: true },
              with: { attributeValues: { columns: { id: true } } },
            },
          },
        });
        const movesCategory = (product: { categoryId: string }) =>
          categoryId !== undefined && categoryId !== product.categoryId;

        for (const product of products) {
          const invalid = validateChange({
            product,
            category: category ?? product.category,
            categoryChanged: movesCategory(product),
            requestedStatus,
            label: `Product "${product.name}": `,
          });
          if (invalid) {
            return invalid;
          }
        }
        const movedVariants = products
          .filter(movesCategory)
          .flatMap(({ variants }) => variants.map(({ id }) => id));
        const pending = movedVariants.length
          ? await tx
              .selectDistinct({ variantId: orderItemTable.variantId })
              .from(orderItemTable)
              .innerJoin(orderTable, eq(orderTable.id, orderItemTable.orderId))
              .where(
                and(
                  inArray(orderItemTable.variantId, movedVariants),
                  eq(orderTable.status, "PENDING"),
                ),
              )
          : [];
        const reserved = relabeledConflict(
          new Set(pending.map(({ variantId }) => variantId)),
          movedVariants,
        );
        if (reserved) {
          return reserved;
        }

        await tx
          .update(productTable)
          .set({
            status: requestedStatus,
            categoryId,
            version: sql`${productTable.version} + 1`,
          })
          .where(inArray(productTable.id, ids));
        if (movedVariants.length) {
          await unlinkAttributeValues(tx, movedVariants);
        }
        return { count: products.length };
      }),
    );
    return purgeOnSuccess(
      outcome,
      productPurge(ids, requestedStatus !== undefined),
    );
  },

  async delete({ id }: uuidGuard) {
    const outcome = await catchConstraints(
      [ProductHasComments],
      db.transaction(async (tx) => {
        await tx
          .select({ id: inventoryTable.id })
          .from(inventoryTable)
          .where(eq(inventoryTable.productId, id))
          .orderBy(asc(inventoryTable.id))
          .for("update");
        // Locked first: no image can be added before the cascade removes them.
        const [locked] = await tx
          .select({ id: productTable.id })
          .from(productTable)
          .where(eq(productTable.id, id))
          .for("update");
        if (!locked) {
          return new ProductNotFound();
        }
        const [reserved] = await tx
          .select({ id: orderItemTable.id })
          .from(orderItemTable)
          .innerJoin(orderTable, eq(orderTable.id, orderItemTable.orderId))
          .where(
            and(
              eq(orderItemTable.productId, id),
              eq(orderTable.status, "PENDING"),
            ),
          )
          .limit(1);
        if (reserved) {
          return new ProductReserved();
        }
        const images = await tx
          .delete(imageTable)
          .where(eq(imageTable.productId, id))
          .returning();
        await tx.delete(productTable).where(eq(productTable.id, id));
        await enqueueImageCheck(
          tx,
          images.flatMap((image) => [
            image.keyThumb,
            image.keyMedium,
            image.keyLarge,
          ]),
          MAX_CDN_AGE_MINUTES, // a cached copy may still show the image
        );
        return status("OK");
      }),
    );
    return purgeOnSuccess(outcome, {
      stale: [tag.products],
      gone: [tag.product(id)],
    });
  },
};
