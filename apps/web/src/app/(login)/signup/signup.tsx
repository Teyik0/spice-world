"use client";

import { Form, useForm } from "@spice-world/web/components/tanstack-form";
import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from "@spice-world/web/components/ui/card";
import { FieldGroup } from "@spice-world/web/components/ui/field";
import { Input } from "@spice-world/web/components/ui/input";
import { authClient } from "@spice-world/web/lib/utils";
import { useStore } from "@tanstack/react-store";
import { t } from "elysia";
import { X } from "lucide-react";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { passwordValidation } from "../utils";

const signupFormSchema = t.Object({
	firstName: t.String({
		minLength: 2,
		error: "First name must be at least 2 characters",
	}),
	lastName: t.String({
		minLength: 2,
		error: "Last name must be at least 2 characters",
	}),
	email: t.String({
		format: "email",
		error: "Please enter a valid email address",
	}),
	password: passwordValidation,
	passwordConfirmation: t.String(),
	image: t.Nullable(t.File()),
	imagePreview: t.Nullable(t.String()),
});

export function SignUp() {
	const router = useRouter();

	const form = useForm({
		schema: signupFormSchema,
		validationMode: "onSubmit",
		defaultValues: {
			firstName: "",
			lastName: "",
			email: "",
			password: "",
			passwordConfirmation: "",
			image: null,
			imagePreview: null,
		},
		onSubmit: async (values) => {
			try {
				await authClient.signUp.email({
					email: values.email,
					password: values.password,
					name: `${values.firstName} ${values.lastName}`,
					image: values.image
						? await convertImageToBase64(values.image as File)
						: "",
					callbackURL: "http://localhost:3000/",
					fetchOptions: {
						onSuccess: async () => {
							toast.success("Account created successfully!", {
								description: "Welcome to Spice World",
							});
							router.push("/");
						},
						onError: (ctx) => {
							toast.error("Sign up failed", {
								description:
									ctx.error.message ||
									"Please check your information and try again.",
							});
						},
					},
				});
			} catch (_error: unknown) {
				toast.error("An unexpected error occurred", {
					description: "Please try again later.",
				});
			}
		},
	});

	// Access imagePreview from form state for display
	const imagePreview = useStore(
		form.store,
		(state) => state.values.imagePreview,
	);

	return (
		<Card className="rounded-tl-none shadow-xl">
			<CardHeader className="space-y-2 pb-4">
				<CardTitle className="text-2xl font-bold">Create an account</CardTitle>
				<CardDescription className="text-sm">
					Get started by creating your account
				</CardDescription>
			</CardHeader>
			<CardContent>
				<Form form={form} className="grid gap-4">
					<FieldGroup className="gap-4">
						<div className="grid grid-cols-2 gap-4">
							<form.AppField name="firstName">
								{(field) => (
									<field.Field>
										<field.Label>First name</field.Label>
										<field.Input type="text" placeholder="Max" />
										<field.Message />
									</field.Field>
								)}
							</form.AppField>

							<form.AppField name="lastName">
								{(field) => (
									<field.Field>
										<field.Label>Last name</field.Label>
										<field.Input type="text" placeholder="Robinson" />
										<field.Message />
									</field.Field>
								)}
							</form.AppField>
						</div>

						<form.AppField name="email">
							{(field) => (
								<field.Field>
									<field.Label>Email</field.Label>
									<field.Input
										placeholder="maxrobinson@gmail.com"
										type="email"
									/>
									<field.Message />
								</field.Field>
							)}
						</form.AppField>

						<form.AppField name="password">
							{(field) => (
								<field.Field>
									<field.Label>Password</field.Label>
									<field.Input
										autoComplete="new-password"
										type="password"
										placeholder="********"
									/>
									<field.Message />
								</field.Field>
							)}
						</form.AppField>

						<form.AppField
							name="passwordConfirmation"
							validators={{
								onSubmit: ({ value }) => {
									return value !== form.state.values.password
										? "Passwords must match"
										: undefined;
								},
							}}
						>
							{(field) => (
								<field.Field>
									<field.Label htmlFor={field.name}>
										Password confirmation
									</field.Label>
									<field.Input
										autoComplete="new-password"
										type="password"
										placeholder="********"
									/>
									<field.Message />
								</field.Field>
							)}
						</form.AppField>

						<form.AppField
							name="image"
							validators={{
								onChange: () => {
									if (!form.state.values.image) return;
									const MAX_SIZE = 1 * 1024 * 1024; // 1MB in bytes
									return form.state.values.image.size > MAX_SIZE
										? "Image size limit is 1Mb"
										: undefined;
								},
							}}
						>
							{(field) => (
								<field.Field>
									<field.Label>Profile Image (optional)</field.Label>
									<field.Content className="flex flex-row items-end gap-4">
										{imagePreview && (
											<div className="relative w-42 h-24 rounded-sm overflow-hidden">
												<Image
													src={imagePreview}
													alt="Profile preview"
													fill
													className="object-cover"
												/>
											</div>
										)}
										<div className="flex items-center gap-2 w-full">
											<Input
												id={field.name}
												type="file"
												accept="image/*"
												onChange={(e) => {
													const file = e.target.files?.[0];
													if (file) {
														field.handleChange(file);
														const reader = new FileReader();
														reader.onloadend = () => {
															form.setFieldValue(
																"imagePreview",
																reader.result as string,
															);
														};
														reader.readAsDataURL(file);
													}
												}}
												className="w-full"
											/>
											{imagePreview && (
												<X
													className="cursor-pointer shrink-0"
													onClick={() => {
														field.handleChange(null);
														form.setFieldValue("imagePreview", null);
													}}
												/>
											)}
										</div>
									</field.Content>
									<field.Message />
								</field.Field>
							)}
						</form.AppField>
					</FieldGroup>

					<form.SubmitButton type="submit">Create an account</form.SubmitButton>
				</Form>
			</CardContent>
		</Card>
	);
}

async function convertImageToBase64(file: File): Promise<string> {
	return new Promise((resolve, reject) => {
		const reader = new FileReader();
		reader.onloadend = () => resolve(reader.result as string);
		reader.onerror = reject;
		reader.readAsDataURL(file);
	});
}
