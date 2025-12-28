"use client";

import { ThemeToggle } from "@spice-world/web/components/theme-provider";
import {
	Avatar,
	AvatarFallback,
	AvatarImage,
} from "@spice-world/web/components/ui/avatar";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuGroup,
	DropdownMenuItem,
	DropdownMenuLabel,
	DropdownMenuSeparator,
	DropdownMenuTrigger,
} from "@spice-world/web/components/ui/dropdown-menu";
import {
	Tooltip,
	TooltipContent,
	TooltipProvider,
	TooltipTrigger,
} from "@spice-world/web/components/ui/tooltip";
import type { Session } from "@spice-world/web/lib/utils";
import {
	BadgeCheck,
	Boxes,
	BringToFront,
	ChartSpline,
	Command,
	LogOut,
	UserCircle,
} from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";

const navItems = [
	{
		title: "Dashboard",
		url: "/",
		icon: ChartSpline,
	},
	{
		title: "Products",
		url: "/products",
		icon: Boxes,
	},
	{
		title: "Users",
		url: "/users",
		icon: UserCircle,
	},
	{
		title: "Orders",
		url: "/orders",
		icon: BringToFront,
	},
];

export function AppSidebar({ login }: { login: Session }) {
	const [activeItem, setActiveItem] = useState(navItems[0]);
	const router = useRouter();
	const nav = usePathname();

	useEffect(() => {
		const foundItem = navItems
			.slice(1)
			.find((item) => nav.startsWith(item.url));
		if (foundItem) setActiveItem(foundItem);
		else setActiveItem(navItems[0]);
	}, [nav]);

	return (
		<div className="flex min-h-svh">
			{/* Main navigation sidebar */}
			<aside className="w-12 border-r bg-sidebar flex flex-col sticky top-0 h-svh">
				{/* Header with logo */}
				<header className="p-2">
					<Link
						href="/"
						className="flex items-center justify-center h-8 w-8 bg-sidebar-primary text-sidebar-primary-foreground rounded-lg hover:opacity-90 transition-opacity"
					>
						<Command className="h-5 w-5" />
					</Link>
				</header>

				{/* Navigation items */}
				<nav className="flex-1 py-4">
					<TooltipProvider>
						<ul className="flex flex-col gap-2 px-2">
							{navItems.map((item) => (
								<li key={item.title}>
									<Tooltip>
										<TooltipTrigger asChild>
											<button
												type="button"
												onClick={() => {
													setActiveItem(item);
													router.push(item.url);
												}}
												className={`
													w-full h-8 flex items-center justify-center rounded-lg
													transition-colors cursor-pointer
													${
														activeItem?.title === item.title
															? "bg-sidebar-accent text-sidebar-accent-foreground"
															: "hover:bg-sidebar-accent/50 text-sidebar-foreground"
													}
												`}
											>
												<item.icon className="h-5 w-5" />
												<span className="sr-only">{item.title}</span>
											</button>
										</TooltipTrigger>
										<TooltipContent side="right" sideOffset={4}>
											{item.title}
										</TooltipContent>
									</Tooltip>
								</li>
							))}
						</ul>
					</TooltipProvider>
				</nav>
				<footer className="p-2 flex flex-col gap-2">
					<ThemeToggle />
					<NavUser login={login} />
				</footer>
			</aside>
		</div>
	);
}

export function NavUser({ login }: { login: Session }) {
	const { user } = login;

	return (
		<DropdownMenu>
			<DropdownMenuTrigger asChild>
				<button
					type="button"
					className="w-full h-8 flex items-center justify-center rounded-lg hover:bg-sidebar-accent
					hover:text-sidebar-accent-foreground transition-colors cursor-pointer"
				>
					<Avatar className="h-8 w-8 rounded-lg">
						<AvatarImage src={user.image ?? undefined} alt={user.name} />
						<AvatarFallback className="rounded-lg">
							{user.name
								.split(" ")
								.map((n) => n[0])
								.join("")
								.slice(0, 2)}
						</AvatarFallback>
					</Avatar>
					<span className="sr-only">User menu</span>
				</button>
			</DropdownMenuTrigger>
			<DropdownMenuContent
				className="w-56 rounded-lg"
				side="right"
				align="end"
				sideOffset={4}
			>
				<DropdownMenuLabel className="p-0 font-normal">
					<div className="flex items-center gap-2 px-1 py-1.5 text-left text-sm">
						<Avatar className="h-8 w-8 rounded-lg">
							<AvatarImage src={user.image ?? undefined} alt={user.name} />
							<AvatarFallback className="rounded-lg">
								{user.name
									.split(" ")
									.map((n) => n[0])
									.join("")
									.slice(0, 2)}
							</AvatarFallback>
						</Avatar>
						<div className="grid flex-1 text-left text-sm leading-tight">
							<span className="truncate font-medium">{user.name}</span>
							<span className="truncate text-xs">{user.email}</span>
						</div>
					</div>
				</DropdownMenuLabel>
				<DropdownMenuSeparator />
				<DropdownMenuGroup>
					<DropdownMenuItem>
						<BadgeCheck />
						Account
					</DropdownMenuItem>
				</DropdownMenuGroup>
				<DropdownMenuSeparator />
				<DropdownMenuItem>
					<LogOut />
					Log out
				</DropdownMenuItem>
			</DropdownMenuContent>
		</DropdownMenu>
	);
}
