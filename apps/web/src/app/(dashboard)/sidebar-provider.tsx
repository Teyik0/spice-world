"use client";

import { SidebarProvider } from "@spice-world/web/components/ui/sidebar";
import { useMediaQuery } from "@spice-world/web/hooks/use-media-query";
import { createContext, type ReactNode, useContext, useState } from "react";
import { setSidebarExpanded } from "./cookies";

const SIDEBAR_WIDTH_COLLAPSED = "350px";
const SIDEBAR_WIDTH_EXPANDED = "600px";
const SIDEBAR_WIDTH_EXPANDED_XL = "800px";

interface SidebarContextValue {
	expanded: boolean;
	setExpanded: (value: boolean) => void;
}

const SidebarContext = createContext<SidebarContextValue | null>(null);

export function useSidebarExpanded() {
	const context = useContext(SidebarContext);
	if (!context) {
		throw new Error(
			"useSidebarExpanded must be used within SidebarRightProvider",
		);
	}
	return [context.expanded, context.setExpanded] as const;
}

export function SidebarRightProvider({
	children,
	initialExpanded,
}: {
	children: ReactNode;
	initialExpanded: boolean;
}) {
	const [expanded, setExpandedState] = useState(initialExpanded);
	const isXl = useMediaQuery("(min-width: 1536px)"); // Tailwind's '2xl' breakpoint

	const setExpanded = (value: boolean) => {
		setExpandedState(value);
		setSidebarExpanded(value);
	};

	const sidebarWidth = expanded
		? isXl
			? SIDEBAR_WIDTH_EXPANDED_XL
			: SIDEBAR_WIDTH_EXPANDED
		: SIDEBAR_WIDTH_COLLAPSED;

	return (
		<SidebarContext.Provider
			value={{
				expanded,
				setExpanded,
			}}
		>
			<SidebarProvider
				style={
					{
						"--sidebar-width": sidebarWidth,
					} as React.CSSProperties
				}
			>
				{children}
			</SidebarProvider>
		</SidebarContext.Provider>
	);
}
