import { component$, Slot } from "@qwik.dev/core";
import { Link } from "@qwik.dev/router";
import { cn } from "@qwik-ui/utils";
import { buttonVariants } from "@/components/ui/button";

export default component$(() => {
	return (
		<main class="flex min-h-screen flex-col items-center justify-center">
			<div class="flex">
				<div class="translate-x-5.5">
					<Slot />
				</div>
				<div class="flex flex-col align-items-center">
					<Link
						class={cn(
							buttonVariants({ look: "outline" }),
							"translate-y-5.5 rotate-90 rounded-b-none rounded-tl-lg rounded-tr-none",
						)}
						href="/signin"
					>
						Sign In
					</Link>
					<Link
						class={cn(
							buttonVariants({ look: "outline" }),
							"translate-y-15.5 rotate-90 rounded-b-none rounded-tl-none rounded-tr-lg",
						)}
						href="/signup"
					>
						Sign Up
					</Link>
				</div>
			</div>
		</main>
	);
});
