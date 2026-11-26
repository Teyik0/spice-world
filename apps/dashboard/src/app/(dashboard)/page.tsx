import { Button } from "@spice-world/ui/components/button";
import { defineRoute } from "@teyik0/furin";

export const route = defineRoute("/(dashboard)/")
  .config({ mode: "ssr" })
  .head(() => ({ meta: [{ title: "Spice World — Dashboard" }] }))
  .page(() => (
    <main className="mx-auto flex max-w-xl flex-col gap-6 p-10">
      <h1 className="text-5xl font-semibold text-balance">Spice World</h1>
      <p className="text-muted-foreground">
        Dashboard tokens:{" "}
        <span className="font-mono text-sm">12,50&nbsp;€</span>
      </p>
      <div className="flex gap-2">
        <Button>Save Product</Button>
        <Button variant="outline">Cancel</Button>
        <Button variant="destructive">Delete</Button>
      </div>
    </main>
  ));
