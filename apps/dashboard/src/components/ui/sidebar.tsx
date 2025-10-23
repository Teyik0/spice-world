import {
	$,
	type CSSProperties,
	component$,
	createContextId,
	type PropsOf,
	type QRL,
	type QwikJSX,
	type Signal,
	Slot,
	useComputed$,
	useContext,
	useContextProvider,
	useSignal,
	useVisibleTask$,
} from "@qwik.dev/core";
import { Separator, Tooltip } from "@qwik-ui/headless";
import { cn } from "@qwik-ui/utils";
import { LuPanelLeft } from "@qwikest/icons/lucide";
import { cva, type VariantProps } from "class-variance-authority";
import { useIsMobile } from "../../hooks/use-mobile";
import { Button } from "./button";
import { Input } from "./input";
import { Sheet, SheetRoot } from "./sheet";
import { Skeleton } from "./skeleton";

const SIDEBAR_COOKIE_NAME = "sidebar:state";
const SIDEBAR_COOKIE_MAX_AGE = 60 * 60 * 24 * 7;
export const SIDEBAR_WIDTH = "16rem";
const SIDEBAR_WIDTH_MOBILE = "18rem";
export const SIDEBAR_WIDTH_ICON = "3rem";
const SIDEBAR_KEYBOARD_SHORTCUT = "b";

interface SidebarContextProps {
	state: Signal<"expanded" | "collapsed">;
	open: Signal<boolean>;
	isMobile: Signal<boolean>;
	toggleSidebar$: QRL<() => boolean>;
}

const sidebarContext = createContextId<SidebarContextProps>("sidebar-context");

export function useSidebar() {
	const context = useContext(sidebarContext);
	if (!context) {
		throw new Error("useSidebar must be used within a SidebarProvider.");
	}

	return context;
}

export function useSidebarProvider({ defaultOpen = true }) {
	const isMobile = useIsMobile();

	// This is the internal state of the sidebar.
	// We use openProp and setOpenProp for control from outside the component.
	const open = useSignal(defaultOpen);

	// eslint-disable-next-line qwik/no-use-visible-task
	useVisibleTask$(({ track }) => {
		track(() => open.value);
		// This sets the cookie to keep the sidebar state.
		// biome-ignore lint/suspicious/noDocumentCookie: intentional cookie usage
		document.cookie = `${SIDEBAR_COOKIE_NAME}=${open.value}; path=/; max-age=${SIDEBAR_COOKIE_MAX_AGE}`;
	});

	// Helper to toggle the sidebar.
	const toggleSidebar$ = $(() => {
		open.value = !open.value;
		return open.value;
	});

	// Adds a keyboard shortcut to toggle the sidebar.
	// eslint-disable-next-line qwik/no-use-visible-task
	useVisibleTask$(({ cleanup }) => {
		const handleKeyDown = (event: KeyboardEvent) => {
			if (
				event.key === SIDEBAR_KEYBOARD_SHORTCUT &&
				(event.metaKey || event.ctrlKey)
			) {
				event.preventDefault();
				toggleSidebar$();
			}
		};

		window.addEventListener("keydown", handleKeyDown);
		cleanup(() => window.removeEventListener("keydown", handleKeyDown));
	});

	// We add a state so that we can do data-state="expanded" or "collapsed".
	// This makes it easier to style the sidebar with Tailwind classes.
	const state = useComputed$(() => (open.value ? "expanded" : "collapsed"));

	const contextValue = {
		state,
		open,
		isMobile,
		toggleSidebar$,
	};

	useContextProvider(sidebarContext, contextValue);
}

type SidebarProps = QwikJSX.IntrinsicElements["div"] & {
	side?: "left" | "right";
	variant?: "sidebar" | "floating" | "inset";
	collapsible?: "offcanvas" | "icon" | "none";
};

export const Sidebar = component$<SidebarProps>(
	({
		side = "left",
		variant = "sidebar",
		collapsible = "offcanvas",
		class: className,
		...props
	}) => {
		const { isMobile, state, open } = useSidebar();

		if (collapsible === "none") {
			return (
				<div
					class={cn(
						"flex h-full w-(--sidebar-width) flex-col bg-sidebar text-sidebar-foreground",
						className,
					)}
					{...props}
				>
					<Slot />
				</div>
			);
		}

		if (isMobile.value) {
			return (
				<SheetRoot bind:show={open}>
					<Sheet
						class="w-var(--sidebar-width) bg-sidebar p-0 text-sidebar-foreground [&>button]:hidden"
						data-mobile="true"
						data-sidebar="sidebar"
						side="left"
						style={
							{
								"--sidebar-width": SIDEBAR_WIDTH_MOBILE,
							} as unknown as CSSProperties
						}
					>
						<div class="flex h-full w-full flex-col">
							<Slot />
						</div>
					</Sheet>
				</SheetRoot>
			);
		}

		return (
			<div
				class="group peer hidden text-sidebar-foreground md:block"
				data-collapsible={state.value === "collapsed" ? collapsible : ""}
				data-side={side}
				data-state={state.value}
				data-variant={variant}
			>
				{/* This is what handles the sidebar gap on desktop */}
				<div
					class={cn(
						"relative w-(--sidebar-width) bg-transparent transition-[width] duration-200 ease-linear",
						"group-data-[collapsible=offcanvas]:w-0",
						"group-data-[side=right]:rotate-180",
						variant === "floating" || variant === "inset"
							? "group-data-[collapsible=icon]:w-[calc(var(--sidebar-width-icon)+(--spacing(4)))]"
							: "group-data-[collapsible=icon]:w-(--sidebar-width-icon)",
					)}
					data-slot="sidebar-gap"
				/>
				<div
					class={cn(
						"fixed inset-y-0 z-10 hidden h-svh w-(--sidebar-width) transition-[left,right,width] duration-200 ease-linear md:flex",
						side === "left"
							? "left-0 group-data-[collapsible=offcanvas]:left-[calc(var(--sidebar-width)*-1)]"
							: "right-0 group-data-[collapsible=offcanvas]:right-[calc(var(--sidebar-width)*-1)]",
						// Adjust the padding for floating and inset variants.
						variant === "floating" || variant === "inset"
							? "p-2 group-data-[collapsible=icon]:w-[calc(var(--sidebar-width-icon)+(--spacing(4))+2px)]"
							: "group-data-[collapsible=icon]:w-(--sidebar-width-icon) group-data-[side=left]:border-r group-data-[side=right]:border-l",
						className,
					)}
					data-slot="sidebar-container"
					{...props}
				>
					<div
						class="flex h-full w-full flex-col bg-sidebar group-data-[variant=floating]:rounded-lg group-data-[variant=floating]:border group-data-[variant=floating]:border-sidebar-border group-data-[variant=floating]:shadow-sm"
						data-sidebar="sidebar"
						data-slot="sidebar-inner"
					>
						<Slot />
					</div>
				</div>
			</div>
		);
	},
);

type SidebarTriggerProps = QwikJSX.IntrinsicElements["button"];

export const SidebarTrigger = component$<SidebarTriggerProps>(
	({ class: className, ...props }) => {
		const { toggleSidebar$ } = useSidebar();

		return (
			<Button
				class={cn("size-7", className)}
				data-sidebar="trigger"
				look="ghost"
				onClick$={() => {
					toggleSidebar$();
				}}
				size="icon"
				{...props}
			>
				<LuPanelLeft />
				<span class="sr-only">Toggle Sidebar</span>
			</Button>
		);
	},
);

type SidebarRailProps = QwikJSX.IntrinsicElements["button"];

export const SidebarRail = component$<SidebarRailProps>(
	({ class: className, ...props }) => {
		const { toggleSidebar$ } = useSidebar();

		return (
			<button
				aria-label="Toggle Sidebar"
				class={cn(
					"-translate-x-1/2 group-data-[side=left]:-right-4 absolute inset-y-0 z-20 hidden w-4 transition-all ease-linear after:absolute after:inset-y-0 after:left-1/2 after:w-[2px] hover:after:bg-sidebar-border group-data-[side=right]:left-0 sm:flex",
					"in-data-[side=left]:cursor-w-resize in-data-[side=right]:cursor-e-resize",
					"[[data-side=left][data-state=collapsed]_&]:cursor-e-resize [[data-side=right][data-state=collapsed]_&]:cursor-w-resize",
					"group-data-[collapsible=offcanvas]:translate-x-0 hover:group-data-[collapsible=offcanvas]:bg-sidebar group-data-[collapsible=offcanvas]:after:left-full",
					"[[data-side=left][data-collapsible=offcanvas]_&]:-right-2",
					"[[data-side=right][data-collapsible=offcanvas]_&]:-left-2",
					className,
				)}
				data-sidebar="rail"
				onClick$={toggleSidebar$}
				tabIndex={-1}
				title="Toggle Sidebar"
				{...props}
			/>
		);
	},
);

type SidebarInsetProps = QwikJSX.IntrinsicElements["main"];

export const SidebarInset = component$<SidebarInsetProps>(
	({ class: className, ...props }) => {
		return (
			<main
				class={cn(
					"relative flex w-full flex-1 flex-col bg-background",
					"md:peer-data-[variant=inset]:peer-data-[state=collapsed]:ml-2 md:peer-data-[variant=inset]:m-2 md:peer-data-[variant=inset]:ml-0 md:peer-data-[variant=inset]:rounded-xl md:peer-data-[variant=inset]:shadow-sm",
					className,
				)}
				{...props}
			>
				<Slot />
			</main>
		);
	},
);

type SidebarInputProps = QwikJSX.IntrinsicElements["input"];

export const SidebarInput = component$<SidebarInputProps>(
	({ class: className, ...props }) => {
		return (
			<Input
				class={cn(
					"h-8 w-full bg-background shadow-none focus-visible:ring-2 focus-visible:ring-sidebar-ring",
					className,
				)}
				data-sidebar="input"
				{...props}
			/>
		);
	},
);

type SidebarHeaderProps = QwikJSX.IntrinsicElements["div"];

export const SidebarHeader = component$<SidebarHeaderProps>(
	({ class: className, ...props }) => {
		return (
			<div
				class={cn("flex flex-col gap-2 p-2", className)}
				data-sidebar="header"
				{...props}
			>
				<Slot />
			</div>
		);
	},
);

type SidebarFooterProps = QwikJSX.IntrinsicElements["div"];

export const SidebarFooter = component$<SidebarFooterProps>(
	({ class: className, ...props }) => {
		return (
			<div
				class={cn("flex flex-col gap-2 p-2", className)}
				data-sidebar="footer"
				{...props}
			>
				<Slot />
			</div>
		);
	},
);

type SidebarSeparatorProps = QwikJSX.IntrinsicElements["div"];

export const SidebarSeparator = component$<SidebarSeparatorProps>(
	({ class: className, ...props }) => (
		<Separator
			class={cn("mx-2 w-auto bg-sidebar-border", className)}
			data-sidebar="separator"
			{...props}
		/>
	),
);

type SidebarContentProps = QwikJSX.IntrinsicElements["div"];

export const SidebarContent = component$<SidebarContentProps>(
	({ class: className, ...props }) => {
		return (
			<div
				class={cn(
					"flex min-h-0 flex-1 flex-col gap-2 overflow-auto group-data-[collapsible=icon]:overflow-hidden",
					className,
				)}
				data-sidebar="content"
				{...props}
			>
				<Slot />
			</div>
		);
	},
);

type SidebarGroupProps = QwikJSX.IntrinsicElements["div"];

export const SidebarGroup = component$<SidebarGroupProps>(
	({ class: className, ...props }) => {
		return (
			<div
				class={cn("relative flex w-full min-w-0 flex-col p-2", className)}
				data-sidebar="group"
				{...props}
			>
				<Slot />
			</div>
		);
	},
);

type SidebarGroupLabelProps = QwikJSX.IntrinsicElements["div"];

export const SidebarGroupLabel = component$<SidebarGroupLabelProps>(
	({ class: className, ...props }) => {
		return (
			<div
				class={cn(
					"flex h-8 shrink-0 items-center rounded-md px-2 font-medium text-sidebar-foreground/70 text-xs outline-none ring-sidebar-ring transition-[margin,opacity] duration-200 ease-linear focus-visible:ring-2 [&>svg]:size-4 [&>svg]:shrink-0",
					"group-data-[collapsible=icon]:-mt-8 group-data-[collapsible=icon]:opacity-0",
					className,
				)}
				data-sidebar="group-label"
				{...props}
			>
				<Slot />
			</div>
		);
	},
);

type SidebarGroupActionProps = QwikJSX.IntrinsicElements["button"];

export const SidebarGroupAction = component$<SidebarGroupActionProps>(
	({ class: className, ...props }) => {
		return (
			<button
				class={cn(
					"absolute top-3.5 right-3 flex aspect-square w-5 items-center justify-center rounded-md p-0 text-sidebar-foreground outline-none ring-sidebar-ring transition-transform hover:bg-sidebar-accent hover:text-sidebar-accent-foreground focus-visible:ring-2 [&>svg]:size-4 [&>svg]:shrink-0",
					// Increases the hit area of the button on mobile.
					"after:-inset-2 after:absolute after:md:hidden",
					"group-data-[collapsible=icon]:hidden",
					className,
				)}
				data-sidebar="group-action"
				{...props}
			>
				<Slot />
			</button>
		);
	},
);

type SidebarGroupContentProps = QwikJSX.IntrinsicElements["div"];

export const SidebarGroupContent = component$<SidebarGroupContentProps>(
	({ class: className, ...props }) => {
		return (
			<div
				class={cn("w-full text-sm", className)}
				data-sidebar="group-content"
				{...props}
			>
				<Slot />
			</div>
		);
	},
);

type SidebarMenuProps = QwikJSX.IntrinsicElements["ul"];

export const SidebarMenu = component$<SidebarMenuProps>(
	({ class: className, ...props }) => {
		return (
			<ul
				class={cn("flex w-full min-w-0 flex-col gap-1", className)}
				data-sidebar="menu"
				{...props}
			>
				<Slot />
			</ul>
		);
	},
);

type SidebarMenuItemProps = QwikJSX.IntrinsicElements["li"];

export const SidebarMenuItem = component$<SidebarMenuItemProps>(
	({ class: className, ...props }) => {
		return (
			<li
				class={cn("group/menu-item relative", className)}
				data-sidebar="menu-item"
				{...props}
			>
				<Slot />
			</li>
		);
	},
);

export const sidebarMenuButtonVariants = cva(
	"peer/menu-button group-data-[collapsible=icon]:!size-8 group-data-[collapsible=icon]:!p-2 flex w-full items-center gap-2 overflow-hidden rounded-md p-2 text-left text-sm outline-none ring-sidebar-ring transition-[width,height,padding] hover:bg-sidebar-accent hover:text-sidebar-accent-foreground focus-visible:ring-2 active:bg-sidebar-accent active:text-sidebar-accent-foreground disabled:pointer-events-none disabled:opacity-50 group-has-[[data-sidebar=menu-action]]/menu-item:pr-8 aria-disabled:pointer-events-none aria-disabled:opacity-50 data-[active=true]:bg-sidebar-accent data-[active=true]:font-medium data-[active=true]:text-sidebar-accent-foreground data-[state=open]:hover:bg-sidebar-accent data-[state=open]:hover:text-sidebar-accent-foreground [&>span:last-child]:truncate [&>svg]:size-4 [&>svg]:shrink-0",
	{
		variants: {
			variant: {
				default: "hover:bg-sidebar-accent hover:text-sidebar-accent-foreground",
				outline:
					"bg-background shadow-[0_0_0_1px_hsl(var(--sidebar-border))] hover:bg-sidebar-accent hover:text-sidebar-accent-foreground hover:shadow-[0_0_0_1px_hsl(var(--sidebar-accent))]",
			},
			size: {
				default: "h-8 text-sm",
				sm: "h-7 text-xs",
				lg: "group-data-[collapsible=icon]:!p-0 h-12 text-sm",
			},
		},
		defaultVariants: {
			variant: "default",
			size: "default",
		},
	},
);

type SidebarMenuButtonProps = QwikJSX.IntrinsicElements["button"] &
	VariantProps<typeof sidebarMenuButtonVariants> & {
		isActive?: boolean;
		tooltip?: string | PropsOf<typeof Tooltip.Panel>;
	};

export const SidebarMenuButton = component$<SidebarMenuButtonProps>(
	({ class: className, tooltip, variant, size, isActive, ...props }) => {
		const { isMobile, state } = useSidebar();

		const button = (
			<button
				class={cn(sidebarMenuButtonVariants({ variant, size }), className)}
				data-active={isActive}
				data-sidebar="menu-button"
				data-size={size}
				{...props}
			>
				<Slot />
			</button>
		);

		if (!tooltip) {
			return button;
		}

		if (typeof tooltip === "string") {
			tooltip = {
				children: tooltip,
			};
		}

		return (
			<Tooltip.Root>
				<Tooltip.Trigger>{button}</Tooltip.Trigger>
				<Tooltip.Panel
					align="center"
					hidden={state.value !== "collapsed" || isMobile.value}
					{...tooltip}
				/>
			</Tooltip.Root>
		);
	},
);

type SidebarMenuActionProps = QwikJSX.IntrinsicElements["button"] & {
	showOnHover?: boolean;
};

export const SidebarMenuAction = component$<SidebarMenuActionProps>(
	({ class: className, showOnHover, ...props }) => {
		return (
			<button
				class={cn(
					"absolute top-1.5 right-1 flex aspect-square w-5 items-center justify-center rounded-md p-0 text-sidebar-foreground outline-none ring-sidebar-ring transition-transform hover:bg-sidebar-accent hover:text-sidebar-accent-foreground focus-visible:ring-2 peer-hover/menu-button:text-sidebar-accent-foreground [&>svg]:size-4 [&>svg]:shrink-0",
					// Increases the hit area of the button on mobile.
					"after:-inset-2 after:absolute after:md:hidden",
					"peer-data-[size=sm]/menu-button:top-1",
					"peer-data-[size=default]/menu-button:top-1.5",
					"peer-data-[size=lg]/menu-button:top-2.5",
					"group-data-[collapsible=icon]:hidden",
					showOnHover &&
						"group-focus-within/menu-item:opacity-100 group-hover/menu-item:opacity-100 data-[state=open]:opacity-100 peer-data-[active=true]/menu-button:text-sidebar-accent-foreground md:opacity-0",
					className,
				)}
				data-sidebar="menu-action"
				{...props}
			>
				<Slot />
			</button>
		);
	},
);

type SidebarMenuBadgeProps = QwikJSX.IntrinsicElements["div"];

export const SidebarMenuBadge = component$<SidebarMenuBadgeProps>(
	({ class: className, ...props }) => (
		<div
			class={cn(
				"pointer-events-none absolute right-1 flex h-5 min-w-5 select-none items-center justify-center rounded-md px-1 font-medium text-sidebar-foreground text-xs tabular-nums",
				"peer-hover/menu-button:text-sidebar-accent-foreground peer-data-[active=true]/menu-button:text-sidebar-accent-foreground",
				"peer-data-[size=sm]/menu-button:top-1",
				"peer-data-[size=default]/menu-button:top-1.5",
				"peer-data-[size=lg]/menu-button:top-2.5",
				"group-data-[collapsible=icon]:hidden",
				className,
			)}
			data-sidebar="menu-badge"
			{...props}
		>
			<Slot />
		</div>
	),
);

type SidebarMenuSkeletonProps = QwikJSX.IntrinsicElements["div"] & {
	showIcon?: boolean;
};

export const SidebarMenuSkeleton = component$<SidebarMenuSkeletonProps>(
	({ class: className, showIcon, ...props }) => {
		// Random width between 50 to 90%.
		const width = useComputed$(() => {
			return `${Math.floor(Math.random() * 40) + 50}%`;
		});

		return (
			<div
				class={cn("flex h-8 items-center gap-2 rounded-md px-2", className)}
				data-sidebar="menu-skeleton"
				{...props}
			>
				{showIcon && (
					<Skeleton
						class="size-4 rounded-md"
						data-sidebar="menu-skeleton-icon"
					/>
				)}
				<Skeleton
					class="h-4 max-w-[--skeleton-width] flex-1"
					data-sidebar="menu-skeleton-text"
					style={
						{
							"--skeleton-width": width,
						} as unknown as CSSProperties
					}
				/>
			</div>
		);
	},
);

type SidebarMenuSubProps = QwikJSX.IntrinsicElements["ul"];

export const SidebarMenuSub = component$<SidebarMenuSubProps>(
	({ class: className, ...props }) => {
		return (
			<ul
				class={cn(
					"mx-3.5 flex min-w-0 translate-x-px flex-col gap-1 border-sidebar-border border-l px-2.5 py-0.5",
					"group-data-[collapsible=icon]:hidden",
					className,
				)}
				data-sidebar="menu-sub"
				{...props}
			>
				<Slot />
			</ul>
		);
	},
);

type SidebarMenuSubItemProps = QwikJSX.IntrinsicElements["li"];

export const SidebarMenuSubItem = component$<SidebarMenuSubItemProps>(
	({ ...props }) => {
		return (
			<li {...props}>
				<Slot />
			</li>
		);
	},
);

type SidebarMenuSubButtonProps = QwikJSX.IntrinsicElements["a"] & {
	size?: "sm" | "md";
	isActive?: boolean;
};

export const SidebarMenuSubButton = component$<SidebarMenuSubButtonProps>(
	({ size = "md", isActive, className, ...props }) => (
		<a
			class={cn(
				"-translate-x-px flex h-7 min-w-0 items-center gap-2 overflow-hidden rounded-md px-2 text-sidebar-foreground outline-none ring-sidebar-ring hover:bg-sidebar-accent hover:text-sidebar-accent-foreground focus-visible:ring-2 active:bg-sidebar-accent active:text-sidebar-accent-foreground disabled:pointer-events-none disabled:opacity-50 aria-disabled:pointer-events-none aria-disabled:opacity-50 [&>span:last-child]:truncate [&>svg]:size-4 [&>svg]:shrink-0 [&>svg]:text-sidebar-accent-foreground",
				"data-[active=true]:bg-sidebar-accent data-[active=true]:text-sidebar-accent-foreground",
				size === "sm" && "text-xs",
				size === "md" && "text-sm",
				"group-data-[collapsible=icon]:hidden",
				className,
			)}
			data-active={isActive}
			data-sidebar="menu-sub-button"
			data-size={size}
			{...props}
		>
			<Slot />
		</a>
	),
);
