import {
	AlertTriangleIcon,
	CheckIcon,
	ChevronDownIcon,
	CopyIcon,
	SearchIcon,
	ShareIcon,
	TrashIcon,
	UserRoundXIcon,
	VolumeOffIcon,
} from "lucide-react";
import { Suspense } from "react";
import { Button } from "@/components/ui/button";
import { ButtonGroup } from "@/components/ui/button-group";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuGroup,
	DropdownMenuItem,
	DropdownMenuSeparator,
	DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import {
	Sidebar,
	SidebarContent,
	SidebarGroup,
	SidebarGroupContent,
	SidebarHeader,
} from "@/components/ui/sidebar";
import { Skeleton } from "@/components/ui/skeleton";
import { app } from "@/lib/utils";
import { AddProductButton, NewProduct } from "./new-product";
import { ProductCard } from "./product";

export default async function CollapsibleContent() {
	const { data: products } = await app.products.get({
		query: { take: 100, skip: 0, status: undefined },
	});

	return (
		<Suspense fallback={<ProductsSidebarSkeleton />}>
			<Sidebar collapsible="none" className="hidden flex-1 md:flex">
				<SidebarHeader className="p-3">
					<ButtonGroup className="w-full">
						<Input placeholder="Type to search..." />
						<Button variant="outline" aria-label="Search">
							<SearchIcon />
						</Button>
						<DropdownMenu>
							<DropdownMenuTrigger asChild>
								<Button variant="outline" className="pl-2">
									<ChevronDownIcon />
								</Button>
							</DropdownMenuTrigger>

							<DropdownMenuContent align="end" className="[--radius:1rem]">
								<DropdownMenuGroup>
									<DropdownMenuItem>
										<VolumeOffIcon />
										Mute Conversation
									</DropdownMenuItem>
									<DropdownMenuItem>
										<CheckIcon />
										Mark as Read
									</DropdownMenuItem>
									<DropdownMenuItem>
										<AlertTriangleIcon />
										Report Conversation
									</DropdownMenuItem>
									<DropdownMenuItem>
										<UserRoundXIcon />
										Block User
									</DropdownMenuItem>
									<DropdownMenuItem>
										<ShareIcon />
										Share Conversation
									</DropdownMenuItem>
									<DropdownMenuItem>
										<CopyIcon />
										Copy Conversation
									</DropdownMenuItem>
								</DropdownMenuGroup>
								<DropdownMenuSeparator />
								<DropdownMenuGroup>
									<DropdownMenuItem variant="destructive">
										<TrashIcon />
										Delete Conversation
									</DropdownMenuItem>
								</DropdownMenuGroup>
							</DropdownMenuContent>
						</DropdownMenu>

						<AddProductButton />
					</ButtonGroup>
				</SidebarHeader>
				<SidebarContent>
					<SidebarGroup className="px-0">
						<SidebarGroupContent>
							<NewProduct />
							{products?.map((product) => (
								<ProductCard key={product.id} product={product} isNew={false} />
							))}
						</SidebarGroupContent>
					</SidebarGroup>
				</SidebarContent>
			</Sidebar>
		</Suspense>
	);
}

function ProductsSidebarSkeleton() {
	return (
		<Sidebar collapsible="none" className="hidden flex-1 md:flex">
			<SidebarHeader className="p-3">
				<div className="flex gap-2">
					<Skeleton className="h-10 flex-1" />
					<Skeleton className="h-10 w-10" />
					<Skeleton className="h-10 w-10" />
					<Skeleton className="h-10 w-10" />
				</div>
			</SidebarHeader>
			<SidebarContent>
				<SidebarGroup className="px-0">
					<SidebarGroupContent>
						{Array.from({ length: 5 }).map((_, index) => (
							<div key={index} className="border-b p-4">
								<Skeleton className="h-4 w-3/4 mb-2" />
								<Skeleton className="h-3 w-full" />
							</div>
						))}
					</SidebarGroupContent>
				</SidebarGroup>
			</SidebarContent>
		</Sidebar>
	);
}
