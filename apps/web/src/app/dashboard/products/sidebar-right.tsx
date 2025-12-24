import type { ProductModel } from "@spice-world/server/modules/products/model";
import { Button } from "@spice-world/web/components/ui/button";
import { ButtonGroup } from "@spice-world/web/components/ui/button-group";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuGroup,
	DropdownMenuItem,
	DropdownMenuSeparator,
	DropdownMenuTrigger,
} from "@spice-world/web/components/ui/dropdown-menu";
import { Input } from "@spice-world/web/components/ui/input";
import { Skeleton } from "@spice-world/web/components/ui/skeleton";
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
import { AddProductButton, NewProductItem, ProductItem } from "./product-item";

export async function SidebarRight({
	products,
}: {
	products: ProductModel.getResult;
}) {
	return (
		<Suspense fallback={<ProductsSidebarSkeleton />}>
			<aside className="hidden md:flex flex-1 flex-col border-r bg-background h-screen overflow-hidden">
				<header className="p-3 border-b h-16 items-center flex">
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
				</header>
				<div className="flex-1 overflow-auto">
					<NewProductItem />
					{products?.map((product) => (
						<ProductItem key={product.id} product={{ ...product, img: null }} />
					))}
				</div>
			</aside>
		</Suspense>
	);
}

function ProductsSidebarSkeleton() {
	return (
		<aside className="hidden md:flex flex-1 flex-col border-r bg-background h-screen overflow-hidden">
			<header className="p-3 border-b h-16">
				<div className="flex gap-2">
					<Skeleton className="h-9 flex-1" />
				</div>
			</header>
			<div className="flex-1 overflow-auto">
				{Array.from({ length: 5 }).map((_, index) => (
					// biome-ignore lint/suspicious/noArrayIndexKey: mandatory here
					<div key={index} className="border-b p-4">
						<Skeleton className="h-4 w-3/4 mb-2" />
						<Skeleton className="h-3 w-full" />
					</div>
				))}
			</div>
		</aside>
	);
}
