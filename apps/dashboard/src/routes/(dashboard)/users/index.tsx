import { $, component$, useSignal, useTask$ } from "@qwik.dev/core";
import { routeLoader$, useLocation, useNavigate } from "@qwik.dev/router";
import {
	LuFilter,
	LuSearch,
	LuShield,
	LuUserCheck,
	LuUsers,
	LuUserX,
} from "@qwikest/icons/lucide";
import { Image } from "@unpic/qwik";
import type { UserWithRole } from "better-auth/plugins";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import {
	Table,
	TableBody,
	TableCell,
	TableHead,
	TableHeader,
	TableRow,
} from "@/components/ui/table";
import { authClient, getBetterAuthCookie } from "@/lib/auth-client";
import { CreateUserDialog } from "./user-create-dialog";
import { DeleteUserDialog } from "./user-delete-dialog";
import { EditUserDialog } from "./user-edit-dialog";

export const useListUsers = routeLoader$(async (requestEvent) => {
	const url = requestEvent.url;
	const searchParams = url.searchParams;

	let searchField: "name" | "email" = "email";
	const searchFieldParam = searchParams.get("searchField");

	switch (searchFieldParam) {
		case "name":
			searchField = "name";
			break;
		default:
			searchField = "email";
			break;
	}

	const limit = Math.min(
		Number.parseInt(searchParams.get("limit") || "25", 10),
		100,
	);
	const offset = Math.max(
		Number.parseInt(searchParams.get("offset") || "0", 10),
		0,
	);
	const searchValue = searchParams.get("search") || "";
	const roleFilter = searchParams.get("role") || "";
	const sortBy = searchParams.get("sortBy") || "createdAt";
	const sortDirection = searchParams.get("sortDirection") || "desc";

	const users = await authClient.admin.listUsers(
		{
			query: {
				limit,
				searchField,
				searchValue,
				searchOperator: "contains",
				filterField: "role",
				filterValue: roleFilter,
				offset,
				sortBy: sortBy as "name" | "email" | "createdAt",
				sortDirection: sortDirection as "asc" | "desc",
			},
		},
		{
			headers: {
				cookie: getBetterAuthCookie(requestEvent.cookie),
			},
		},
	);

	const userList = users.data?.users || [];
	const total = users.data?.total || 0;

	// Calculate statistics
	const adminCount = userList.filter((user) => user.role === "admin").length;
	const verifiedCount = userList.filter((user) => user.emailVerified).length;
	const bannedCount = userList.filter((user) => user.banned).length;

	return {
		users: userList,
		total,
		limit,
		offset,
		searchValue,
		searchField,
		roleFilter,
		sortBy,
		sortDirection,
		stats: {
			total,
			adminCount,
			verifiedCount,
			bannedCount,
		},
	};
});

export default component$(() => {
	const usersData = useListUsers();
	const location = useLocation();
	const navigate = useNavigate();

	const searchValue = useSignal(usersData.value.searchValue);
	const searchField = useSignal(usersData.value.searchField);
	const roleFilter = useSignal(usersData.value.roleFilter);

	useTask$(({ track }) => {
		track(() => searchValue.value);
		track(() => searchField.value);
		track(() => roleFilter.value);
	});

	const handleSearch = $(() => {
		const params = new URLSearchParams(location.url.searchParams);
		if (searchValue.value.trim()) {
			params.set("search", searchValue.value.trim());
		} else {
			params.delete("search");
		}
		params.set("searchField", searchField.value);
		if (roleFilter.value) {
			params.set("role", roleFilter.value);
		} else {
			params.delete("role");
		}
		params.set("offset", "0"); // Reset to first page
		navigate(`${location.url.pathname}?${params.toString()}`);
	});

	const handlePageChange = $((newOffset: number) => {
		const params = new URLSearchParams(location.url.searchParams);
		params.set("offset", newOffset.toString());
		navigate(`${location.url.pathname}?${params.toString()}`);
	});

	const { users, total, limit, offset, stats } = usersData.value;
	const currentPage = Math.floor(offset / limit) + 1;
	const totalPages = Math.ceil(total / limit);
	const hasNextPage = offset + limit < total;
	const hasPrevPage = offset > 0;

	return (
		<div class="space-y-6 px-6">
			{/* Header */}
			<div class="flex items-center justify-between">
				<div class="flex items-center gap-3">
					<div class="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10">
						<LuUsers class="h-5 w-5 text-primary" />
					</div>
					<div>
						<h1 class="font-bold text-2xl tracking-tight">Users</h1>
						<p class="text-muted-foreground">
							Manage user accounts and permissions
						</p>
					</div>
				</div>
				<CreateUserDialog />
			</div>

			{/* Statistics Cards */}
			<div class="grid gap-4 md:grid-cols-4">
				<Card.Root class="rounded-lg">
					<Card.Content class="p-6">
						<div class="flex items-center">
							<div class="flex h-12 w-12 items-center justify-center rounded-lg bg-blue-100">
								<LuUsers class="h-6 w-6 text-blue-600" />
							</div>
							<div class="ml-4">
								<p class="font-medium text-muted-foreground text-sm">
									Total Users
								</p>
								<p class="font-bold text-2xl">{stats.total}</p>
							</div>
						</div>
					</Card.Content>
				</Card.Root>

				<Card.Root class="rounded-lg">
					<Card.Content class="p-6">
						<div class="flex items-center">
							<div class="flex h-12 w-12 items-center justify-center rounded-lg bg-purple-100">
								<LuShield class="h-6 w-6 text-purple-600" />
							</div>
							<div class="ml-4">
								<p class="font-medium text-muted-foreground text-sm">
									Administrators
								</p>
								<p class="font-bold text-2xl">{stats.adminCount}</p>
							</div>
						</div>
					</Card.Content>
				</Card.Root>

				<Card.Root class="rounded-lg">
					<Card.Content class="p-6">
						<div class="flex items-center">
							<div class="flex h-12 w-12 items-center justify-center rounded-lg bg-green-100">
								<LuUserCheck class="h-6 w-6 text-green-600" />
							</div>
							<div class="ml-4">
								<p class="font-medium text-muted-foreground text-sm">
									Verified
								</p>
								<p class="font-bold text-2xl">{stats.verifiedCount}</p>
							</div>
						</div>
					</Card.Content>
				</Card.Root>

				<Card.Root class="rounded-lg">
					<Card.Content class="p-6">
						<div class="flex items-center">
							<div class="flex h-12 w-12 items-center justify-center rounded-lg bg-red-100">
								<LuUserX class="h-6 w-6 text-red-600" />
							</div>
							<div class="ml-4">
								<p class="font-medium text-muted-foreground text-sm">Banned</p>
								<p class="font-bold text-2xl">{stats.bannedCount}</p>
							</div>
						</div>
					</Card.Content>
				</Card.Root>
			</div>

			{/* Filters */}
			<Card.Root class="rounded-lg">
				<Card.Content class="p-6">
					<div class="grid gap-4 md:grid-cols-4">
						<div class="flex flex-col gap-2 md:col-span-2">
							<Label for="search">Search Users</Label>
							<div class="relative">
								<LuSearch class="-translate-y-1/2 absolute top-1/2 left-3 h-4 w-4 text-muted-foreground" />
								<Input
									class="pl-10"
									id="search"
									onKeyDown$={(e) => {
										if (e.key === "Enter") {
											handleSearch();
										}
									}}
									placeholder="Search by name or email..."
									bind:value={searchValue}
								/>
							</div>
						</div>
						<div class="flex flex-col gap-2">
							<Label for="searchField">Search Field</Label>
							<Select
								name="searchField"
								onInput$={(_, el) => {
									searchField.value = el.value as "name" | "email";
								}}
								options={[
									{ label: "Email", value: "email" },
									{ label: "Name", value: "name" },
								]}
								value={searchField.value}
							/>
						</div>
						<div class="flex flex-col gap-2">
							<Label for="role">Role Filter</Label>
							<Select
								name="role"
								onInput$={(_, el) => {
									roleFilter.value = el.value;
								}}
								options={[
									{ label: "All Roles", value: "" },
									{ label: "Admin", value: "admin" },
									{ label: "User", value: "user" },
								]}
								value={roleFilter.value}
							/>
						</div>
					</div>
					<div class="mt-4 flex justify-end">
						<Button onClick$={handleSearch}>
							<LuFilter class="mr-2 h-4 w-4" />
							Apply Filters
						</Button>
					</div>
				</Card.Content>
			</Card.Root>

			{/* Results */}
			<Card.Root class="mb-8 rounded-lg">
				<Card.Header>
					<div class="flex items-center justify-between">
						<div>
							<Card.Title>Users ({total})</Card.Title>
							<Card.Description>
								Showing {offset + 1} to {Math.min(offset + limit, total)} of{" "}
								{total} users
							</Card.Description>
						</div>
					</div>
				</Card.Header>
				<Card.Content class="p-0">
					<div class="overflow-x-auto">
						<Table>
							<TableHeader>
								<TableRow>
									<TableHead class="w-[250px]">User</TableHead>
									<TableHead class="hidden md:table-cell">Email</TableHead>
									<TableHead class="w-[100px]">Role</TableHead>
									<TableHead class="hidden w-[120px] lg:table-cell">
										Status
									</TableHead>
									<TableHead class="hidden w-[100px] xl:table-cell">
										Joined
									</TableHead>
									<TableHead class="w-[120px] text-right">Actions</TableHead>
								</TableRow>
							</TableHeader>
							<TableBody>
								{users.length === 0 ? (
									<TableRow>
										<TableCell
											class="py-8 text-center text-muted-foreground"
											colSpan={6}
										>
											<div class="flex flex-col items-center space-y-2">
												<LuUsers class="h-8 w-8 text-muted-foreground/50" />
												<p>No users found matching your criteria.</p>
												<p class="text-xs">
													Try adjusting your search filters.
												</p>
											</div>
										</TableCell>
									</TableRow>
								) : (
									users.map((user) => <UserRow key={user.id} user={user} />)
								)}
							</TableBody>
						</Table>
					</div>
				</Card.Content>
			</Card.Root>

			{/* Pagination */}
			{totalPages > 1 && (
				<div class="flex items-center justify-between">
					<div class="text-muted-foreground text-sm">
						Page {currentPage} of {totalPages}
					</div>
					<div class="flex items-center gap-2">
						<Button
							disabled={!hasPrevPage}
							look="outline"
							onClick$={() => handlePageChange(Math.max(0, offset - limit))}
							size="sm"
						>
							Previous
						</Button>
						<Button
							disabled={!hasNextPage}
							look="outline"
							onClick$={() => handlePageChange(offset + limit)}
							size="sm"
						>
							Next
						</Button>
					</div>
				</div>
			)}
		</div>
	);
});

const UserRow = component$(({ user }: { user: UserWithRole }) => {
	const formatDate = (date: string | Date) => {
		return new Date(date).toLocaleDateString("en-US", {
			year: "numeric",
			month: "short",
			day: "numeric",
		});
	};

	return (
		<TableRow class="transition-colors hover:bg-muted/50" key={user.id}>
			<TableCell>
				<div class="flex items-center gap-3">
					<div class="relative">
						{user.image ? (
							<Image
								alt={`${user.name || "User"}'s avatar`}
								class="rounded-full object-cover"
								height={40}
								src={user.image}
								width={40}
							/>
						) : (
							<div class="flex h-10 w-10 items-center justify-center rounded-full bg-gradient-to-br from-primary/20 to-primary/10">
								<span
									aria-hidden="true"
									class="font-medium text-primary text-sm"
								>
									{user.name?.charAt(0)?.toUpperCase() ||
										user.email?.charAt(0)?.toUpperCase() ||
										"U"}
								</span>
							</div>
						)}
						{user.emailVerified && (
							<div
								class="-bottom-0.5 -right-0.5 absolute h-3 w-3 rounded-full border-2 border-background bg-green-500"
								title="Email verified"
							/>
						)}
					</div>
					<div class="min-w-0 flex-1">
						<p class="truncate font-medium text-sm">
							{user.name || "Unnamed User"}
						</p>
						<div class="flex items-center gap-2">
							<p class="truncate text-muted-foreground text-xs md:hidden">
								{user.email}
							</p>
							<p class="text-muted-foreground text-xs">
								ID: {user.id.slice(0, 8)}...
							</p>
						</div>
					</div>
				</div>
			</TableCell>
			<TableCell class="hidden md:table-cell">
				<span class="block max-w-[200px] truncate text-sm" title={user.email}>
					{user.email}
				</span>
			</TableCell>
			<TableCell>
				<Badge
					class="text-xs"
					look={user.role === "admin" ? "primary" : "secondary"}
				>
					{user.role?.toUpperCase() || "USER"}
				</Badge>
			</TableCell>
			<TableCell class="hidden lg:table-cell">
				<div class="flex flex-col gap-1">
					{user.emailVerified ? (
						<Badge
							class="w-fit border-green-200 bg-green-50 text-green-700 text-xs"
							look="outline"
						>
							Verified
						</Badge>
					) : (
						<Badge
							class="w-fit border-yellow-200 bg-yellow-50 text-xs text-yellow-700"
							look="outline"
						>
							Unverified
						</Badge>
					)}
					{user.banned && (
						<Badge class="w-fit text-xs" look="alert">
							Banned
						</Badge>
					)}
				</div>
			</TableCell>
			<TableCell class="hidden xl:table-cell">
				<span class="text-muted-foreground text-sm">
					{formatDate(user.createdAt)}
				</span>
			</TableCell>
			<TableCell>
				<div class="flex items-center justify-end gap-2">
					<EditUserDialog user={user} />
					<DeleteUserDialog user={user} />
				</div>
			</TableCell>
		</TableRow>
	);
});
