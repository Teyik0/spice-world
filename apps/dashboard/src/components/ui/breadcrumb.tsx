import { component$, type PropsOf, Slot } from "@qwik.dev/core";
import { cn } from "@qwik-ui/utils";
import { LuChevronRight } from "@qwikest/icons/lucide";

export type BreadcrumbProps = PropsOf<"nav">;
const Root = component$<BreadcrumbProps>(() => {
	return (
		<nav aria-label="breadcrumb">
			<Slot />
		</nav>
	);
});

const List = component$<PropsOf<"ol">>((props) => {
	return (
		<ol
			{...props}
			class={cn(
				"flex flex-wrap items-center gap-1.5 break-words text-sm sm:gap-2.5",
				props.class,
			)}
		>
			<Slot />
		</ol>
	);
});

const Item = component$<PropsOf<"li">>((props) => {
	return (
		<li {...props} class={cn("inline-flex items-center gap-1.5", props.class)}>
			<Slot />
		</li>
	);
});

const Link = component$<PropsOf<"a"> & { asChild?: boolean }>((props) => {
	const Comp = props.asChild ? Slot : "a";
	return (
		<Comp
			{...props}
			class={cn(
				"text-muted-foreground transition-colors hover:text-foreground",
				props.class,
			)}
		>
			{!props.asChild && <Slot />}
		</Comp>
	);
});

const Separator = component$<PropsOf<"li">>((props) => {
	return (
		<li aria-hidden="true" role="presentation" {...props}>
			<LuChevronRight class="size-3.5 stroke-2 stroke-muted-foreground" />
		</li>
	);
});

const Page = component$<PropsOf<"span">>((props) => {
	return (
		<span
			aria-current="page"
			{...props}
			class={cn("font-normal text-foreground", props.class)}
		>
			<Slot />
		</span>
	);
});

export const Breadcrumb = { Root, List, Item, Link, Separator, Page };
