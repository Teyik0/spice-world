import { authClient } from "@spice-world/web/lib/utils";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { UserForm } from "./form";

export default async function UserDetailPage(props: {
	params: Promise<{ id: string }>;
}) {
	const { id } = await props.params;

	if (id === "new") {
		return (
			<main className="grid flex-1 items-start gap-4 p-4 sm:px-6 sm:py-0 md:gap-8">
				<UserForm
					user={{
						id: "new",
						name: null,
						email: null,
						emailVerified: false,
						image: null,
						role: "user",
						banned: false,
						banReason: null,
						banExpires: null,
						createdAt: new Date(),
					}}
					isNew
				/>
			</main>
		);
	}

	const h = await headers();
	// Fetch user by ID - listUsers with filter
	const { data } = await authClient.admin.listUsers({
		query: {
			limit: 1,
			filterField: "id",
			filterValue: id,
			filterOperator: "eq",
		},
		fetchOptions: {
			headers: h,
		},
	});

	const user = data?.users?.[0];
	if (!user) redirect("/users");

	return (
		<main className="grid flex-1 items-start gap-4 p-4 sm:px-6 sm:py-0 md:gap-8">
			<UserForm
				user={{
					id: user.id,
					name: user.name ?? null,
					email: user.email ?? null,
					emailVerified: user.emailVerified,
					image: user.image ?? null,
					role: user.role ?? "user",
					banned: user.banned ?? false,
					banReason: user.banReason ?? null,
					banExpires: user.banExpires ? new Date(user.banExpires) : null,
					createdAt: new Date(user.createdAt),
				}}
				isNew={false}
			/>
		</main>
	);
}
