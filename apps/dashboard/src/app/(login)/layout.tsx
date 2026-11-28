import { defineRoute } from "@teyik0/furin";

export const route = defineRoute("/(login)")
  .config({ mode: "ssg" })
  .layout(({ children }) => (
    <main className="grid min-h-svh lg:grid-cols-[1fr_minmax(28rem,40%)]">
      <aside
        aria-hidden="true"
        className="relative hidden flex-col justify-between overflow-hidden bg-stone-900 p-12 text-white lg:flex"
      >
        <picture className="absolute inset-0">
          <source srcSet="/public/spices.avif" type="image/avif" />
          <img
            alt=""
            className="size-full object-cover object-top-right"
            height={1024}
            src="/public/spices.webp"
            width={1024}
          />
        </picture>
        <div className="absolute inset-0 bg-linear-to-t from-black/70 via-black/10 to-black/40" />
        <p className="relative font-mono text-xs tracking-[0.3em] uppercase opacity-70">
          Back Office
        </p>
        <p className="relative text-7xl font-semibold tracking-tighter text-balance">
          Spice World
        </p>
      </aside>
      <div className="flex items-center justify-center px-6 py-12">
        <div className="flex w-full max-w-sm flex-col gap-8">{children}</div>
      </div>
    </main>
  ));
