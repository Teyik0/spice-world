"use client";

import { SidebarProvider } from "@spice-world/web/components/ui/sidebar";
import { useAtomValue } from "jotai";
import type { ReactNode } from "react";
import { sidebarExpandedAtom } from "./store";

const SIDEBAR_WIDTH_COLLAPSED = "350px";
const SIDEBAR_WIDTH_EXPANDED = "600px";

export function SidebarRightProvider({ children }: { children: ReactNode }) {
	const expanded = useAtomValue(sidebarExpandedAtom);

	return (
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
	);
}
