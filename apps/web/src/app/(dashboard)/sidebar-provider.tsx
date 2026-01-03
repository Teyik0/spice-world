"use client";

import { SidebarProvider } from "@spice-world/web/components/ui/sidebar";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { createContext, type ReactNode, useContext, useState } from "react";

export const queryClient = new QueryClient({
	defaultOptions: {
		queries: {
			staleTime: 1000 * 60 * 5, // 5 min
			refetchOnWindowFocus: false,
			retry: 1,
		},
	},
});

const SIDEBAR_WIDTH_COLLAPSED = "350px";
const SIDEBAR_WIDTH_EXPANDED = "600px";
const COOKIE_NAME = "sidebar-expanded";

function setCookie(name: string, value: string) {
	if (typeof document === "undefined") return;
	// biome-ignore lint/suspicious/noDocumentCookie: accepted
	document.cookie = `${name}=${value}; path=/; max-age=${60 * 60 * 24 * 365}; samesite=lax`;
}

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
		setCookie(COOKIE_NAME, String(value));
	};

	return (
		<QueryClientProvider client={queryClient}>
			<SidebarContext.Provider value={{ expanded, setExpanded }}>
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
		</QueryClientProvider>
	);
}
