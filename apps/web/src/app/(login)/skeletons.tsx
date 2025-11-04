import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

export function SignInFormSkeleton() {
	return (
		<Card className="rounded-tl-none shadow-xl">
			<CardHeader className="space-y-2 pb-4">
				<CardTitle className="text-2xl font-bold">Welcome back</CardTitle>
				<CardDescription className="text-sm">
					Sign in to your account to continue
				</CardDescription>
			</CardHeader>
			<CardContent>
				<div className="grid gap-4">
					{/* Email field */}
					<div className="space-y-2">
						<Skeleton className="h-4 w-16" />
						<Skeleton className="h-10 w-full" />
					</div>

					{/* Password field */}
					<div className="space-y-2">
						<div className="flex items-center">
							<Skeleton className="h-4 w-20" />
							<Skeleton className="ml-auto h-4 w-32" />
						</div>
						<Skeleton className="h-10 w-full" />
					</div>

					{/* Remember me checkbox */}
					<div className="flex items-center gap-2">
						<Skeleton className="h-4 w-4" />
						<Skeleton className="h-4 w-24" />
					</div>

					{/* Login button */}
					<Skeleton className="h-10 w-full" />
				</div>

				{/* Google sign in button */}
				<Skeleton className="mt-4 h-10 w-full" />
			</CardContent>
		</Card>
	);
}

export function SignUpFormSkeleton() {
	return (
		<Card className="rounded-tl-none shadow-xl">
			<CardHeader className="space-y-2 pb-4">
				<CardTitle className="text-2xl font-bold">Create an account</CardTitle>
				<CardDescription className="text-sm">
					Get started by creating your account
				</CardDescription>
			</CardHeader>
			<CardContent>
				<div className="grid gap-4">
					{/* First name & Last name */}
					<div className="grid grid-cols-2 gap-4">
						<div className="space-y-2">
							<Skeleton className="h-4 w-20" />
							<Skeleton className="h-10 w-full" />
						</div>
						<div className="space-y-2">
							<Skeleton className="h-4 w-20" />
							<Skeleton className="h-10 w-full" />
						</div>
					</div>

					{/* Email field */}
					<div className="space-y-2">
						<Skeleton className="h-4 w-16" />
						<Skeleton className="h-10 w-full" />
					</div>

					{/* Password field */}
					<div className="space-y-2">
						<Skeleton className="h-4 w-20" />
						<Skeleton className="h-10 w-full" />
					</div>

					{/* Password confirmation field */}
					<div className="space-y-2">
						<Skeleton className="h-4 w-40" />
						<Skeleton className="h-10 w-full" />
					</div>

					{/* Profile image field */}
					<div className="space-y-2">
						<Skeleton className="h-4 w-32" />
						<Skeleton className="h-10 w-full" />
					</div>

					{/* Create account button */}
					<Skeleton className="h-10 w-full" />
				</div>
			</CardContent>
		</Card>
	);
}

export function ForgotPasswordFormSkeleton() {
	return (
		<Card className="rounded-tl-none shadow-xl">
			<CardHeader className="space-y-2 pb-4">
				<CardTitle className="text-2xl font-bold">Forgot password</CardTitle>
				<CardDescription className="text-sm">
					Enter your email to receive a reset link
				</CardDescription>
			</CardHeader>
			<CardContent>
				<div className="grid gap-4">
					{/* Email field */}
					<div className="space-y-2">
						<Skeleton className="h-4 w-16" />
						<Skeleton className="h-10 w-full" />
					</div>

					{/* Submit button */}
					<Skeleton className="h-10 w-full" />
				</div>
			</CardContent>
		</Card>
	);
}

export function ResetPasswordFormSkeleton() {
	return (
		<Card className="rounded-tl-none shadow-xl">
			<CardHeader className="space-y-2 pb-4">
				<CardTitle className="text-2xl font-bold">Reset password</CardTitle>
				<CardDescription className="text-sm">
					Enter your new password
				</CardDescription>
			</CardHeader>
			<CardContent>
				<div className="grid gap-4">
					{/* Password field */}
					<div className="space-y-2">
						<Skeleton className="h-4 w-28" />
						<Skeleton className="h-10 w-full" />
					</div>

					{/* Password confirmation field */}
					<div className="space-y-2">
						<Skeleton className="h-4 w-40" />
						<Skeleton className="h-10 w-full" />
					</div>

					{/* Submit button */}
					<Skeleton className="h-10 w-full" />
				</div>
			</CardContent>
		</Card>
	);
}
