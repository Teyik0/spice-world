"use client";

import { useForm } from "@tanstack/react-form";
import { useStore } from "@tanstack/react-store";
import { Loader2, X } from "lucide-react";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { z } from "zod";
import { Button } from "@/components/ui/button";
import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from "@/components/ui/card";
import {
	Field,
	FieldError,
	FieldGroup,
	FieldLabel,
} from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { authClient } from "@/lib/utils";
import { passwordValidation } from "../utils";

const signupFormSchema = z
	.object({
		firstName: z.string().min(2, "First name must be at least 2 characters"),
		lastName: z.string().min(2, "Last name must be at least 2 characters"),
		email: z.email("Please enter a valid email address"),
		password: passwordValidation,
		passwordConfirmation: z.string(),
		image: z.instanceof(File).nullable(),
		imagePreview: z.string().nullable(),
	})
	.refine((data) => data.password === data.passwordConfirmation, {
		message: "Passwords must match",
		path: ["passwordConfirmation"],
	});

export function SignUp() {
	const router = useRouter();

	const form = useForm({
		defaultValues: {
			firstName: "",
			lastName: "",
			email: "",
			password: "",
			passwordConfirmation: "",
			image: null as File | null,
			imagePreview: null as string | null,
		},
		validators: {
			onSubmit: signupFormSchema,
		},
		onSubmit: async ({ value }) => {
			try {
				await authClient.signUp.email({
					email: value.email,
					password: value.password,
					name: `${value.firstName} ${value.lastName}`,
					image: value.image ? await convertImageToBase64(value.image) : "",
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
				<form
					className="grid gap-4"
					onSubmit={(e) => {
						e.preventDefault();
						form.handleSubmit();
					}}
				>
					<FieldGroup className="gap-4">
						<div className="grid grid-cols-2 gap-4">
							<form.Field
								name="firstName"
								children={(field) => {
									const isInvalid =
										field.state.meta.isTouched && !field.state.meta.isValid;
									return (
										<Field data-invalid={isInvalid}>
											<FieldLabel htmlFor={field.name}>First name</FieldLabel>
											<Input
												id={field.name}
												name={field.name}
												value={field.state.value}
												onBlur={field.handleBlur}
												onChange={(e) => field.handleChange(e.target.value)}
												aria-invalid={isInvalid}
												placeholder="Max"
												autoComplete="off"
												type="text"
											/>
											{isInvalid && (
												<FieldError errors={field.state.meta.errors} />
											)}
										</Field>
									);
								}}
							/>
							<form.Field
								name="lastName"
								children={(field) => {
									const isInvalid =
										field.state.meta.isTouched && !field.state.meta.isValid;
									return (
										<Field data-invalid={isInvalid}>
											<FieldLabel htmlFor={field.name}>Last name</FieldLabel>
											<Input
												id={field.name}
												name={field.name}
												value={field.state.value}
												onBlur={field.handleBlur}
												onChange={(e) => field.handleChange(e.target.value)}
												aria-invalid={isInvalid}
												placeholder="Robinson"
												autoComplete="off"
												type="text"
											/>
											{isInvalid && (
												<FieldError errors={field.state.meta.errors} />
											)}
										</Field>
									);
								}}
							/>
						</div>
						<form.Field
							name="email"
							children={(field) => {
								const isInvalid =
									field.state.meta.isTouched && !field.state.meta.isValid;
								return (
									<Field data-invalid={isInvalid}>
										<FieldLabel htmlFor={field.name}>Email</FieldLabel>
										<Input
											id={field.name}
											name={field.name}
											value={field.state.value}
											onBlur={field.handleBlur}
											onChange={(e) => field.handleChange(e.target.value)}
											aria-invalid={isInvalid}
											placeholder="maxrobinson@gmail.com"
											autoComplete="off"
											type="email"
										/>
										{isInvalid && (
											<FieldError errors={field.state.meta.errors} />
										)}
									</Field>
								);
							}}
						/>
						<form.Field
							name="password"
							children={(field) => {
								const isInvalid =
									field.state.meta.isTouched && !field.state.meta.isValid;
								return (
									<Field data-invalid={isInvalid}>
										<FieldLabel htmlFor={field.name}>Password</FieldLabel>
										<Input
											id={field.name}
											name={field.name}
											value={field.state.value}
											onBlur={field.handleBlur}
											onChange={(e) => field.handleChange(e.target.value)}
											aria-invalid={isInvalid}
											autoComplete="new-password"
											type="password"
											placeholder="********"
										/>
										{isInvalid && (
											<FieldError errors={field.state.meta.errors} />
										)}
									</Field>
								);
							}}
						/>
						<form.Field
							name="passwordConfirmation"
							children={(field) => {
								const isInvalid =
									field.state.meta.isTouched && !field.state.meta.isValid;
								return (
									<Field data-invalid={isInvalid}>
										<FieldLabel htmlFor={field.name}>
											Password confirmation
										</FieldLabel>
										<Input
											id={field.name}
											name={field.name}
											value={field.state.value}
											onBlur={field.handleBlur}
											onChange={(e) => field.handleChange(e.target.value)}
											aria-invalid={isInvalid}
											autoComplete="new-password"
											type="password"
											placeholder="********"
										/>
										{isInvalid && (
											<FieldError errors={field.state.meta.errors} />
										)}
									</Field>
								);
							}}
						/>
						<form.Field
							name="image"
							children={(field) => {
								return (
									<Field>
										<FieldLabel htmlFor={field.name}>
											Profile Image (optional)
										</FieldLabel>
										<div className="flex items-end gap-4">
											{imagePreview && (
												<div className="relative w-16 h-16 rounded-sm overflow-hidden">
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
										</div>
									</Field>
								);
							}}
						/>
					</FieldGroup>

					<form.Subscribe
						selector={(state) => [state.canSubmit, state.isSubmitting]}
					>
						{([canSubmit, isSubmitting]) => (
							<Button
								type="submit"
								className="w-full"
								disabled={!canSubmit || isSubmitting}
							>
								{isSubmitting ? (
									<Loader2 size={16} className="animate-spin" />
								) : (
									"Create an account"
								)}
							</Button>
						)}
					</form.Subscribe>
				</form>
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
