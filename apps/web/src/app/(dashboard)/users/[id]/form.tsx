"use client";

import {
	Avatar,
	AvatarFallback,
	AvatarImage,
} from "@spice-world/web/components/ui/avatar";
import { Badge } from "@spice-world/web/components/ui/badge";
import { Button } from "@spice-world/web/components/ui/button";
import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from "@spice-world/web/components/ui/card";
import {
	Dialog,
	DialogClose,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
	DialogTrigger,
} from "@spice-world/web/components/ui/dialog";
import { Input } from "@spice-world/web/components/ui/input";
import { Label } from "@spice-world/web/components/ui/label";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@spice-world/web/components/ui/select";
import { authClient } from "@spice-world/web/lib/utils";
import { useSetAtom } from "jotai";
import { ChevronLeft, Loader2 } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { revalidateUsersLayout } from "../actions";
import { currentUserAtom, newUserAtom } from "../store";
import { UserFormBan } from "./form-ban";

interface User {
	id: string;
	name: string | null;
	email: string | null;
	emailVerified: boolean;
	image: string | null;
	role: string | null;
	banned: boolean | null;
	banReason: string | null;
	banExpires: Date | null;
	createdAt: Date;
}

interface UserFormProps {
	user: User;
	isNew: boolean;
}

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

export const UserForm = ({ user, isNew }: UserFormProps) => {
	const router = useRouter();
	const setSidebarUser = useSetAtom(isNew ? newUserAtom : currentUserAtom);

	const [isSubmitting, setIsSubmitting] = useState(false);
	const [isDeleting, setIsDeleting] = useState(false);

	// Form state
	const [name, setName] = useState(user.name ?? "");
	const [email, setEmail] = useState(user.email ?? "");
	const [password, setPassword] = useState("");
	const [role, setRole] = useState<"user" | "admin">(
		(user.role as "user" | "admin") ?? "user",
	);
	const [banned, setBanned] = useState(user.banned ?? false);
	const [banReason, setBanReason] = useState(user.banReason ?? "");
	const [banExpiresInDays, setBanExpiresInDays] = useState<number | null>(null);

	// Sync sidebar on mount and when form changes
	useEffect(() => {
		setSidebarUser({
			id: user.id,
			name,
			email,
			image: user.image,
			role,
			banned,
		});
	}, [name, email, role, banned, user.id, user.image, setSidebarUser]);

	const handleSubmit = async (e: React.FormEvent) => {
		e.preventDefault();
		setIsSubmitting(true);

		try {
			if (isNew) {
				// Create new user
				if (!name || !email || !password) {
					toast.error("Name, email and password are required");
					return;
				}

				const { error } = await authClient.admin.createUser({
					name,
					email,
					password,
					role,
				});

				if (error) {
					toast.error(`Failed to create user: ${error.message}`);
					return;
				}

				toast.success("User created successfully");
				await revalidateUsersLayout();
				router.push("/users");
			} else {
				// Update existing user - only role and ban status can be changed
				const originalRole = user.role;
				const originalBanned = user.banned ?? false;

				// Update role if changed
				if (role !== originalRole) {
					const { error } = await authClient.admin.setRole({
						userId: user.id,
						role,
					});

					if (error) {
						toast.error(`Failed to update role: ${error.message}`);
						return;
					}
				}

				// Update ban status if changed
				if (banned !== originalBanned) {
					if (banned) {
						const { error } = await authClient.admin.banUser({
							userId: user.id,
							banReason: banReason || undefined,
							banExpiresIn: banExpiresInDays
								? banExpiresInDays * 24 * 60 * 60
								: undefined,
						});

						if (error) {
							toast.error(`Failed to ban user: ${error.message}`);
							return;
						}
					} else {
						const { error } = await authClient.admin.unbanUser({
							userId: user.id,
						});

						if (error) {
							toast.error(`Failed to unban user: ${error.message}`);
							return;
						}
					}
				}

				toast.success("User updated successfully");
				await revalidateUsersLayout();
			}
		} catch (error) {
			toast.error(
				`Failed to ${isNew ? "create" : "update"} user: ${error instanceof Error ? error.message : "Unknown error"}`,
			);
		} finally {
			setIsSubmitting(false);
		}
	};

	const handleDelete = async () => {
		setIsDeleting(true);
		try {
			const { error } = await authClient.admin.removeUser({
				userId: user.id,
			});

			if (error) {
				toast.error(`Failed to delete user: ${error.message}`);
				return;
			}

			toast.success("User deleted successfully");
			await revalidateUsersLayout();
			router.push("/users");
		} catch (error) {
			toast.error(
				`Failed to delete user: ${error instanceof Error ? error.message : "Unknown error"}`,
			);
		} finally {
			setIsDeleting(false);
		}
	};

	const handleDiscard = () => {
		setName(user.name ?? "");
		setEmail(user.email ?? "");
		setPassword("");
		setRole((user.role as "user" | "admin") ?? "user");
		setBanned(user.banned ?? false);
		setBanReason(user.banReason ?? "");
		setBanExpiresInDays(null);
	};

	return (
		<form
			onSubmit={handleSubmit}
			className="flex flex-col mx-auto max-w-2xl w-full gap-4"
		>
			{/* Header */}
			<div className="flex gap-3 items-center">
				<Button variant="outline" size="icon" className="h-7 w-7" asChild>
					<Link href="/users">
						<ChevronLeft className="h-4 w-4" />
						<span className="sr-only">Back</span>
					</Link>
				</Button>

				<Avatar className="h-10 w-10">
					<AvatarImage src={user.image ?? undefined} />
					<AvatarFallback>{getInitials(name, email)}</AvatarFallback>
				</Avatar>

				<h1 className="flex-1 shrink-0 whitespace-nowrap text-xl font-semibold tracking-tight sm:grow-0">
					{isNew ? "New User" : name || "User"}
				</h1>

				{!isNew && role === "admin" && (
					<Badge className="bg-purple-500 text-white">Admin</Badge>
				)}
				{!isNew && banned && <Badge variant="destructive">Banned</Badge>}
			</div>

			{/* Action buttons */}
			<div className="flex justify-end gap-3">
				{!isNew && (
					<Dialog>
						<DialogTrigger asChild>
							<Button variant="destructive" size="sm" type="button">
								Delete
							</Button>
						</DialogTrigger>
						<DialogContent>
							<DialogHeader>
								<DialogTitle>Delete user?</DialogTitle>
								<DialogDescription>
									This action cannot be undone. All user data will be deleted.
								</DialogDescription>
							</DialogHeader>
							<DialogFooter>
								<DialogClose asChild>
									<Button variant="outline" disabled={isDeleting}>
										Cancel
									</Button>
								</DialogClose>
								<Button
									variant="destructive"
									onClick={handleDelete}
									disabled={isDeleting}
								>
									{isDeleting ? (
										<>
											<Loader2 className="animate-spin" size={16} /> Deleting...
										</>
									) : (
										"Delete"
									)}
								</Button>
							</DialogFooter>
						</DialogContent>
					</Dialog>
				)}
				<Button
					variant="outline"
					size="sm"
					type="button"
					onClick={handleDiscard}
				>
					Discard
				</Button>
				<Button size="sm" type="submit" disabled={isSubmitting}>
					{isSubmitting ? (
						<>
							<Loader2 className="animate-spin" size={16} />
							{isNew ? "Creating..." : "Saving..."}
						</>
					) : isNew ? (
						"Create User"
					) : (
						"Save Changes"
					)}
				</Button>
			</div>

			{/* User Details Card */}
			<Card className="rounded-md">
				<CardHeader>
					<CardTitle>User Details</CardTitle>
					<CardDescription>
						{isNew
							? "Enter the new user information"
							: "View and manage user information"}
					</CardDescription>
				</CardHeader>
				<CardContent className="space-y-4">
					<div className="space-y-2">
						<Label htmlFor="name">Name</Label>
						<Input
							id="name"
							placeholder="John Doe"
							value={name}
							onChange={(e) => setName(e.target.value)}
							disabled={!isNew}
						/>
						{!isNew && (
							<p className="text-xs text-muted-foreground">
								Name cannot be changed by admin
							</p>
						)}
					</div>

					<div className="space-y-2">
						<Label htmlFor="email">Email</Label>
						<Input
							id="email"
							type="email"
							placeholder="john@example.com"
							value={email}
							onChange={(e) => setEmail(e.target.value)}
							disabled={!isNew}
						/>
						{!isNew && (
							<p className="text-xs text-muted-foreground">
								Email cannot be changed by admin
							</p>
						)}
					</div>

					{isNew && (
						<div className="space-y-2">
							<Label htmlFor="password">Password</Label>
							<Input
								id="password"
								type="password"
								placeholder="********"
								value={password}
								onChange={(e) => setPassword(e.target.value)}
							/>
							<p className="text-xs text-muted-foreground">
								Minimum 8 characters
							</p>
						</div>
					)}

					<div className="space-y-2">
						<Label htmlFor="role">Role</Label>
						<Select
							value={role}
							onValueChange={(v) => setRole(v as "user" | "admin")}
						>
							<SelectTrigger>
								<SelectValue placeholder="Select role" />
							</SelectTrigger>
							<SelectContent>
								<SelectItem value="user">User</SelectItem>
								<SelectItem value="admin">Admin</SelectItem>
							</SelectContent>
						</Select>
						<p className="text-xs text-muted-foreground">
							User permissions level
						</p>
					</div>
				</CardContent>
			</Card>

			{/* Ban Management Card - Only for existing users */}
			{!isNew && (
				<UserFormBan
					banned={banned}
					banReason={banReason}
					banExpiresInDays={banExpiresInDays}
					onBannedChange={setBanned}
					onBanReasonChange={setBanReason}
					onBanExpiresChange={setBanExpiresInDays}
				/>
			)}

			{/* User Stats Card - Only for existing users */}
			{!isNew && (
				<Card className="rounded-md">
					<CardHeader>
						<CardTitle>User Information</CardTitle>
						<CardDescription>Account details</CardDescription>
					</CardHeader>
					<CardContent>
						<div className="grid grid-cols-2 gap-4 text-sm">
							<div>
								<p className="text-muted-foreground">Email Verified</p>
								<p className="text-lg font-semibold">
									{user.emailVerified ? "Yes" : "No"}
								</p>
							</div>
							<div>
								<p className="text-muted-foreground">Member Since</p>
								<p className="text-lg font-semibold">
									{new Date(user.createdAt).toLocaleDateString()}
								</p>
							</div>
						</div>
					</CardContent>
				</Card>
			)}
		</form>
	);
};
