import { expect } from "bun:test";

import { treaty } from "@elysia/eden";
import { db } from "@spice-world/server/lib/db";
import { categoryRouter } from "@spice-world/server/modules/categories";
import { inArray } from "drizzle-orm";

import { imageDeletionTable } from "../../drizzle/schema";
import { testDb } from "../setup";
import { createSessionCookie, mockUtapi, waitFor } from "../utils/helper";

export const filePath1 = `${import.meta.dir}/../public/cumin.webp`;
export const filePath2 = `${import.meta.dir}/../public/curcuma.jpg`;

export const uploads = await mockUtapi();
export const api = treaty(categoryRouter, {
  headers: { cookie: await createSessionCookie(testDb) },
});

export const queuedImages = (keys: string[]) =>
  db
    .select({
      fileKey: imageDeletionTable.fileKey,
      attempts: imageDeletionTable.attempts,
    })
    .from(imageDeletionTable)
    .where(inArray(imageDeletionTable.fileKey, keys))
    .orderBy(imageDeletionTable.fileKey);

export const expectDequeued = (keys: string[]) =>
  waitFor(async () => expect(await queuedImages(keys)).toEqual([]));

export const expectDeleted = async (keys: string[]) => {
  await expectDequeued(keys);
  const deleted = uploads.deleteFiles.mock.calls
    .flat(2)
    .filter((key) => keys.includes(key as string));
  expect(deleted.sort()).toEqual([...keys].sort()); // each key exactly once
};

export const expectPreserved = async (keys: string[]) => {
  expect(await queuedImages(keys)).toEqual([]);
  expect(
    uploads.deleteFiles.mock.calls
      .flat(2)
      .filter((key) => keys.includes(key as string)),
  ).toEqual([]);
};
