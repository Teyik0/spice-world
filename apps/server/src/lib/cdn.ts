import { env } from "@spice-world/server/lib/env";
import { log } from "evlog";

/**
 * CDN cache tags. A list tag covers every listing and count of a resource. An entity tag
 * covers every response that embeds the entity:
 * - `product:<id>`: the product page.
 * - `category:<id>`: the category page, the pages of its attributes and the pages of its
 *   products, since all of them embed the category or its attributes and values.
 * - `attribute:<id>`: the attribute page.
 */
export const tag = {
  products: "products",
  categories: "categories",
  attributes: "attributes",
  product: (id: string) => `product:${id}`,
  category: (id: string) => `category:${id}`,
  attribute: (id: string) => `attribute:${id}`,
};

/** A request with this header always reaches the server, for read-your-writes (admin). */
export const BYPASS_HEADER = "x-cache-bypass";

const FRESH_SECONDS = 3600;
const STALE_SECONDS = 86_400;
export const CACHE_CONTROL = `public, s-maxage=${FRESH_SECONDS}, stale-while-revalidate=${STALE_SECONDS}`;
/** After this, no CDN copy can still be served: a file it references can be deleted. */
export const MAX_CDN_AGE_MINUTES = (FRESH_SECONDS + STALE_SECONDS) / 60;

const TAGS_PER_CALL = 16; // the documented cap of the REST API
const ATTEMPTS = 3; // a rejected purge (429) leaves the cache unchanged: retry it
const REPURGE_MS = 5000; // longer than a read that started before the commit
const TIMEOUT_MS = 5000; // the write already committed: a stalled API must not hold its response

const { VERCEL_PURGE_TOKEN, VERCEL_PROJECT_ID, VERCEL_TEAM_ID } = env;
const configured = VERCEL_PURGE_TOKEN && VERCEL_PROJECT_ID && VERCEL_TEAM_ID;
if (
  !configured &&
  (env.NODE_ENV === "production" || env.NODE_ENV === "preview")
) {
  // Without them every write would leave the CDN serving old data, silently.
  throw new Error(
    "VERCEL_PURGE_TOKEN, VERCEL_PROJECT_ID and VERCEL_TEAM_ID are required to purge the CDN",
  );
}

type Action = "invalidate-by-tags" | "dangerously-delete-by-tags";

/**
 * The REST API, since the `@vercel/functions` purge is a no-op in the container runtime
 * (tested in production: the cache stayed HIT after a write).
 */
async function send(
  action: Action,
  tags: string[],
  attempt = 1,
): Promise<void> {
  const response = await fetch(
    `https://api.vercel.com/v1/edge-cache/${action}?projectIdOrName=${VERCEL_PROJECT_ID}&teamId=${VERCEL_TEAM_ID}`,
    {
      method: "POST",
      headers: {
        authorization: `Bearer ${VERCEL_PURGE_TOKEN}`,
        "content-type": "application/json",
      },
      // A preview write must not purge production copies, and the other way round.
      body: JSON.stringify({
        tags,
        target: env.NODE_ENV === "preview" ? "preview" : "production",
      }),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    },
  ).catch((error: unknown) => error);
  if (response instanceof Response && response.ok) {
    return;
  }
  if (attempt < ATTEMPTS) {
    await Bun.sleep(1000 * attempt);
    return send(action, tags, attempt + 1);
  }
  log.error({
    action: "cdn_purge",
    purge: action,
    tags,
    error:
      response instanceof Response
        ? `${response.status} ${await response.text().catch(() => "")}`
        : String(response),
  });
}

const sendAll = (action: Action, tags: string[]) => {
  const batches: Promise<void>[] = [];
  for (let i = 0; i < tags.length; i += TAGS_PER_CALL) {
    batches.push(send(action, tags.slice(i, i + TAGS_PER_CALL)));
  }
  return Promise.all(batches);
};

interface Purge {
  gone?: string[];
  stale?: string[];
}

/**
 * Call it after the transaction commits, or the CDN could refetch the old data first.
 * - `stale`: the content changed. The next request gets the old copy while it refreshes.
 * - `gone`: the URL may now be a 404 or another resource. Drop the copy, since the docs
 *   do not say a stale copy is dropped when its refresh is not cacheable.
 * Awaited, so the response leaves after the purge. No-op without the Vercel settings.
 */
export async function purge({ stale = [], gone = [] }: Purge) {
  if (!configured || stale.length + gone.length === 0) {
    return;
  }
  const once = () =>
    Promise.all([
      sendAll("invalidate-by-tags", stale),
      sendAll("dangerously-delete-by-tags", gone),
    ]);
  await once();
  // A read that started before the commit can store old data after the first purge.
  setTimeout(once, REPURGE_MS);
}

/** Purges once `result` is a success, then returns it. */
export async function purgeOnSuccess<T>(result: T, tags: Purge) {
  if (!(result instanceof Error)) {
    await purge(tags);
  }
  return result;
}
