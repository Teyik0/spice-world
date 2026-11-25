import { asc, DrizzleQueryError, inArray, lte, or, sql } from "drizzle-orm";
import { Elysia } from "elysia";

import { imageDeletionTable, imageTable } from "../../drizzle/schema";
import { db } from "../lib/db";
import { utapi } from "../lib/images";
import { loggerPlugin } from "./logger.plugin";

async function deleteFiles(keys: string[]) {
  try {
    // Queued keys are never referenced by a committed "Image": a missing file is already the goal.
    return (await utapi.deleteFiles(keys)).success;
  } catch {
    return false;
  }
}

export const imageCleanupPlugin = new Elysia({
  name: "image-cleanup",
})
  .use(loggerPlugin)
  .decorate("imageCleanupLock", { running: false })
  .macro({
    imageCleanup: {
      async afterResponse({ log, imageCleanupLock }) {
        if (imageCleanupLock.running) {
          return;
        }
        imageCleanupLock.running = true;
        try {
          await db.transaction(
            async (tx) => {
              const tasks = await tx
                .select()
                .from(imageDeletionTable)
                .where(
                  lte(imageDeletionTable.notBefore, sql`statement_timestamp()`),
                )
                .orderBy(
                  asc(imageDeletionTable.attempts),
                  asc(imageDeletionTable.notBefore),
                  asc(imageDeletionTable.fileKey),
                )
                .limit(10)
                .for("update", { skipLocked: true });

              if (tasks.length === 0) {
                return;
              }

              const keys = tasks.map(({ fileKey }) => fileKey);
              const references = await tx
                .select({
                  keyThumb: imageTable.keyThumb,
                  keyMedium: imageTable.keyMedium,
                  keyLarge: imageTable.keyLarge,
                })
                .from(imageTable)
                .where(
                  or(
                    inArray(imageTable.keyThumb, keys),
                    inArray(imageTable.keyMedium, keys),
                    inArray(imageTable.keyLarge, keys),
                  ),
                );
              const referenced = new Set(
                references.flatMap((image) => [
                  image.keyThumb,
                  image.keyMedium,
                  image.keyLarge,
                ]),
              );
              const deletable = keys.filter((key) => !referenced.has(key));
              const deleted =
                deletable.length === 0 || (await deleteFiles(deletable));
              const done = keys.filter((key) => referenced.has(key) || deleted);
              if (done.length > 0) {
                await tx
                  .delete(imageDeletionTable)
                  .where(inArray(imageDeletionTable.fileKey, done));
              }
              if (!deleted) {
                await tx
                  .update(imageDeletionTable)
                  .set({ attempts: sql`${imageDeletionTable.attempts} + 1` })
                  .where(inArray(imageDeletionTable.fileKey, deletable));
              }
            },
            { isolationLevel: "read committed" },
          );
        } catch (error) {
          // DrizzleQueryError's own message contains the SQL and its params
          const cause =
            error instanceof DrizzleQueryError ? error.cause : error;
          log.error(cause instanceof Error ? cause : String(cause), {
            action: "image-cleanup",
          });
        } finally {
          imageCleanupLock.running = false;
        }
      },
    },
  });
