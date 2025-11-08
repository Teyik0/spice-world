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

export default function CollapsibleContent() {
	return (
		<Sidebar collapsible="none" className="hidden flex-1 md:flex">
			<SidebarHeader className="gap-3.5 border-b p-4">
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
				</ButtonGroup>
			</SidebarHeader>
			<SidebarContent>
				<SidebarGroup className="px-0">
					<SidebarGroupContent></SidebarGroupContent>
				</SidebarGroup>
			</SidebarContent>
		</Sidebar>
	);
}
