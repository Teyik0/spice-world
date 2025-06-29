import {
	FormError,
	formAction$,
	type InitialValues,
	useForm,
	valiForm$,
} from "@modular-forms/qwik";
import { $, component$, useSignal, useTask$ } from "@qwik.dev/core";
import { Link, routeLoader$, useLocation } from "@qwik.dev/router";
import { LuLoader2 } from "@qwikest/icons/lucide";
import { toast } from "qwik-sonner";
import * as v from "valibot";
import { TextInput } from "@/components/text-input";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { signIn } from "@/lib/auth-client";

export const useSignInFormLoader = routeLoader$<InitialValues<SignInForm>>(
	({ cookie }) => {
		return {
			email: cookie.get("email")?.value ?? "",
			password: "",
			rememberme: Boolean(cookie.get("rememberme")?.value) ?? true,
		};
	},
);

const SignInSchema = v.object({
	email: v.pipe(
		v.string(),
		v.nonEmpty("Please enter your email."),
		v.email("The email address is badly formatted."),
	),
	password: v.pipe(
		v.string(),
		v.nonEmpty("Please enter your password."),
		v.minLength(8, "Your password must have 8 characters or more."),
	),
	rememberme: v.boolean(),
});

export type SignInForm = v.InferInput<typeof SignInSchema>;

export const useFormSignInAction = formAction$<SignInForm>(
	async (values, { cookie, redirect }) => {
		if (values.rememberme) {
			cookie.set("rememberme", "true", {
				path: "/",
				maxAge: 60 * 60 * 24 * 30,
			}); // 30 days
			cookie.set("email", values.email, {
				path: "/",
				maxAge: 60 * 60 * 24 * 30,
			}); // 30 days
		} else {
			cookie.delete("rememberme", { path: "/" });
			cookie.delete("email", { path: "/" });
		}

		cookie.delete("better-auth.session_token");

		const { data, error } = await signIn.email({
			email: values.email,
			password: values.password,
			callbackURL: "/",
		});
		if (data) {
			throw redirect(307, "/");
		}
		throw new FormError<SignInForm>(error?.message || "Unknown error");
	},
	valiForm$(SignInSchema),
);

export default component$(() => {
	const [loginForm, { Form, Field }] = useForm<SignInForm>({
		loader: useSignInFormLoader(),
		action: useFormSignInAction(),
		validate: valiForm$(SignInSchema),
	});

	const loc = useLocation();
	const googleLoading = useSignal(false);

	const signInGoogle = $(async () => {
		const data = signIn.social(
			{
				provider: "google",
				callbackURL: loc.url.origin,
				errorCallbackURL: loc.url.href,
			},
			{
				onRequest() {
					googleLoading.value = true;
				},
				onResponse() {
					googleLoading.value = false;
				},
			},
		);
		toast.promise(data, {
			loading: "Google login...",
			success: "Login success",
			error: "Google login failed",
		});
	});

	useTask$(({ track }) => {
		const login = track(loginForm);
		if (login.response.status === "error") {
			login.response.status = undefined;
			toast.error(`Login error: ${login.response.message}`);
		}
		if (login.response.status === "success") {
			login.response.status = undefined;
			toast.success("Login success");
		}
	});

	return (
		<Card.Root class="max-w-md rounded-b-lg rounded-l-lg">
			<Card.Header>
				<Card.Title class="text-lg md:text-xl">Sign In</Card.Title>
				<Card.Description class="text-xs md:text-sm">
					Enter your email below to login to your account
				</Card.Description>
			</Card.Header>

			<Card.Content>
				<div class="grid gap-4">
					<Form class="grid gap-4">
						<Field name="email">
							{(field, props) => (
								<TextInput
									{...props}
									error={field.error}
									label="Email"
									placeholder="spice-world@example.com"
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
									autoComplete="current-password"
									error={field.error}
									label="Password"
									placeholder="myStr0ngP@ssW0rd2!4"
									required
									type="password"
									value={field.value}
								/>
							)}
						</Field>
						<div class="flex items-center">
							<Link class="ml-auto inline-block text-sm underline" href="#">
								Forgot your password?
							</Link>
						</div>

						<div class="flex items-center gap-2">
							<Field name="rememberme" type="boolean">
								{(field, props) => (
									<div>
										<Checkbox id="remember" {...props} checked={field.value} />
										{field.error && (
											<div class="text-red-700 text-xs">{field.error}</div>
										)}
									</div>
								)}
							</Field>
							<Label class="text-sm">Remember me</Label>
						</div>

						<Button
							class="w-full"
							disabled={loginForm.submitting}
							type="submit"
						>
							{loginForm.submitting ? (
								<LuLoader2 class="h-6 w-6 animate-spin" />
							) : (
								"Login"
							)}
						</Button>
					</Form>

					<div class="flex w-full flex-col items-center justify-between gap-2">
						<Button
							class="w-full gap-2"
							disabled={googleLoading.value}
							look="outline"
							onClick$={signInGoogle}
							type="button"
						>
							<svg
								height="1em"
								viewBox="0 0 256 262"
								width="0.98em"
								xmlns="http://www.w3.org/2000/svg"
							>
								<title>Google logo</title>
								<path
									d="M255.878 133.451c0-10.734-.871-18.567-2.756-26.69H130.55v48.448h71.947c-1.45 12.04-9.283 30.172-26.69 42.356l-.244 1.622l38.755 30.023l2.685.268c24.659-22.774 38.875-56.282 38.875-96.027"
									fill="#4285F4"
								/>

								<path
									d="M130.55 261.1c35.248 0 64.839-11.605 86.453-31.622l-41.196-31.913c-11.024 7.688-25.82 13.055-45.257 13.055c-34.523 0-63.824-22.773-74.269-54.25l-1.531.13l-40.298 31.187l-.527 1.465C35.393 231.798 79.49 261.1 130.55 261.1"
									fill="#34A853"
								/>

								<path
									d="M56.281 156.37c-2.756-8.123-4.351-16.827-4.351-25.82c0-8.994 1.595-17.697 4.206-25.82l-.073-1.73L15.26 71.312l-1.335.635C5.077 89.644 0 109.517 0 130.55s5.077 40.905 13.925 58.602z"
									fill="#FBBC05"
								/>

								<path
									d="M130.55 50.479c24.514 0 41.05 10.589 50.479 19.438l36.844-35.974C195.245 12.91 165.798 0 130.55 0C79.49 0 35.393 29.301 13.925 71.947l42.211 32.783c10.59-31.477 39.891-54.251 74.414-54.251"
									fill="#EB4335"
								/>
							</svg>
							{googleLoading.value ? (
								<LuLoader2 class="h-6 w-6 animate-spin" />
							) : (
								"Sign in with Google"
							)}
						</Button>
					</div>
				</div>
			</Card.Content>
		</Card.Root>
	);
});
