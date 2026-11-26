import { treaty } from "@elysia/eden";
import type { App } from "@spice-world/server/index";
import { cookies } from "next/headers";

import { env } from "./utils";

// Server twin of lib/elysia, for RSC-only call sites: a server fetch has no
// cookie jar (credentials: "include" is browser-only), so forward the browser
// cookies to hit the API authenticated. Import this module ONLY from server
// components/actions — it is not client-safe (next/headers).
export const app = treaty<App>(env.API_URL, {
  fetch: {
    credentials: "include",
    cache: "no-store",
  },
  headers: async () => ({ cookie: (await cookies()).toString() }),
});
