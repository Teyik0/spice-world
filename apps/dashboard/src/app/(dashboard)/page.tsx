import { defineRoute } from "@teyik0/furin";

export const route = defineRoute("/(dashboard)/")
  .config({ mode: "ssr" })
  .head(() => ({ meta: [{ title: "Dashboard — Spice World" }] }))
  .page(({ user }) => (
    <header className="flex flex-col gap-1">
      <h1 className="text-2xl font-semibold tracking-tight text-balance">
        Welcome back, {user.name}
      </h1>
      <p className="text-muted-foreground text-sm text-pretty">
        Manage products, collections, customers and orders from the sidebar.
      </p>
    </header>
  ));
