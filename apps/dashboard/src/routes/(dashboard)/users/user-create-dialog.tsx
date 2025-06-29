import {
	FormError,
	formAction$,
	reset,
	useForm,
	valiForm$,
} from "@modular-forms/qwik";
import { component$, useSignal, useTask$ } from "@qwik.dev/core";
import { cn } from "@qwik-ui/utils";
import { LuLoader2, LuUserPlus, LuX } from "@qwikest/icons/lucide";
import type { UserWithRole } from "better-auth/plugins";
import { toast } from "qwik-sonner";
import * as v from "valibot";
import { TextInput } from "@/components/text-input";
import { Button, buttonVariants } from "@/components/ui/button";
import { Modal } from "@/components/ui/modal";
import { Select } from "@/components/ui/select";
import { authClient, getBetterAuthCookie } from "@/lib/auth-client";

const CreateUserSchema = v.object({
	name: v.pipe(
		v.string(),
		v.nonEmpty("Please enter the user name."),
		v.minLength(2, "Name must be at least 2 characters."),
	),
	email: v.pipe(
		v.string(),
		v.nonEmpty("Please enter the email."),
		v.email("Please enter a valid email address."),
	),
	password: v.pipe(
		v.string(),
		v.nonEmpty("Please enter a password."),
		v.minLength(8, "Password must be at least 8 characters."),
	),
	role: v.union(
		[v.literal("user"), v.literal("admin")],
		'Role must be either "user" or "admin".',
	),
});

export type CreateUserForm = v.InferInput<typeof CreateUserSchema>;

export const useFormAction = formAction$<CreateUserForm, UserWithRole>(
	async (values, { cookie }) => {
		const { data, error } = await authClient.admin.createUser(
			{
				name: values.name,
				email: values.email,
				password: values.password, // This will be hashed by Better Auth server
				role: values.role,
			},
			{
				headers: {
					cookie: getBetterAuthCookie(cookie),
				},
			},
		);

		if (data) {
			return {
				status: "success",
				message: "User created successfully",
				data: data.user,
			};
		}
		throw new FormError<CreateUserForm>(
			error.message || "Failed to create user",
		);
	},
	valiForm$(CreateUserSchema),
);

export const CreateUserDialog = component$(() => {
	const [form, { Form, Field }] = useForm<CreateUserForm, UserWithRole>({
		loader: { value: { name: "", email: "", password: "", role: "user" } },
		action: useFormAction(),
		validate: valiForm$(CreateUserSchema),
	});

	const show = useSignal(false);

	useTask$(({ track }) => {
		const formdata = track(form);
		if (formdata.response.status === "success") {
			toast.success("User created successfully");
			reset(form);
			show.value = false;
		}
		if (formdata.response.status === "error") {
			toast.error(formdata.response.message);
			formdata.response.status = undefined;
			show.value = false;
		}
	});

	return (
		<Modal.Root bind:show={show}>
			<Modal.Trigger class={[buttonVariants({ look: "primary", size: "md" })]}>
				<LuUserPlus class="mr-2 h-4 w-4" />
				Add User
			</Modal.Trigger>
			<Modal.Panel
				class="max-h-[90vh] max-w-lg overflow-auto"
				position="center"
			>
				<Modal.Title>Create New User</Modal.Title>
				<Modal.Description>
					Add a new user to the system. They will receive an email with account
					details.
				</Modal.Description>

				<Form class="mt-6 grid gap-4">
					<Field name="name">
						{(field, props) => (
							<TextInput
								{...props}
								error={field.error}
								label="Full Name"
								placeholder="John Doe"
								required
								type="text"
								value={field.value}
							/>
						)}
					</Field>

					<Field name="email">
						{(field, props) => (
							<TextInput
								{...props}
								error={field.error}
								label="Email Address"
								placeholder="john@example.com"
								required
								type="email"
								value={field.value}
							/>
						)}
					</Field>

					<Field name="password">
						{(field, props) => (
							<TextInput
								{...props}
								error={field.error}
								label="Password"
								placeholder="Min. 8 characters"
								required
								type="password"
								value={field.value}
							/>
						)}
					</Field>

					<Field name="role">
						{(field, props) => (
							<Select
								{...props}
								error={field.error}
								label="Role"
								options={[
									{ label: "USER", value: "user" },
									{ label: "ADMIN", value: "admin" },
								]}
								value={field.value}
							/>
						)}
					</Field>

					<footer class="mt-4 flex justify-end gap-4">
						<Button
							disabled={form.submitting}
							look="secondary"
							onClick$={() => (show.value = false)}
							size="md"
							type="button"
						>
							Cancel
						</Button>
						<Button
							disabled={form.submitting}
							look="primary"
							size="md"
							type="submit"
						>
							{form.submitting ? (
								<>
									<LuLoader2 class="mr-2 h-4 w-4 animate-spin" />
									Creating...
								</>
							) : (
								<>
									<LuUserPlus class="mr-2 h-4 w-4" />
									Create User
								</>
							)}
						</Button>
					</footer>
				</Form>

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
});
