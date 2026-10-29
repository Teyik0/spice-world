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
  SelectGroup,
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
  banExpires: Date | null;
  banned: boolean | null;
  banReason: string | null;
  createdAt: Date;
  email: string | null;
  emailVerified: boolean;
  id: string;
  image: string | null;
  name: string | null;
  role: string | null;
}

interface UserFormProps {
  isNew: boolean;
  user: User;
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
    (user.role as "user" | "admin") ?? "user"
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
        if (!(name && email && password)) {
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
        `Failed to ${isNew ? "create" : "update"} user: ${error instanceof Error ? error.message : "Unknown error"}`
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
        `Failed to delete user: ${error instanceof Error ? error.message : "Unknown error"}`
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
      className="mx-auto flex w-full max-w-2xl flex-col gap-4"
      onSubmit={handleSubmit}
    >
      {/* Header */}
      <div className="flex items-center gap-3">
        <Button
          className="h-7 w-7"
          nativeButton={false}
          render={
            <Link href="/users">
              <ChevronLeft className="h-4 w-4" />
              <span className="sr-only">Back</span>
            </Link>
          }
          size="icon"
          variant="outline"
        />

        <Avatar className="h-10 w-10">
          <AvatarImage src={user.image ?? undefined} />
          <AvatarFallback>{getInitials(name, email)}</AvatarFallback>
        </Avatar>

        <h1 className="flex-1 shrink-0 text-xl font-semibold tracking-tight whitespace-nowrap sm:grow-0">
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
            <DialogTrigger
              render={
                <Button size="sm" type="button" variant="destructive">
                  Delete
                </Button>
              }
            />
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Delete user?</DialogTitle>
                <DialogDescription>
                  This action cannot be undone. All user data will be deleted.
                </DialogDescription>
              </DialogHeader>
              <DialogFooter>
                <DialogClose
                  render={
                    <Button disabled={isDeleting} variant="outline">
                      Cancel
                    </Button>
                  }
                />
                <Button
                  disabled={isDeleting}
                  onClick={handleDelete}
                  variant="destructive"
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
          onClick={handleDiscard}
          size="sm"
          type="button"
          variant="outline"
        >
          Discard
        </Button>
        <Button disabled={isSubmitting} size="sm" type="submit">
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
              disabled={!isNew}
              id="name"
              onChange={(e) => setName(e.target.value)}
              placeholder="John Doe"
              value={name}
            />
            {!isNew && (
              <p className="text-muted-foreground text-xs">
                Name cannot be changed by admin
              </p>
            )}
          </div>

          <div className="space-y-2">
            <Label htmlFor="email">Email</Label>
            <Input
              disabled={!isNew}
              id="email"
              onChange={(e) => setEmail(e.target.value)}
              placeholder="john@example.com"
              type="email"
              value={email}
            />
            {!isNew && (
              <p className="text-muted-foreground text-xs">
                Email cannot be changed by admin
              </p>
            )}
          </div>

          {isNew && (
            <div className="space-y-2">
              <Label htmlFor="password">Password</Label>
              <Input
                id="password"
                onChange={(e) => setPassword(e.target.value)}
                placeholder="********"
                type="password"
                value={password}
              />
              <p className="text-muted-foreground text-xs">
                Minimum 8 characters
              </p>
            </div>
          )}

          <div className="space-y-2">
            <Label htmlFor="role">Role</Label>
            <Select
              items={[
                { value: "user", label: "User" },
                { value: "admin", label: "Admin" },
              ]}
              onValueChange={(v) => setRole(v as "user" | "admin")}
              value={role}
            >
              <SelectTrigger>
                <SelectValue placeholder="Select role" />
              </SelectTrigger>
              <SelectContent>
                <SelectGroup>
                  <SelectItem value="user">User</SelectItem>
                  <SelectItem value="admin">Admin</SelectItem>
                </SelectGroup>
              </SelectContent>
            </Select>
            <p className="text-muted-foreground text-xs">
              User permissions level
            </p>
          </div>
        </CardContent>
      </Card>

      {/* Ban Management Card - Only for existing users */}
      {!isNew && (
        <UserFormBan
          banExpiresInDays={banExpiresInDays}
          banned={banned}
          banReason={banReason}
          onBanExpiresChange={setBanExpiresInDays}
          onBannedChange={setBanned}
          onBanReasonChange={setBanReason}
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
