import path from "node:path";

import { fromTypes, openapi } from "@elysia/openapi";
import { env } from "@spice-world/server/lib/env";
import { Elysia, t } from "elysia";

import { auth, betterAuthPlugin } from "./auth.plugin";

const projectRoot = path.join(import.meta.dir, "../..");
const { authCookies } = await auth.$context;

export const openApiConfig = openapi({
  references: fromTypes("src/index.ts", {
    projectRoot,
    tmpRoot: path.join(projectRoot, "node_modules/.cache/elysia-openapi"), // Deleted on every generation: must stay a dedicated directory.
  }),
  documentation: {
    components: {
      securitySchemes: {
        google: {
          type: "oauth2",
          flows: {
            implicit: {
              authorizationUrl: `${env.BETTER_AUTH_URL}/openapi/login`,
              scopes: {},
            },
          },
        },
        cookie: {
          type: "apiKey",
          in: "cookie",
          name: authCookies.sessionToken.name,
        },
      },
    },
  },
  scalar: { authentication: { preferredSecurityScheme: "google" } },
});

export const openApiLogin = new Elysia().use(betterAuthPlugin).get(
  "/openapi/login",
  {
    access: "optional",
    detail: { hide: true },
    query: t.Object({ state: t.String() }),
  },
  async ({ query, request: { headers }, redirect, set, user }) => {
    const state = encodeURIComponent(query.state);
    if (user) {
      return redirect(`/openapi#access_token=cookie&state=${state}`);
    }
    const { headers: authHeaders, response } = await auth.api.signInSocial({
      body: {
        provider: "google",
        callbackURL: `/openapi/login?state=${state}`,
        errorCallbackURL: "/openapi",
      },
      headers,
      returnHeaders: true,
    });
    set.headers["set-cookie"] = authHeaders.getSetCookie();
    return redirect(response.url as string);
  },
);
