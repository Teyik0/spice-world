import { $, component$, useSignal } from "@qwik.dev/core";
import { cn } from "@qwik-ui/utils";
import {
	LuAlertTriangle,
	LuLoader2,
	LuTrash2,
	LuX,
} from "@qwikest/icons/lucide";
import type { UserWithRole } from "better-auth/plugins";
import { toast } from "qwik-sonner";
import { Button, buttonVariants } from "@/components/ui/button";
import { Modal } from "@/components/ui/modal";
import { useDeleteUser } from "./layout";

export const DeleteUserDialog = component$(
	({ user }: { user: UserWithRole }) => {
		const action = useDeleteUser();

		const show = useSignal(false);
		const loading = useSignal(false);

		const handleDelete = $(async () => {
			loading.value = true;
			show.value = false;

			toast.promise(action.submit({ userId: user.id }), {
				loading: `Deleting user: ${user.name}`,
				success: "User deleted successfully",
				error: "Failed to delete user",
			});
			loading.value = false;
		});

		return (
			<Modal.Root bind:show={show}>
				<Modal.Trigger
					class={[buttonVariants({ look: "destructive", size: "sm" })]}
				>
					<LuTrash2 class="size-4" />
					<span class="sr-only">Delete user</span>
				</Modal.Trigger>
				<Modal.Panel
					class="max-h-[90vh] max-w-lg overflow-auto"
					position="center"
				>
					<div class="mb-4 flex items-center gap-3">
						<div class="flex h-10 w-10 items-center justify-center rounded-full bg-destructive/10">
							<LuAlertTriangle class="h-5 w-5 text-destructive" />
						</div>
						<div>
							<Modal.Title class="font-semibold text-lg">
								Delete User
							</Modal.Title>
							<Modal.Description class="text-muted-foreground text-sm">
								This action cannot be undone.
							</Modal.Description>
						</div>
					</div>

					<div class="mb-6 rounded-lg border bg-muted/50 p-4">
						<div class="text-sm">
							<p class="mb-1 font-medium">You are about to delete:</p>
							<p class="text-muted-foreground">
								<span class="font-medium">{user.name}</span>
								<br />
								<span class="text-xs">{user.email}</span>
							</p>
						</div>
					</div>
					<footer class="mt-4 flex justify-end gap-4">
						<Button
							disabled={loading.value}
							look="secondary"
							onClick$={() => (show.value = false)}
							size="md"
							type="button"
						>
							Cancel
						</Button>
						<Button
							disabled={loading.value}
							look="destructive"
							onClick$={handleDelete}
							size="md"
							type="submit"
						>
							{loading.value ? (
								<>
									<LuLoader2 class="mr-2 h-4 w-4 animate-spin" />
									Deleting...
								</>
							) : (
								<>
									<LuTrash2 class="mr-2 h-4 w-4" />
									Delete User
								</>
							)}
						</Button>
					</footer>

					<Modal.Close
						class={cn(
							buttonVariants({ size: "icon", look: "ghost" }),
							"absolute top-3 right-3",
						)}
						type="button"
					>
						<LuX class="h-4 w-4" />
					</Modal.Close>
				</Modal.Panel>
			</Modal.Root>
		);
	},
);
