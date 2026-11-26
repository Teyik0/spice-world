import {
  dangerouslyDeleteByTag,
  invalidateByTag,
  waitUntil,
} from "@vercel/functions";
import { ElysiaStatus } from "elysia";

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

const TAGS_PER_CALL = 16; // the only documented cap (REST API); calls are rate limited, not tags
const ATTEMPTS = 3; // a rejected purge (429) leaves the cache unchanged: retry it

async function withRetry(
  call: () => Promise<void>,
  tags: string[],
  attempt = 1,
): Promise<void> {
  try {
    await call();
  } catch (error) {
    if (attempt >= ATTEMPTS) {
      console.error("CDN purge failed", tags, error);
      return;
    }
    await Bun.sleep(1000 * attempt);
    return withRetry(call, tags, attempt + 1);
  }
}

function run(call: (tags: string[]) => Promise<void>, tags: string[]) {
  for (let i = 0; i < tags.length; i += TAGS_PER_CALL) {
    const batch = tags.slice(i, i + TAGS_PER_CALL);
    waitUntil(withRetry(() => call(batch), batch));
  }
}

interface Purge {
  gone?: string[];
  stale?: string[];
}

/**
 * Call it after the transaction commits, or the CDN could refetch the old data first.
 * - `stale`: the content changed. The next request gets the old copy while it refreshes.
 * - `gone`: the URL may now be a 404 or another resource. Drop the copy, since the docs
 *   do not say a stale copy is dropped when its refresh is not cacheable.
 * No-op outside Vercel.
 */
export function purge({ stale = [], gone = [] }: Purge) {
  run(invalidateByTag, stale);
  run((tags) => dangerouslyDeleteByTag(tags), gone);
}

/** Purges once `result` is a success, then returns it. */
export function purgeOnSuccess<T>(result: T, tags: Purge) {
  if (!(result instanceof ElysiaStatus) || result.status < 300) {
    purge(tags);
  }
  return result;
}
