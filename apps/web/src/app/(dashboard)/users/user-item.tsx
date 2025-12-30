"use client";

import {
	Avatar,
	AvatarFallback,
	AvatarImage,
} from "@spice-world/web/components/ui/avatar";
import { Badge } from "@spice-world/web/components/ui/badge";
import { Button } from "@spice-world/web/components/ui/button";
import {
	Tooltip,
	TooltipContent,
	TooltipProvider,
	TooltipTrigger,
} from "@spice-world/web/components/ui/tooltip";
import { useAtom, useAtomValue } from "jotai";
import { MinusIcon, PlusIcon } from "lucide-react";
import { usePathname, useRouter } from "next/navigation";
import { currentUserAtom, newUserAtom, type UserItemProps } from "./store";

function getInitials(name: string | null, email: string | null): string {
	if (name) {
		const parts = name.split(" ");
		return parts
			.map((n) => n[0] ?? "")
			.join("")
			.toUpperCase()
			.slice(0, 2);
	}
	if (email && email.length > 0) {
		return (email[0] ?? "?").toUpperCase();
	}
	return "?";
}

export const NewUserItem = () => {
	const router = useRouter();
	const pathname = usePathname();
	const newUser = useAtomValue(newUserAtom);

	// Only show on /users or /users/new
	if (pathname !== "/users" && pathname !== "/users/new") {
		return null;
	}

	// Don't show if there's no newUser state
	if (!newUser) return null;

	const isSelected = pathname === "/users/new";

	const handleClick = () => {
		if (isSelected) return;
		router.push("/users/new", { scroll: false });
	};

	return (
		<button
			type="button"
			className={`w-full cursor-pointer hover:bg-sidebar-accent hover:text-sidebar-accent-foreground flex items-center gap-3 border-b p-3
			text-sm leading-tight last:border-b-0 ${isSelected ? "bg-sidebar-accent text-sidebar-accent-foreground" : ""}`}
			onClick={handleClick}
		>
			<Avatar className="h-10 w-10 shrink-0">
				<AvatarImage src={newUser.image ?? undefined} />
				<AvatarFallback>
					{getInitials(newUser.name, newUser.email)}
				</AvatarFallback>
			</Avatar>
			<div className="flex flex-col items-start gap-1 min-w-0 flex-1">
				<div className="flex w-full items-center gap-2">
					<span className="truncate font-medium">
						{newUser.name || "New user"}
					</span>
					<Badge
						variant="secondary"
						className="bg-blue-500 text-white font-semibold dark:bg-blue-600 ml-auto text-xs shrink-0"
					>
						new
					</Badge>
				</div>
				<span className="text-muted-foreground text-xs truncate w-full text-left">
					{newUser.email || "email@example.com"}
				</span>
			</div>
		</button>
	);
};

export const UserItem = ({ user }: { user: UserItemProps }) => {
	const currentUser = useAtomValue(currentUserAtom);
	const router = useRouter();
	const pathname = usePathname();

	const isSelected = pathname.includes(user.id);

	// Use currentUserAtom ONLY if this item is selected
	const displayUser =
		isSelected && currentUser?.id === user.id ? currentUser : user;

	const handleClick = () => {
		if (isSelected) return;
		router.push(`/users/${user.id}`);
	};

	return (
		<button
			type="button"
			className={`w-full cursor-pointer hover:bg-sidebar-accent hover:text-sidebar-accent-foreground flex items-center gap-3 border-b p-3
			text-sm leading-tight last:border-b-0 ${isSelected ? "bg-sidebar-accent text-sidebar-accent-foreground" : ""}`}
			onClick={handleClick}
		>
			<Avatar className="h-10 w-10 shrink-0">
				<AvatarImage src={displayUser.image ?? undefined} />
				<AvatarFallback>
					{getInitials(displayUser.name, displayUser.email)}
				</AvatarFallback>
			</Avatar>
			<div className="flex flex-col items-start gap-1 min-w-0 flex-1">
				<div className="flex w-full items-center gap-2">
					<span className="truncate font-medium">
						{displayUser.name || "No name"}
					</span>
					<Badge
						variant={displayUser.banned ? "destructive" : "secondary"}
						className={`ml-auto text-xs shrink-0 ${
							displayUser.role === "admin" && !displayUser.banned
								? "bg-purple-500 text-white"
								: ""
						}`}
					>
						{displayUser.banned ? "banned" : displayUser.role}
					</Badge>
				</div>
				<span className="text-muted-foreground text-xs truncate w-full text-left">
					{displayUser.email}
				</span>
			</div>
		</button>
	);
};

export const AddUserButton = () => {
	const [newUser, setNewUser] = useAtom(newUserAtom);
	const router = useRouter();

	const handleClick = (reset: boolean = false) => {
		if (reset) {
			setNewUser(null);
			router.push("/users");
			return;
		}
		router.push("/users/new");
	};

	return (
		<TooltipProvider>
			<Tooltip>
				<TooltipTrigger asChild>
					<Button
						onClick={() => handleClick(!!newUser)}
						variant="outline"
						className="pl-2"
					>
						{newUser ? <MinusIcon /> : <PlusIcon />}
					</Button>
				</TooltipTrigger>
				<TooltipContent side="bottom">
					{newUser ? <p>Cancel new user</p> : <p>Add a new user</p>}
				</TooltipContent>
			</Tooltip>
		</TooltipProvider>
	);
};
