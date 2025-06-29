import { component$, type PropsOf, Slot } from "@qwik.dev/core";
import { Modal as HeadlessModal } from "@qwik-ui/headless";
import { cn } from "@qwik-ui/utils";
import { LuX } from "@qwikest/icons/lucide";
import { cva, type VariantProps } from "class-variance-authority";
import { buttonVariants } from "./button";

const sheetVariants = cva("fixed z-50 gap-4 bg-background p-6 shadow-lg", {
	variants: {
		side: {
			top: "data-[state=closed]:slide-out-to-top data-[state=open]:slide-in-from-top inset-x-0 top-0 border-b",
			bottom:
				"data-[state=closed]:slide-out-to-bottom data-[state=open]:slide-in-from-bottom inset-x-0 bottom-0 border-t",
			left: "data-[state=closed]:slide-out-to-left data-[state=open]:slide-in-from-left inset-y-0 left-0 ml-0 h-full w-3/4 border-r sm:max-w-sm",
			right:
				"data-[state=closed]:slide-out-to-right data-[state=open]:slide-in-from-right inset-y-0 right-0 mr-0 h-full w-3/4 border-l sm:max-w-sm",
		},
	},
	defaultVariants: {
		side: "right",
	},
});

type SheetProps = PropsOf<typeof HeadlessModal.Panel> &
	VariantProps<typeof sheetVariants>;

export const Sheet = component$<SheetProps>(
	({ class: className, side, ...props }) => (
		<HeadlessModal.Panel
			class={cn(sheetVariants({ side }), className)}
			{...props}
		>
			<Slot />
			<HeadlessModal.Close class="absolute top-4 right-4 rounded-sm opacity-70 ring-offset-background transition-opacity hover:opacity-100 focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 disabled:pointer-events-none data-[state=open]:bg-secondary">
				<LuX class="h-4 w-4" />
				<span class="sr-only">Close</span>
			</HeadlessModal.Close>
		</HeadlessModal.Panel>
	),
);

export const SheetRoot = HeadlessModal.Root;

export const SheetTrigger = component$<PropsOf<typeof HeadlessModal.Trigger>>(
	({ class: className }) => (
		<HeadlessModal.Trigger
			class={cn(buttonVariants({ look: "ghost" }), "w-20", className)}
		>
			<Slot />
		</HeadlessModal.Trigger>
	),
);
