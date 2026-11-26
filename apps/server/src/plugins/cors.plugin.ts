import { cors } from "@elysia/cors";
import { origins } from "@spice-world/server/lib/env";

/** Shared CDN copies keep their CORS headers, so they must not depend on the request. */
export const corsPlugin = cors({
  origin: origins,
  methods: ["GET", "QUERY", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
  credentials: true,
  allowedHeaders: [
    "Content-Type",
    "Authorization",
    "X-Version",
    "X-Cache-Bypass",
  ],
  exposeHeaders: [], // the default mirrors the request header names into shared copies
});
