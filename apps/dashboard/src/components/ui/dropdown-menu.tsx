import { component$, type PropsOf, type QwikJSX, Slot } from "@qwik.dev/core";
import { Dropdown } from "@qwik-ui/headless";
import { cn } from "@qwik-ui/utils";

type DropdownMenuItemProps = PropsOf<typeof Dropdown.Item>;

export const DropdownMenuItem: typeof Dropdown.Item = component$(
	({ class: className, ...props }: DropdownMenuItemProps) => {
		return (
			<Dropdown.Item
				class={cn(
					"relative flex cursor-default select-none items-center gap-2 rounded-sm px-2 py-1.5 text-sm outline-none transition-colors focus:bg-accent focus:text-accent-foreground data-[disabled]:pointer-events-none data-[disabled]:opacity-50 [&>svg]:size-4 [&>svg]:shrink-0",
					className,
				)}
				{...props}
			>
				<Slot />
			</Dropdown.Item>
		);
	},
);

type DropdownMenuProps = PropsOf<typeof Dropdown.Root>;

export const DropdownMenu = (props: DropdownMenuProps) => {
	return (
		<Dropdown.Root dropdownItemComponent={DropdownMenuItem} {...props}>
			{props.children}
		</Dropdown.Root>
	);
};

type DropdownMenuLabelProps = QwikJSX.IntrinsicElements["div"] & {
	inset?: boolean;
};

export const DropdownMenuLabel = component$<DropdownMenuLabelProps>(
	({ inset, class: className, ...props }) => (
		<div
			class={cn(
				"px-2 py-1.5 font-semibold text-sm",
				inset && "pl-8",
				className,
			)}
			{...props}
		>
			<Slot />
		</div>
	),
);

type DropdownMenuPopoverProps = PropsOf<typeof Dropdown.Popover>;

export const DropdownMenuPopover: typeof Dropdown.Popover = component$(
	({ class: className, ...props }: DropdownMenuPopoverProps) => {
		return (
			<Dropdown.Popover
				class={cn(
					"data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95 data-[side=bottom]:slide-in-from-top-2 data-[side=left]:slide-in-from-right-2 data-[side=right]:slide-in-from-left-2 data-[side=top]:slide-in-from-bottom-2 z-50 min-w-[8rem] overflow-hidden rounded-md border bg-popover p-1 text-popover-foreground shadow-md data-[state=closed]:animate-out data-[state=open]:animate-in",
					className,
				)}
				{...props}
			>
				<Slot />
			</Dropdown.Popover>
		);
	},
);

type DropdownMenuSeparatorProps = QwikJSX.IntrinsicElements["div"];

export const DropdownMenuSeparator = component$<DropdownMenuSeparatorProps>(
	({ class: className, ...props }) => (
		<div class={cn("-mx-1 my-1 h-px bg-muted", className)} {...props} />
	),
);

type DropdownMenuShortcutProps = QwikJSX.IntrinsicElements["span"];

export const DropdownMenuShortcut = component$<DropdownMenuShortcutProps>(
	({ class: className, ...props }) => (
		<span
			class={cn("ml-auto text-xs tracking-widest opacity-60", className)}
			{...props}
		>
			<Slot />
		</span>
	),
);

type DropdownMenuTriggerProps = PropsOf<typeof Dropdown.Trigger>;

export const DropdownMenuTrigger = component$(
	(props: DropdownMenuTriggerProps) => {
		return (
			<Dropdown.Trigger {...props}>
				<Slot />
			</Dropdown.Trigger>
		);
	},
);
