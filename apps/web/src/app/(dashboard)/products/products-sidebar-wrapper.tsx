"use client";

import { Sidebar } from "@spice-world/web/components/ui/sidebar";
import { useAtomValue } from "jotai";
import type { ReactNode } from "react";
import { sidebarExpandedAtom } from "./store";

const SIDEBAR_WIDTH_COLLAPSED = "350px";
const SIDEBAR_WIDTH_EXPANDED = "600px";

export function ProductsSidebarWrapper({ children }: { children: ReactNode }) {
	const expanded = useAtomValue(sidebarExpandedAtom);

	return (
		<Sidebar
			side="right"
			className="overflow-hidden *:data-[sidebar=sidebar]:flex-row"
			style={
				{
					"--sidebar-width": expanded
						? SIDEBAR_WIDTH_EXPANDED
						: SIDEBAR_WIDTH_COLLAPSED,
				} as React.CSSProperties
			}
		>
			{children}
		</Sidebar>
	);
}
