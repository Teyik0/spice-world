import { purgeOnSuccess, tag } from "@spice-world/server/lib/cdn";
import { catchConstraints, db } from "@spice-world/server/lib/db";
import { and, eq, inArray, sql } from "drizzle-orm";
import { status } from "elysia";

import {
  collectionProductTable,
  collectionTable,
  productTable,
} from "../../../drizzle/schema";
import type { ExpectedVersion, uuidGuard } from "../shared";
import {
  CollectionHandleTaken,
  CollectionNotFound,
  CollectionProductNotFound,
  CollectionVersionConflict,
} from "./errors";
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
    return (await find(id)) ?? new CollectionNotFound();
  },

  async post({ productIds = [], ...data }: CollectionModel.postBody) {
    const id = Bun.randomUUIDv7();
    const collection = await catchConstraints(
      [CollectionHandleTaken, CollectionProductNotFound],
      db.transaction(async (tx) => {
        await tx.insert(collectionTable).values({ id, ...data });
        await setProducts(tx, id, productIds);
        return find(id, tx);
      }),
    );
    if (collection instanceof Error) {
      return collection;
    }
    // product listings filter by collection; collections themselves are never cached
    return purgeOnSuccess(
      status("Created", collection as CollectionModel.collectionResult),
      { stale: [tag.products] },
    );
  },

  async patch({
    id,
    productIds,
    expectedVersion,
    ...data
  }: uuidGuard & CollectionModel.patchBody & ExpectedVersion) {
    const result = await catchConstraints(
      [CollectionHandleTaken, CollectionProductNotFound],
      db.transaction(async (tx) => {
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
            ? new CollectionVersionConflict()
            : new CollectionNotFound();
        }
        if (productIds) {
          await setProducts(tx, id, productIds);
        }
        return (await find(id, tx)) as CollectionModel.collectionResult;
      }),
    );
    return purgeOnSuccess(result, { stale: [tag.products] });
  },

  async delete({ id }: uuidGuard) {
    const [row] = await db
      .delete(collectionTable)
      .where(eq(collectionTable.id, id))
      .returning({ id: collectionTable.id });
    if (!row) {
      return new CollectionNotFound();
    }
    return purgeOnSuccess(status("OK"), { stale: [tag.products] });
  },
};
