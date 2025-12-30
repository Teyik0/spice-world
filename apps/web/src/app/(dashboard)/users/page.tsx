import {
	Card,
	CardContent,
	CardHeader,
	CardTitle,
} from "@spice-world/web/components/ui/card";
import { authClient } from "@spice-world/web/lib/utils";
import {
	MailCheck,
	Shield,
	UserCheck,
	UserPlus,
	Users,
	UserX,
} from "lucide-react";
import { headers } from "next/headers";

export default async function UsersPage() {
	const h = await headers();
	// Fetch all users to compute stats
	const { data } = await authClient.admin.listUsers({
		query: {
			limit: 1000,
		},
		fetchOptions: {
			headers: h,
		},
	});

	const users = data?.users ?? [];
	const total = data?.total ?? 0;

	// Compute stats from users list
	const activeUsers = users.filter((u) => !u.banned).length;
	const bannedUsers = users.filter((u) => u.banned).length;
	const adminCount = users.filter((u) => u.role === "admin").length;
	const verifiedUsers = users.filter((u) => u.emailVerified).length;

	// New users this month
	const oneMonthAgo = new Date();
	oneMonthAgo.setMonth(oneMonthAgo.getMonth() - 1);
	const newUsersThisMonth = users.filter(
		(u) => new Date(u.createdAt) > oneMonthAgo,
	).length;

	const stats = [
		{
			title: "Total Users",
			value: total,
			description: "All registered users",
			icon: Users,
		},
		{
			title: "Active Users",
			value: activeUsers,
			description: "Users not banned",
			icon: UserCheck,
		},
		{
			title: "Banned Users",
			value: bannedUsers,
			description: "Currently banned",
			icon: UserX,
		},
		{
			title: "Administrators",
			value: adminCount,
			description: "Admin role users",
			icon: Shield,
		},
		{
			title: "New This Month",
			value: newUsersThisMonth,
			description: "Registered this month",
			icon: UserPlus,
		},
		{
			title: "Email Verified",
			value: `${verifiedUsers} / ${total}`,
			description: "Verified vs total",
			icon: MailCheck,
		},
	];

	return (
		<div className="space-y-6">
			<div>
				<h2 className="text-2xl font-bold tracking-tight">Users Overview</h2>
				<p className="text-muted-foreground">
					Manage user accounts and permissions
				</p>
			</div>

			<div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
				{stats.map((stat) => (
					<Card key={stat.title}>
						<CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
							<CardTitle className="text-sm font-medium">
								{stat.title}
							</CardTitle>
							<stat.icon className="h-4 w-4 text-muted-foreground" />
						</CardHeader>
						<CardContent>
							<div className="text-2xl font-bold">{stat.value}</div>
							<p className="text-xs text-muted-foreground">
								{stat.description}
							</p>
						</CardContent>
					</Card>
				))}
			</div>
		</div>
	);
}
