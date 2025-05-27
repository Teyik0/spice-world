import { treaty } from "@elysiajs/eden";
import type { App } from "@spice-world/server";

export const app = treaty<App>(
  import.meta.env.PUBLIC_BETTER_AUTH_URL as string,
);
