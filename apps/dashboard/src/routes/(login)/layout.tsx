import { buttonVariants } from "@/components/ui/button";
import { Slot, component$ } from "@qwik.dev/core";
import { Link } from "@qwik.dev/router";
import { cn } from "@qwik-ui/utils";

export default component$(() => {
  return (
    <main class="flex flex-col items-center justify-center min-h-screen">
      <div class="flex">
        <div class="translate-x-5.5">
          <Slot />
        </div>
        <div class="flex flex-col align-items-center">
          <Link
            href="/signin"
            class={cn(
              buttonVariants({ look: "outline" }),
              "rounded-tl-lg rounded-tr-none rounded-b-none rotate-90 translate-y-5.5",
            )}
          >
            Sign In
          </Link>
          <Link
            href="/signup"
            class={cn(
              buttonVariants({ look: "outline" }),
              "rounded-tr-lg rounded-tl-none rounded-b-none rotate-90 translate-y-15.5",
            )}
          >
            Sign Up
          </Link>
        </div>
      </div>
    </main>
  );
});
