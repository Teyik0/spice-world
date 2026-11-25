import { describe, expect, test } from "bun:test";

import { db } from "@spice-world/server/lib/db";
import { inArray, sql } from "drizzle-orm";

import { imageDeletionTable } from "../../drizzle/schema";
import type { MultiSizeUploadData, utapi } from "../../src/lib/images";
import { testDb } from "../setup";
import {
  createTestCategory,
  expectDefined,
  file,
  waitFor,
} from "../utils/helper";
import {
  api,
  expectDequeued,
  filePath1,
  filePath2,
  queuedImages,
  uploads,
} from "./setup";

describe.concurrent("category images", () => {
  test("should refuse to claim uploads the cleanup may already have deleted", async () => {
    const { claimUploads } = await import("@spice-world/server/lib/images");
    const ids = Array.from({ length: 3 }, () => Bun.randomUUIDv7());
    await db.insert(imageDeletionTable).values(
      ids.map((fileKey) => ({
        fileKey,
        notBefore: sql`statement_timestamp()`,
      })),
    );
    const [thumb, medium, large] = ids.map((key) => ({ key }));
    // Due rows may be swept by a concurrent cleanup at any time: only the refusal is deterministic.
    expect(
      db.transaction((tx) =>
        claimUploads(tx, [{ thumb, medium, large } as MultiSizeUploadData]),
      ),
    ).rejects.toThrow("Upload expired before commit");
  });

  test("should drop referenced keys and delete orphan files on cleanup", async () => {
    const category = await createTestCategory({ testDb });
    const image = await db.query.image.findFirst({
      where: { id: category.imageId },
    });
    expectDefined(image);
    const orphan = `orphan-${Bun.randomUUIDv7()}`;
    await db.insert(imageDeletionTable).values(
      [image.keyThumb, orphan].map((fileKey) => ({
        fileKey,
        notBefore: sql`statement_timestamp()`,
      })),
    );
    await expectDequeued([image.keyThumb, orphan]);
    expect(uploads.deleteFiles).toHaveBeenCalledWith(
      expect.arrayContaining([orphan]),
    );
    expect(uploads.deleteFiles).not.toHaveBeenCalledWith(
      expect.arrayContaining([image.keyThumb]),
    );
    expect(await db.query.image.findFirst({ where: { id: image.id } })).toEqual(
      image,
    );
  });

  test.each(["patch", "delete"] as const)(
    "should rollback %s when image deletion enqueue fails",
    async (operation) => {
      const category = await createTestCategory({ testDb, attributeCount: 1 });
      const before = await api.categories({ id: category.id }).get();
      expectDefined(before.data);
      const keys = [
        before.data.image.keyThumb,
        before.data.image.keyMedium,
        before.data.image.keyLarge,
      ];
      const constraint = `reject_deletion_${Bun.randomUUIDv7().replaceAll("-", "")}`;
      // A key-specific database constraint injects a real write failure without affecting other tests.
      await db.execute(
        sql`alter table ${imageDeletionTable} add constraint ${sql.identifier(constraint)} check ("fileKey" <> ${before.data.image.keyThumb})`.inlineParams(),
      );
      try {
        const result =
          operation === "patch"
            ? await api.categories({ id: category.id }).patch({
                name: `${category.name} renamed`,
                file: file(filePath2),
              })
            : await api.categories({ id: category.id }).delete();
        expect(result.error).toMatchObject({ status: 500 });
        expect((await api.categories({ id: category.id }).get()).data).toEqual(
          before.data,
        );
        expect(
          await db
            .select()
            .from(imageDeletionTable)
            .where(inArray(imageDeletionTable.fileKey, keys)),
        ).toEqual([]);
        for (const key of keys) {
          expect(uploads.deleteFiles).not.toHaveBeenCalledWith(
            expect.arrayContaining([key]),
          );
        }
      } finally {
        await db.execute(
          sql`alter table ${imageDeletionTable} drop constraint ${sql.identifier(constraint)}`,
        );
      }
    },
  );

  // The serial tests below swap shared UploadThing mocks or database constraints.
  const run = async (
    operation: "post" | "patch",
    name: string,
    image: File | ReturnType<typeof file>,
  ) => {
    const category = await createTestCategory({ testDb });
    const before = await api.categories({ id: category.id }).get();
    const { error } =
      operation === "post"
        ? await api.categories.post({ name, file: image })
        : await api
            .categories({ id: category.id })
            .patch({ name, file: image });
    expect((await api.categories({ id: category.id }).get()).data).toEqual(
      before.data,
    );
    expect(await db.query.category.findFirst({ where: { name } })).toBe(
      undefined,
    );
    return error;
  };

  test.each(["post", "patch"] as const)(
    "should reject a file over 7 MB on %s",
    async (operation) => {
      const bytes = new Uint8Array(7 * 1024 * 1024 + 1);
      bytes.set(await file(filePath2).bytes());
      const error = await run(
        operation,
        `oversized ${operation}`,
        new File([bytes], "oversized.jpg", { type: "image/jpeg" }),
      );
      expect(error).toMatchObject({ status: 422 });
    },
  );

  test.each(["post", "patch"] as const)(
    "should reject a corrupted image on %s",
    async (operation) => {
      const bytes = (await file(filePath1).bytes()).slice(0, 500);
      const error = await run(
        operation,
        `corrupted ${operation}`,
        new File([bytes], "corrupted.webp", { type: "image/webp" }),
      );
      expect(error).toMatchObject({ status: 422 });
    },
  );

  test.serial.each(["post", "patch"] as const)(
    "should queue every key after a partial upload failure on %s",
    async (operation) => {
      const keys = uploads.failNextUpload(1);
      const error = await run(
        operation,
        `partial ${operation}`,
        file(filePath1),
      );
      expect(error).toMatchObject({ status: 502 });
      expect(keys).toHaveLength(3);
      expect(await queuedImages(keys)).toEqual(
        [...keys].sort().map((fileKey) => ({ fileKey, attempts: 0 })),
      );
    },
  );

  test.serial.each(["post", "patch"] as const)(
    "should rollback when the upload expires before commit on %s",
    async (operation) => {
      let keys: string[] = [];
      uploads.uploadFiles.mockImplementationOnce((async (
        files: (File & { customId: string })[],
      ) => {
        keys = files.map(({ customId }) => customId);
        await db
          .update(imageDeletionTable)
          .set({ notBefore: sql`statement_timestamp()` })
          .where(inArray(imageDeletionTable.fileKey, keys));
        return files.map(() => ({
          data: { ufsUrl: "https://mock.test/a.webp" },
          error: null,
        }));
      }) as unknown as typeof utapi.uploadFiles);
      const error = await run(
        operation,
        `expired ${operation}`,
        file(filePath1),
      );
      expect(error).toMatchObject({ status: 500 });
      expect(
        await db.query.image.findFirst({ where: { keyThumb: keys[0] } }),
      ).toBeUndefined();
      // Due rows would join the batch of another test's cleanup.
      await db
        .delete(imageDeletionTable)
        .where(inArray(imageDeletionTable.fileKey, keys));
    },
  );

  test.serial.each(["post", "patch"] as const)(
    "should not expose SQL when the upload enqueue fails on %s",
    async (operation) => {
      await db.execute(
        sql`alter table ${imageDeletionTable} add constraint reject_enqueue check (false) not valid`,
      );
      try {
        const error = await run(
          operation,
          `enqueue ${operation}`,
          file(filePath1),
        );
        expect(JSON.stringify(error?.value)).not.toContain("Failed query");
        expect(error).toMatchObject({ status: 500 });
      } finally {
        await db.execute(
          sql`alter table ${imageDeletionTable} drop constraint reject_enqueue`,
        );
      }
    },
  );

  test.serial.each(["throws", "returns success false"] as const)(
    "should keep and retry a key when remote deletion %s",
    async (failure) => {
      const key = `failing-${Bun.randomUUIDv7()}`;
      await db
        .insert(imageDeletionTable)
        .values({ fileKey: key, notBefore: sql`statement_timestamp()` });
      const succeed = uploads.deleteFiles.getMockImplementation();
      expectDefined(succeed);
      uploads.deleteFiles.mockImplementation(() =>
        failure === "throws"
          ? Promise.reject(new Error("UploadThing down"))
          : Promise.resolve({ success: false, deletedCount: 0 }),
      );
      try {
        await waitFor(async () => {
          await api.categories({ id: Bun.randomUUIDv7() }).delete();
          const [row] = await queuedImages([key]);
          expect(row?.attempts).toBeGreaterThan(0);
        });
      } finally {
        uploads.deleteFiles.mockImplementation(succeed);
      }
      await expectDequeued([key]);
    },
  );

  test.serial(
    "should delete the category and keep its keys queued when UploadThing is down",
    async () => {
      const category = await createTestCategory({ testDb });
      const image = await db.query.image.findFirst({
        where: { id: category.imageId },
      });
      expectDefined(image);
      const keys = [image.keyThumb, image.keyMedium, image.keyLarge];
      const succeed = uploads.deleteFiles.getMockImplementation();
      expectDefined(succeed);
      uploads.deleteFiles.mockImplementation(() =>
        Promise.reject(new Error("UploadThing down")),
      );
      const { status } = await api.categories({ id: category.id }).delete();
      expect(status).toBe(200);
      await waitFor(async () => {
        await api.categories({ id: Bun.randomUUIDv7() }).delete();
        const rows = await queuedImages(keys);
        expect(rows.map(({ fileKey }) => fileKey)).toEqual([...keys].sort());
        expect(rows.every(({ attempts }) => attempts > 0)).toBe(true);
      });
      expect(
        await db.query.category.findFirst({ where: { id: category.id } }),
      ).toBeUndefined();

      uploads.deleteFiles.mockImplementation(succeed);
      await expectDequeued(keys);
    },
  );

  test.serial(
    "should run one cleanup at a time and release the lock",
    async () => {
      const keys = Array.from(
        { length: 30 }, // three batches
        () => `locked-${Bun.randomUUIDv7()}`,
      );
      const succeed = uploads.deleteFiles.getMockImplementation();
      expectDefined(succeed);
      const gate = Promise.withResolvers<void>();
      let active = 0;
      let peak = 0;
      uploads.deleteFiles.mockImplementation(async (fileKeys) => {
        active += 1;
        peak = Math.max(peak, active);
        await gate.promise;
        active -= 1;
        return succeed(fileKeys);
      });
      try {
        await db.insert(imageDeletionTable).values(
          keys.map((fileKey) => ({
            fileKey,
            notBefore: sql`statement_timestamp()`,
          })),
        );
        await waitFor(async () => {
          await api.categories({ id: Bun.randomUUIDv7() }).delete();
          expect(active).toBe(1);
        });
        await Promise.all(
          Array.from({ length: 12 }, () =>
            api.categories({ id: Bun.randomUUIDv7() }).delete(),
          ),
        );
        await Bun.sleep(200); // lets a faulty second cleanup reach UploadThing
        expect(peak).toBe(1);
      } finally {
        gate.resolve();
        uploads.deleteFiles.mockImplementation(succeed);
      }
      await expectDequeued(keys);
    },
  );

  test.serial(
    "should dequeue keys when UploadThing deletes fewer files than requested",
    async () => {
      const keys = Array.from(
        { length: 2 },
        () => `partial-${Bun.randomUUIDv7()}`,
      );
      const succeed = uploads.deleteFiles.getMockImplementation();
      expectDefined(succeed);
      // A missing file is not counted: retrying it would never succeed.
      uploads.deleteFiles.mockImplementation(() =>
        Promise.resolve({ success: true, deletedCount: 1 }),
      );
      await db.insert(imageDeletionTable).values(
        keys.map((fileKey) => ({
          fileKey,
          notBefore: sql`statement_timestamp()`,
        })),
      );
      await expectDequeued(keys);
      uploads.deleteFiles.mockImplementation(succeed);
    },
  );
});
