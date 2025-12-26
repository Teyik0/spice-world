"use client";

import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuTrigger,
} from "@spice-world/web/components/ui/dropdown-menu";
import { Moon, Sun } from "lucide-react";
import { ThemeProvider as NextThemesProvider, useTheme } from "next-themes";
import type * as React from "react";
import { Button } from "./ui/button";

export function ThemeProvider({
	children,
	...props
}: React.ComponentProps<typeof NextThemesProvider>) {
	return <NextThemesProvider {...props}>{children}</NextThemesProvider>;
}

export function ThemeToggle() {
	const { setTheme } = useTheme();

	return (
		<DropdownMenu>
			<DropdownMenuTrigger asChild>
				<Button
					size="lg"
					className="flex items-center justify-center hover:bg-sidebar-accent/50 hover:rounded-md
					md:h-8 md:p-0 bg-muted size-full rounded-lg"
				>
					<Sun className="h-8 w-8 scale-100 rotate-0 transition-all dark:scale-0 dark:-rotate-90 text-black" />
					<Moon className="absolute h-8 w-8 scale-0 rotate-90 transition-all dark:scale-100 dark:rotate-0 text-white" />
					<span className="sr-only">Toggle theme</span>
				</Button>
			</DropdownMenuTrigger>
			<DropdownMenuContent align="end">
				<DropdownMenuItem onClick={() => setTheme("light")}>
					Light
				</DropdownMenuItem>
				<DropdownMenuItem onClick={() => setTheme("dark")}>
					Dark
				</DropdownMenuItem>
				<DropdownMenuItem onClick={() => setTheme("system")}>
					System
				</DropdownMenuItem>
			</DropdownMenuContent>
		</DropdownMenu>
	);
}
