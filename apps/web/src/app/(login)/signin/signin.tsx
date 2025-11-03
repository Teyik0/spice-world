"use client";

import { useForm } from "@tanstack/react-form";
import { Loader2 } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
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
import { Checkbox } from "@/components/ui/checkbox";
import {
	Field,
	FieldError,
	FieldGroup,
	FieldLabel,
} from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { authClient } from "@/lib/utils";
import { setSignInCookie } from "./cookies.action";

interface SignInProps {
	rememberMe: boolean;
	lastEmail: string;
}

const signinFormSchema = z.object({
	email: z.email("Please enter a valid email address"),
	password: z.string().min(1, "Password is required"),
	rememberMe: z.boolean(),
});

export function SignIn({ rememberMe = true, lastEmail = "" }: SignInProps) {
	const router = useRouter();
	const [googleLoading, setGoogleLoading] = useState(false);

	const form = useForm({
		defaultValues: {
			email: lastEmail,
			password: "",
			rememberMe,
		},
		validators: {
			onSubmit: signinFormSchema,
		},
		onSubmit: async ({ value }) => {
			try {
				await authClient.signIn.email(
					{
						email: value.email,
						password: value.password,
						callbackURL: "http://localhost:3000/",
						rememberMe: value.rememberMe,
					},
					{
						onSuccess: () => {
							setSignInCookie(
								value.rememberMe,
								value.rememberMe ? value.email : "",
							);
							toast.success("Welcome back!", {
								description: "You have successfully signed in.",
							});
							router.push("/");
						},
						onError: (ctx) => {
							toast.error("Sign in failed", {
								description:
									ctx.error.message ||
									"Invalid email or password. Please try again.",
							});
						},
					},
				);
			} catch (_error: unknown) {
				toast.error("An unexpected error occurred", {
					description: "Please try again later.",
				});
			}
		},
	});

	return (
		<Card className="rounded-tl-none shadow-xl">
			<CardHeader className="space-y-2 pb-4">
				<CardTitle className="text-2xl font-bold">Welcome back</CardTitle>
				<CardDescription className="text-sm">
					Sign in to your account to continue
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
											type="email"
											placeholder="max@example.com"
											value={field.state.value}
											onBlur={field.handleBlur}
											onChange={(e) => field.handleChange(e.target.value)}
											aria-invalid={isInvalid}
											autoComplete="email"
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
										<div className="flex items-center">
											<FieldLabel htmlFor={field.name}>Password</FieldLabel>
											<Link
												href="#"
												className="ml-auto inline-block text-sm underline"
											>
												Forgot your password?
											</Link>
										</div>
										<Input
											id={field.name}
											name={field.name}
											type="password"
											placeholder="password"
											value={field.state.value}
											onBlur={field.handleBlur}
											onChange={(e) => field.handleChange(e.target.value)}
											aria-invalid={isInvalid}
											autoComplete="current-password"
										/>
										{isInvalid && (
											<FieldError errors={field.state.meta.errors} />
										)}
									</Field>
								);
							}}
						/>

						<form.Field
							name="rememberMe"
							children={(field) => {
								return (
									<div className="flex items-center gap-2">
										<Checkbox
											id={field.name}
											checked={field.state.value}
											onCheckedChange={(checked) =>
												field.handleChange(checked === true)
											}
											aria-checked={field.state.value}
											data-state={field.state.value ? "checked" : "unchecked"}
										/>
										<Label htmlFor={field.name}>Remember me</Label>
									</div>
								);
							}}
						/>

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
										"Login"
									)}
								</Button>
							)}
						</form.Subscribe>
					</FieldGroup>
				</form>

				<Button
					variant="outline"
					className="mt-4 w-full"
					disabled={googleLoading}
					onClick={async () => {
						setGoogleLoading(true);
						try {
							await authClient.signIn.social(
								{
									provider: "google",
									callbackURL: "http://localhost:3000/",
									errorCallbackURL: "http://localhost:3000/signin",
								},
								{
									onSuccess: () => {
										router.push("/");
									},
									onError: () => {
										setGoogleLoading(false);
									},
								},
							);
						} catch {
							setGoogleLoading(false);
						}
					}}
				>
					<svg
						xmlns="http://www.w3.org/2000/svg"
						width="0.98em"
						height="1em"
						viewBox="0 0 256 262"
					>
						<title>Google Logo</title>
						<path
							fill="#4285F4"
							d="M255.878 133.451c0-10.734-.871-18.567-2.756-26.69H130.55v48.448h71.947c-1.45 12.04-9.283 30.172-26.69 42.356l-.244 1.622l38.755 30.023l2.685.268c24.659-22.774 38.875-56.282 38.875-96.027"
						></path>
						<path
							fill="#34A853"
							d="M130.55 261.1c35.248 0 64.839-11.605 86.453-31.622l-41.196-31.913c-11.024 7.688-25.82 13.055-45.257 13.055c-34.523 0-63.824-22.773-74.269-54.25l-1.531.13l-40.298 31.187l-.527 1.465C35.393 231.798 79.49 261.1 130.55 261.1"
						></path>
						<path
							fill="#FBBC05"
							d="M56.281 156.37c-2.756-8.123-4.351-16.827-4.351-25.82c0-8.994 1.595-17.697 4.206-25.82l-.073-1.73L15.26 71.312l-1.335.635C5.077 89.644 0 109.517 0 130.55s5.077 40.905 13.925 58.602z"
						></path>
						<path
							fill="#EB4335"
							d="M130.55 50.479c24.514 0 41.05 10.589 50.479 19.438l36.844-35.974C195.245 12.91 165.798 0 130.55 0C79.49 0 35.393 29.301 13.925 71.947l42.211 32.783c10.59-31.477 39.891-54.251 74.414-54.251"
						></path>
					</svg>
					Sign in with Google
				</Button>
			</CardContent>
		</Card>
	);
}
