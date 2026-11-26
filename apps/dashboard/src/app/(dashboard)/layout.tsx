import { defineRoute } from "@teyik0/furin";

import { authClient } from "../../lib/api";

export const route = defineRoute("/(dashboard)")
  .config({ mode: "ssr" })
  .loader(async ({ request, redirect }) => {
    const { data: session } = await authClient.getSession({
      fetchOptions: {
        headers: { cookie: request.headers.get("cookie") ?? "" },
      },
    });
    if (session?.user.role !== "admin") {
      throw redirect("/signin");
    }
    return { user: session.user };
  })
  .layout(({ children }) => children);
