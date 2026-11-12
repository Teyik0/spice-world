import { treaty } from "@elysia/eden";
import type { App } from "./index";

/** Typed Eden client for apps that cannot share this package's Elysia version. */
export const createApiClient = (url: string) => treaty<App>(url);
