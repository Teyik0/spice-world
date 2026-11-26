import { AsyncLocalStorage } from "node:async_hooks";

/**
 * Vercel REST API (third party) stand-in: `lib/cdn.ts` purges through it. Records the
 * purges made while `recordPurges` runs, isolated per call for concurrent tests.
 */
const purges = new AsyncLocalStorage<{ stale: string[]; gone: string[] }>();
const EDGE_CACHE = "https://api.vercel.com/v1/edge-cache/";

Bun.env.VERCEL_PURGE_TOKEN = "test-token";
Bun.env.VERCEL_PROJECT_ID = "prj_test";
Bun.env.VERCEL_TEAM_ID = "team_test";

const realFetch = globalThis.fetch;
globalThis.fetch = Object.assign(
  (input: Parameters<typeof fetch>[0], init?: RequestInit) => {
    const url = input instanceof Request ? input.url : String(input);
    if (!url.startsWith(EDGE_CACHE)) {
      return realFetch(input, init);
    }
    // Rejects what the real API would reject, so a malformed call fails the tests.
    const { searchParams } = new URL(url);
    const auth = new Headers(init?.headers).get("authorization");
    const { tags, target } = JSON.parse(String(init?.body)) as {
      tags: string[];
      target: string;
    };
    if (
      init?.method !== "POST" ||
      auth !== `Bearer ${Bun.env.VERCEL_PURGE_TOKEN}` ||
      searchParams.get("projectIdOrName") !== Bun.env.VERCEL_PROJECT_ID ||
      searchParams.get("teamId") !== Bun.env.VERCEL_TEAM_ID ||
      !["production", "preview"].includes(target) ||
      tags.length === 0 ||
      tags.length > 16
    ) {
      return Promise.resolve(new Response(null, { status: 400 }));
    }
    const store = purges.getStore();
    if (store) {
      (url.includes("dangerously-delete") ? store.gone : store.stale).push(
        ...tags,
      );
    }
    return Promise.resolve(new Response(null, { status: 200 }));
  },
  realFetch,
);

export const recordPurges = async <T>(call: () => Promise<T>) => {
  const store = { stale: [] as string[], gone: [] as string[] };
  const result = await purges.run(store, call);
  return {
    result,
    stale: store.stale.toSorted(),
    gone: store.gone.toSorted(),
    /** Every purge so far, including the delayed repeat. */
    all: () => ({ stale: store.stale.toSorted(), gone: store.gone.toSorted() }),
  };
};
