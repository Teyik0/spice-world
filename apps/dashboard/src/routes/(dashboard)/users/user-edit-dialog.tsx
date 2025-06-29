import { $, component$, useSignal } from "@qwik.dev/core";
import { cn } from "@qwik-ui/utils";
import { LuLoader2, LuPencil, LuX } from "@qwikest/icons/lucide";
import type { UserWithRole } from "better-auth/plugins";
import { toast } from "qwik-sonner";
import { Button, buttonVariants } from "@/components/ui/button";
import { Modal } from "@/components/ui/modal";
import { Select } from "@/components/ui/select";
import { useEditUserRole } from "./layout";

export const EditUserDialog = component$(({ user }: { user: UserWithRole }) => {
	const action = useEditUserRole();
	const show = useSignal(false);
	const loading = useSignal(false);
	const role = useSignal(user.role);

	const handleEdit = $(async () => {
		loading.value = true;
		show.value = false;

		toast.promise(action.submit({ userId: user.id, role: role.value }), {
			loading: `Updating role for ${user.name || user.email}`,
			success: "User role updated successfully",
			error: "Failed to update user role",
		});
		loading.value = false;
	});

	return (
		<Modal.Root bind:show={show}>
			<Modal.Trigger class={[buttonVariants({ look: "outline", size: "sm" })]}>
				<LuPencil class="size-4" />
				<span class="sr-only">Edit user</span>
			</Modal.Trigger>
			<Modal.Panel
				class="max-h-[90vh] max-w-md overflow-auto"
				position="center"
			>
				<Modal.Title>Edit User Role</Modal.Title>
				<Modal.Description>
					Update the role for {user.name || user.email}. This action will change
					their permissions.
				</Modal.Description>
				<div class="mt-6 grid gap-4">
					<Select
						label="Role"
						name="Rôle"
						onInput$={(_, el) => (role.value = el.value)}
						options={[
							{ label: "USER", value: "user" },
							{ label: "ADMIN", value: "admin" },
						]}
						required
						value={role.value}
					/>
					<footer class="flex justify-end gap-4">
						<Button
							class="font-medium"
							disabled={loading.value}
							look="secondary"
							onClick$={() => (show.value = false)}
							size="md"
							type="button"
						>
							Cancel
						</Button>
						<Button
							class="font-medium"
							disabled={loading.value}
							look="primary"
							onClick$={handleEdit}
							size="md"
							type="button"
						>
							{loading.value ? (
								<LuLoader2 class="h-4 w-4 animate-spin" />
							) : (
								"Save Changes"
							)}
						</Button>
					</footer>
				</div>
				<Modal.Close
					class={cn(
						buttonVariants({ size: "icon", look: "link" }),
						"absolute top-2 right-3",
					)}
					type="button"
				>
					<LuX class="h-5 w-5" />
				</Modal.Close>
			</Modal.Panel>
		</Modal.Root>
	);
});
