"use client";

import { SidebarProvider } from "@spice-world/web/components/ui/sidebar";
import { createContext, type ReactNode, useContext, useState } from "react";
import { setSidebarExpanded } from "./cookies";

const SIDEBAR_WIDTH_COLLAPSED = "350px";
const SIDEBAR_WIDTH_EXPANDED = "600px";

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

	const setExpanded = (value: boolean) => {
		setExpandedState(value);
		setSidebarExpanded(value);
	};

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
						"--sidebar-width": expanded
							? SIDEBAR_WIDTH_EXPANDED
							: SIDEBAR_WIDTH_COLLAPSED,
					} as React.CSSProperties
				}
			>
				{children}
			</SidebarProvider>
		</SidebarContext.Provider>
	);
}
