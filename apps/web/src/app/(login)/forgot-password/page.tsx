"use client";

import { Button } from "@spice-world/web/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@spice-world/web/components/ui/card";
import { Input } from "@spice-world/web/components/ui/input";
import { Label } from "@spice-world/web/components/ui/label";
import { Loader2 } from "lucide-react";
import Link from "next/link";
import { useAction } from "next-safe-action/hooks";
import { forgotPasswordAction } from "./actions";

export default function ForgotPasswordPage() {
  const { execute, result, isExecuting } = useAction(forgotPasswordAction);

  const emailSent = result.data?.emailSent;

  return (
    <Card className="rounded-tl-none shadow-xl">
      <CardHeader className="space-y-2 pb-4">
        <CardTitle className="text-2xl font-bold">Forgot password?</CardTitle>
        <CardDescription className="text-sm">
          {emailSent
            ? "We've sent you an email with instructions to reset your password"
            : "Enter your email address and we'll send you a link to reset your password"}
        </CardDescription>
      </CardHeader>
      <CardContent>
        {emailSent ? (
          <div className="space-y-4">
            <div className="rounded-lg bg-green-50 p-4 dark:bg-green-950">
              <p className="text-sm text-green-800 dark:text-green-200">
                If an account exists with this email, you'll receive a password
                reset link shortly. Please check your inbox and spam folder.
              </p>
            </div>
            <Button
              className="w-full"
              nativeButton={false}
              render={<Link href="/signin">Back to sign in</Link>}
              variant="outline"
            />
          </div>
        ) : (
          <form
            className="grid gap-4"
            onSubmit={(e) => {
              e.preventDefault();
              const formData = new FormData(e.currentTarget);
              execute({
                email: formData.get("email") as string,
              });
            }}
          >
            <div className="space-y-2">
              <Label htmlFor="email">Email</Label>
              <Input
                autoComplete="email"
                disabled={isExecuting}
                id="email"
                name="email"
                placeholder="max@example.com"
                required
                type="email"
              />
            </div>

            {result.serverError && (
              <div
                aria-live="polite"
                className="rounded-lg bg-red-50 p-3 text-sm text-red-800 dark:bg-red-950 dark:text-red-200"
                role="alert"
              >
                {result.serverError}
              </div>
            )}
            {result.validationErrors && (
              <div
                aria-live="polite"
                className="rounded-lg bg-red-50 p-3 text-sm text-red-800 dark:bg-red-950 dark:text-red-200"
                role="alert"
              >
                {result.validationErrors.formErrors?.[0] ||
                  Object.values(result.validationErrors.fieldErrors || {})
                    .flat()
                    .join(", ")}
              </div>
            )}

            <Button className="w-full" disabled={isExecuting} type="submit">
              {isExecuting ? (
                <Loader2 className="animate-spin" size={16} />
              ) : (
                "Send reset link"
              )}
            </Button>

            <Button
              className="w-full"
              nativeButton={false}
              render={<Link href="/signin">Back to sign in</Link>}
              variant="ghost"
            />
          </form>
        )}
      </CardContent>
    </Card>
  );
}
