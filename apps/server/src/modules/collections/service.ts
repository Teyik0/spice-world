import { db } from "@spice-world/server/lib/db";
import { and, eq, inArray, sql } from "drizzle-orm";
import { problem, status } from "elysia";

import {
  collectionProductTable,
  collectionTable,
  productTable,
} from "../../../drizzle/schema";
import { invalidateProductListings } from "../products/service";
import type { ExpectedVersion, uuidGuard } from "../shared";
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
    .select({ id: productTable.id })
    .from(productTable)
    .where(inArray(productTable.id, productIds))
    .orderBy(productTable.id)
    .for("key share");
  await tx
    .delete(collectionProductTable)
    .where(eq(collectionProductTable.collectionId, collectionId));
  if (productIds.length) {
    await tx.insert(collectionProductTable).values(
      productIds.map((productId, position) => ({
        collectionId,
        productId,
        position,
      })),
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
    expectedVersion,
    ...data
  }: uuidGuard & CollectionModel.patchBody & ExpectedVersion) {
    const result = await db.transaction(async (tx) => {
      const [row] = await tx
        .update(collectionTable)
        .set({ ...data, version: sql`${collectionTable.version} + 1` })
        .where(
          and(
            eq(collectionTable.id, id),
            eq(collectionTable.version, expectedVersion),
          ),
        )
        .returning({ id: collectionTable.id });
      if (!row) {
        return (await find(id, tx))
          ? problem("Conflict", {
              code: "VERSION_CONFLICT",
              message: "Collection modified. Reload and retry.",
            })
          : this.collectionNotFound;
      }
      if (productIds) {
        await setProducts(tx, id, productIds);
      }
      return (await find(id, tx)) as CollectionModel.collectionResult;
    });
    invalidateProductListings();
    return result;
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
