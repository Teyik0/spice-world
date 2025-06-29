import { component$, type PropsOf, Slot } from "@qwik.dev/core";
import { Modal as HeadlessModal } from "@qwik-ui/headless";
import { cn } from "@qwik-ui/utils";
import { cva, type VariantProps } from "class-variance-authority";

const Root = HeadlessModal.Root;

const Trigger = HeadlessModal.Trigger;

const Close = HeadlessModal.Close;

export const panelVariants = cva(
	[
		"fixed w-full bg-background p-6 text-foreground transition-all backdrop:brightness-50 backdrop:backdrop-blur-sm",
		"data-[closing]:animate-out data-[open]:animate-in data-[closing]:duration-300 data-[open]:duration-300",
		"backdrop:data-[closing]:fade-out backdrop:data-[open]:fade-in backdrop:data-[closing]:animate-out backdrop:data-[open]:animate-in backdrop:data-[closing]:duration-300 backdrop:data-[open]:duration-300",
	],
	{
		variants: {
			position: {
				center:
					"data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95 data-[state=closed]:slide-out-to-left-1/2 data-[state=closed]:slide-out-to-top-[48%] data-[state=open]:slide-in-from-left-1/2 data-[state=open]:slide-in-from-top-[48%] fixed top-[50%] left-[50%] z-50 w-auto translate-x-[-50%] translate-y-[-50%] gap-4 border bg-background p-6 shadow-lg duration-200 data-[state=closed]:animate-out data-[state=open]:animate-in sm:rounded-lg",
				top: "data-[closing]:slide-out-to-top data-[open]:slide-in-from-top inset-x-0 top-0 mt-0 rounded-b-base border-b",
				bottom:
					"data-[closing]:slide-out-to-bottom data-[open]:slide-in-from-bottom inset-x-0 bottom-0 mb-0 rounded-t-base border-t",
				left: "data-[closing]:slide-out-to-left data-[open]:slide-in-from-left inset-y-0 left-0 ml-0 h-full max-w-sm rounded-r-base border-r",
				right:
					"data-[closing]:slide-out-to-right data-[open]:slide-in-from-right inset-y-0 right-0 mr-0 h-full max-w-sm rounded-l-base border-l",
			},
		},
		defaultVariants: {
			position: "center",
		},
	},
);

type PanelProps = PropsOf<typeof HeadlessModal.Panel> &
	VariantProps<typeof panelVariants>;

const Panel = component$<PanelProps>(({ position, ...props }) => {
	return (
		<HeadlessModal.Panel
			{...props}
			class={cn(panelVariants({ position }), props.class)}
		>
			<Slot />
		</HeadlessModal.Panel>
	);
});

const Title = component$<PropsOf<"h2">>(({ ...props }) => {
	return (
		<HeadlessModal.Title
			{...props}
			class={cn("font-semibold text-lg tracking-tight", props.class)}
		>
			<Slot />
		</HeadlessModal.Title>
	);
});

const Description = component$<PropsOf<"p">>(({ ...props }) => {
	return (
		<HeadlessModal.Description
			{...props}
			class={cn("text-muted-foreground text-sm", props.class)}
		>
			<Slot />
		</HeadlessModal.Description>
	);
});

export const Modal = {
	Root,
	Trigger,
	Close,
	Panel,
	Title,
	Description,
};
