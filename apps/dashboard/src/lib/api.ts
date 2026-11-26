import { treaty } from "@elysia/eden";
import type { App } from "@spice-world/server/index";
import type { auth } from "@spice-world/server/plugins/auth.plugin";
import { createIsomorphicFn } from "@teyik0/furin";
import { furinSync } from "@teyik0/furin/client";
import { createAuthClient } from "better-auth/client";
import { adminClient, inferAdditionalFields } from "better-auth/client/plugins";

import { env } from "./env";

// The admin must read its own writes, never a CDN copy.
const headers = { "x-cache-bypass": "1" };

export const api = createIsomorphicFn()
  .server(() => treaty<App>(env.API_URL, { headers }).use(furinSync))
  .client(() =>
    treaty<App>(`${window.location.origin}/api`, { headers }).use(furinSync),
  )();

const plugins = [adminClient(), inferAdditionalFields<typeof auth>()];

// Browser: no baseURL, so /api/auth/* goes through the same-origin relay.
export const authClient = createIsomorphicFn()
  .server(() => createAuthClient({ baseURL: env.API_URL, plugins }))
  .client(() => createAuthClient({ plugins }))();
