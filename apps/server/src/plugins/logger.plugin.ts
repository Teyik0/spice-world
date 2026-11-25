import "@spice-world/server/lib/evlog";
import { AsyncLocalStorage } from "node:async_hooks";
import { getCurrentSpan } from "@elysia/opentelemetry";
import { env } from "@spice-world/server/lib/env";
import { DrizzleQueryError } from "drizzle-orm";
import { Elysia } from "elysia";
import { createMiddlewareLogger } from "evlog/toolkit";

const createLog = ({ method, url }: Request) =>
  createMiddlewareLogger({
    method,
    path: new URL(url).pathname,
    requestId: crypto.randomUUID(),
  });

const storage = new AsyncLocalStorage<ReturnType<typeof createLog>>();

export const loggerPlugin = new Elysia({ name: "logger" })
  .wrap(
    (fetch) =>
      (request, ...rest) =>
        storage.run(createLog(request), () => fetch(request, ...rest)),
  )
  .derive("global", ({ request }) => {
    const { logger: log } = storage.getStore() ?? createLog(request);
    log.set({ traceId: getCurrentSpan()?.spanContext().traceId });
    return { log };
  })
  .onError("global", ({ error }) => {
    // DrizzleQueryError's own message contains the SQL and its params
    const cause = error instanceof DrizzleQueryError ? error.cause : error;
    storage
      .getStore()
      ?.logger.error(cause instanceof Error ? cause : String(cause));
  })
  .onAfterResponse("global", ({ body, defer, responseValue, set }) => {
    const { status } = responseValue instanceof Response ? responseValue : set;
    const code = Number(status ?? 200);
    const log = storage.getStore();

    if (code >= 400 || env.NODE_ENV === "development") {
      log?.logger.set({ body });
    }
    if (code >= 400) {
      log?.logger.setLevel(code >= 500 ? "error" : "warn");
    }
    // Deferred so that route afterResponse hooks can still write to the log
    defer(async () => {
      await log?.finish({ status: code });
    });
  });
