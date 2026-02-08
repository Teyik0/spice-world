import { ClientOnly } from "@spice-world/web/components/client-only";
import { Button } from "@spice-world/web/components/ui/button";
import { ButtonGroup } from "@spice-world/web/components/ui/button-group";
import { Input } from "@spice-world/web/components/ui/input";
import { Skeleton } from "@spice-world/web/components/ui/skeleton";
import { SearchIcon } from "lucide-react";
import { Suspense } from "react";
import type { UserItemProps } from "./store";
import { AddUserButton, NewUserItem, UserItem } from "./user-item";

export async function SidebarRight({ users }: { users: UserItemProps[] }) {
	return (
		<Suspense fallback={<UsersSidebarSkeleton />}>
			<aside className="hidden md:flex flex-1 flex-col border-r bg-background h-screen overflow-hidden">
				<header className="p-3 border-b h-16 items-center flex">
					<ButtonGroup className="w-full">
						<Input placeholder="Search users..." />
						<Button variant="outline" aria-label="Search">
							<SearchIcon />
						</Button>
						<ClientOnly>
							<AddUserButton />
						</ClientOnly>
					</ButtonGroup>
				</header>
				<div className="flex-1 overflow-auto">
					<ClientOnly>
						<NewUserItem />
					</ClientOnly>
					{users?.map((user) => (
						<UserItem key={user.id} user={user} />
					))}
				</div>
			</aside>
		</Suspense>
	);
}

function UsersSidebarSkeleton() {
	return (
		<aside className="hidden md:flex flex-1 flex-col border-r bg-background h-screen overflow-hidden">
			<header className="p-3 border-b h-16">
				<div className="flex gap-2">
					<Skeleton className="h-9 flex-1" />
				</div>
			</header>
			<div className="flex-1 overflow-auto">
				{Array.from({ length: 5 }).map((_, index) => (
					<div key={index} className="border-b p-4 flex items-center gap-3">
						<Skeleton className="h-10 w-10 rounded-full shrink-0" />
						<div className="flex-1">
							<Skeleton className="h-4 w-3/4 mb-2" />
							<Skeleton className="h-3 w-full" />
						</div>
					</div>
				))}
			</div>
		</aside>
	);
}
