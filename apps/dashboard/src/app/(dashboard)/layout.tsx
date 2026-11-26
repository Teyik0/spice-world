import { authClient } from "@spice-world/dashboard/lib/api";
import { defineRoute } from "@teyik0/furin";

// UX only: the API guards every admin endpoint itself (access: "admin").
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
