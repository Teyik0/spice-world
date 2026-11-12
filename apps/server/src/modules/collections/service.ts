import { db } from "@spice-world/server/lib/db";
import { eq } from "drizzle-orm";
import { problem, status } from "elysia";
import {
  collectionProductTable,
  collectionTable,
} from "../../../drizzle/schema";
import { invalidateProductListings } from "../products/service";
import type { uuidGuard } from "../shared";
import type * as CollectionModel from "./model";

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

async function find(id: string, tx: Tx | typeof db = db) {
  const row = await tx.query.collection.findFirst({
    where: { id },
    with: {
      items: { columns: { productId: true }, orderBy: { position: "asc" } },
    },
  });
  if (!row) {
    return;
  }
  const { items, ...collection } = row;
  return { ...collection, productIds: items.map((i) => i.productId) };
}

/** Replaces the whole ordered selection: array index = position. */
async function setProducts(tx: Tx, collectionId: string, productIds: string[]) {
  await tx
    .delete(collectionProductTable)
    .where(eq(collectionProductTable.collectionId, collectionId));
  if (productIds.length) {
    await tx.insert(collectionProductTable).values(
      productIds.map((productId, position) => ({
        collectionId,
        productId,
        position,
      }))
    );
  }
}

export const collectionService = {
  collectionNotFound: problem("Not Found", {
    code: "COLLECTION_NOT_FOUND",
    message: "Collection not found",
  }),

  async get() {
    const rows = await db.query.collection.findMany({
      orderBy: { name: "asc" },
      with: {
        items: { columns: { productId: true }, orderBy: { position: "asc" } },
      },
    });
    return rows.map(({ items, ...collection }) => ({
      ...collection,
      productIds: items.map((i) => i.productId),
    }));
  },

  async getById({ id }: uuidGuard) {
    return (await find(id)) ?? this.collectionNotFound;
  },

  async post({ productIds = [], ...data }: CollectionModel.postBody) {
    const id = Bun.randomUUIDv7();
    const collection = await db.transaction(async (tx) => {
      await tx.insert(collectionTable).values({ id, ...data });
      await setProducts(tx, id, productIds);
      return find(id, tx);
    });
    invalidateProductListings();
    return status("Created", collection as CollectionModel.collectionResult);
  },

  async patch({
    id,
    productIds,
    ...data
  }: uuidGuard & CollectionModel.patchBody) {
    const collection = await db.transaction(async (tx) => {
      // `id` keeps the SET non-empty; the UPDATE also locks the row so
      // concurrent patches of the same collection run one after the other.
      const [row] = await tx
        .update(collectionTable)
        .set({ ...data, id })
        .where(eq(collectionTable.id, id))
        .returning({ id: collectionTable.id });
      if (!row) {
        return;
      }
      if (productIds) {
        await setProducts(tx, id, productIds);
      }
      return find(id, tx);
    });
    if (!collection) {
      return this.collectionNotFound;
    }
    invalidateProductListings();
    return collection;
  },

  async delete({ id }: uuidGuard) {
    const [row] = await db
      .delete(collectionTable)
      .where(eq(collectionTable.id, id))
      .returning({ id: collectionTable.id });
    if (!row) {
      return this.collectionNotFound;
    }
    invalidateProductListings();
    return status("OK");
  },
};
