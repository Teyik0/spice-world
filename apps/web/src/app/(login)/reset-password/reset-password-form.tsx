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
import { resetPasswordAction } from "./actions";

interface ResetPasswordFormProps {
  token?: string;
}

export function ResetPasswordForm({ token }: ResetPasswordFormProps) {
  const { execute, result, isExecuting } = useAction(resetPasswordAction);
  const passwordReset = result.data?.passwordReset;

  if (!token) {
    return (
      <Card className="rounded-tl-none shadow-xl">
        <CardHeader className="space-y-2 pb-4">
          <CardTitle className="text-2xl font-bold">
            Invalid reset link
          </CardTitle>
          <CardDescription className="text-sm">
            This password reset link is invalid or has expired
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            <div className="rounded-lg bg-red-50 p-4 dark:bg-red-950">
              <p className="text-sm text-red-800 dark:text-red-200">
                Invalid reset link. Please request a new one.
              </p>
            </div>
            <Button
              className="w-full"
              nativeButton={false}
              render={
                <Link href="/forgot-password">Request new reset link</Link>
              }
              variant="outline"
            />
            <Button
              className="w-full"
              nativeButton={false}
              render={<Link href="/signin">Back to sign in</Link>}
              variant="ghost"
            />
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="rounded-tl-none shadow-xl">
      <CardHeader className="space-y-2 pb-4">
        <CardTitle className="text-2xl font-bold">Reset password</CardTitle>
        <CardDescription className="text-sm">
          {passwordReset
            ? "We've successfully reset your password"
            : "Enter your new password below"}
        </CardDescription>
      </CardHeader>
      <CardContent>
        {passwordReset ? (
          <div className="space-y-4">
            <div className="rounded-lg bg-green-50 p-4 dark:bg-green-950">
              <p className="text-sm text-green-800 dark:text-green-200">
                Your password has been successfully reset. You can now sign in
                using your new password.
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
                newPassword: formData.get("newPassword") as string,
                confirmPassword: formData.get("confirmPassword") as string,
                token,
              });
            }}
          >
            <div className="space-y-2">
              <Label htmlFor="newPassword">New password</Label>
              <Input
                autoComplete="new-password"
                disabled={isExecuting}
                id="newPassword"
                name="newPassword"
                placeholder="Enter new password"
                required
                type="password"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="confirmPassword">Confirm password</Label>
              <Input
                autoComplete="new-password"
                disabled={isExecuting}
                id="confirmPassword"
                name="confirmPassword"
                placeholder="Confirm new password"
                required
                type="password"
              />
            </div>

            {result.serverError ? (
              <div
                aria-live="polite"
                className="rounded-lg bg-red-50 p-3 text-sm text-red-800 dark:bg-red-950 dark:text-red-200"
                role="alert"
              >
                {result.serverError}
              </div>
            ) : null}
            {result.validationErrors ? (
              <div
                aria-live="polite"
                className="rounded-lg bg-red-50 p-3 text-sm text-red-800 dark:bg-red-950 dark:text-red-200"
                role="alert"
              >
                {(() => {
                  // Gather all possible error messages
                  const errors = new Set([
                    ...(result.validationErrors.formErrors || []),
                    ...Object.values(
                      result.validationErrors.fieldErrors || {}
                    ).flat(),
                  ]);

                  // Render them with * and line breaks
                  return Array.from(errors).map((err) => (
                    <span key={err}>
                      * {err}
                      <br />
                    </span>
                  ));
                })()}
              </div>
            ) : null}

            <Button className="w-full" disabled={isExecuting} type="submit">
              {isExecuting ? (
                <Loader2 className="animate-spin" size={16} />
              ) : (
                "Reset password"
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
