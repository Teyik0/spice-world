import { treaty } from "@elysia/eden";
import type { App } from "@spice-world/server/index";
import type { auth } from "@spice-world/server/plugins/auth.plugin";
import { createIsomorphicFn } from "@teyik0/furin";
import { createAuthClient } from "better-auth/client";
import { adminClient, inferAdditionalFields } from "better-auth/client/plugins";

import { env } from "./env";

// x-cache-bypass: the admin must read its own writes, never a CDN copy.
// Server: no cookie jar, so loaders pass the incoming headers to stay authenticated.
// Browser: same-origin /api relay (server.ts) sends the session cookie itself.
export const api = createIsomorphicFn()
  .server((headers?: Headers) =>
    treaty<App>(env.API_URL, {
      headers: { cookie: headers?.get("cookie") ?? "", "x-cache-bypass": "1" },
    }),
  )
  .client(() =>
    treaty<App>(`${window.location.origin}/api`, {
      headers: { "x-cache-bypass": "1" },
    }),
  );

const plugins = [adminClient(), inferAdditionalFields<typeof auth>()];

// Browser: no baseURL, so /api/auth/* goes through the same-origin relay.
export const authClient = createIsomorphicFn()
  .server(() => createAuthClient({ baseURL: env.API_URL, plugins }))
  .client(() => createAuthClient({ plugins }))();
