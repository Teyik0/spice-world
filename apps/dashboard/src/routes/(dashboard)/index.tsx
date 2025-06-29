import { component$ } from "@qwik.dev/core";
import type { DocumentHead } from "@qwik.dev/router";

export default component$(() => {
	return (
		<div class="flex flex-1 flex-col gap-4 p-4 pt-0">
			<div class="grid auto-rows-min gap-4 md:grid-cols-3">
				<div class="aspect-video rounded-xl bg-muted/50" />
				<div class="aspect-video rounded-xl bg-muted/50" />
				<div class="aspect-video rounded-xl bg-muted/50" />
			</div>
			<div class="min-h-[100vh] flex-1 rounded-xl bg-muted/50 md:min-h-min" />
		</div>
	);
});

export const head: DocumentHead = {
	title: "Spice World",
	meta: [
		{
			name: "description",
			content: "Spice World - dashboard",
		},
	],
};
