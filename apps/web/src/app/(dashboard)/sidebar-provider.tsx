"use client";

import { SidebarProvider } from "@spice-world/web/components/ui/sidebar";
import {
	createContext,
	type ReactNode,
	useCallback,
	useContext,
	useRef,
	useState,
} from "react";

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
	scrollRef: React.RefObject<HTMLDivElement | null>;
	saveScrollPosition: () => void;
	restoreScrollPosition: () => void;
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

export function useSidebarScroll() {
	const context = useContext(SidebarContext);
	if (!context) {
		throw new Error(
			"useSidebarScroll must be used within SidebarRightProvider",
		);
	}
	return {
		scrollRef: context.scrollRef,
		saveScrollPosition: context.saveScrollPosition,
		restoreScrollPosition: context.restoreScrollPosition,
	};
}

export function SidebarRightProvider({
	children,
	initialExpanded,
}: {
	children: ReactNode;
	initialExpanded: boolean;
}) {
	const [expanded, setExpandedState] = useState(initialExpanded);
	const scrollRef = useRef<HTMLDivElement | null>(null);
	const scrollPositionRef = useRef<number>(0);

	const setExpanded = (value: boolean) => {
		setExpandedState(value);
		setCookie(COOKIE_NAME, String(value));
	};

	const saveScrollPosition = useCallback(() => {
		if (scrollRef.current) {
			scrollPositionRef.current = scrollRef.current.scrollTop;
		}
	}, []);

	const restoreScrollPosition = useCallback(() => {
		if (scrollRef.current) {
			scrollRef.current.scrollTop = scrollPositionRef.current;
		}
	}, []);

	return (
		<SidebarContext.Provider
			value={{
				expanded,
				setExpanded,
				scrollRef,
				saveScrollPosition,
				restoreScrollPosition,
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
