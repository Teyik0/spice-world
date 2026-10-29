"use client";

import { Button } from "@spice-world/web/components/ui/button";
import { Checkbox } from "@spice-world/web/components/ui/checkbox";
import { Input } from "@spice-world/web/components/ui/input";
import { Label } from "@spice-world/web/components/ui/label";
import { Loader2 } from "lucide-react";
import Link from "next/link";
import { useAction } from "next-safe-action/hooks";
import { signInAction } from "./actions";

interface EmailSignInProps {
  lastEmail: string;
  rememberMe: boolean;
}

export const EmailSignIn = ({
  rememberMe = true,
  lastEmail = "",
}: EmailSignInProps) => {
  const { execute, result, isExecuting } = useAction(signInAction);

  return (
    <form
      className="grid gap-4"
      onSubmit={(e) => {
        e.preventDefault();
        const formData = new FormData(e.currentTarget);
        execute({
          email: formData.get("email") as string,
          password: formData.get("password") as string,
          rememberMe: formData.get("rememberMe") === "on",
        });
      }}
    >
      <div className="space-y-2">
        <Label htmlFor="email">Email</Label>
        <Input
          autoComplete="email"
          defaultValue={lastEmail}
          disabled={isExecuting}
          id="email"
          name="email"
          placeholder="max@example.com"
          required
          type="email"
        />
      </div>

      <div className="space-y-2">
        <div className="flex items-center">
          <Label htmlFor="password">Password</Label>
          <Link
            className="ml-auto inline-block text-sm underline"
            href="/forgot-password"
          >
            Forgot your password?
          </Link>
        </div>
        <Input
          autoComplete="current-password"
          disabled={isExecuting}
          id="password"
          name="password"
          placeholder="password"
          required
          type="password"
        />
      </div>

      <div className="flex items-center gap-2">
        <Checkbox
          defaultChecked={rememberMe}
          disabled={isExecuting}
          id="rememberMe"
          name="rememberMe"
        />
        <Label htmlFor="rememberMe">Remember me</Label>
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
          {result.validationErrors.formErrors?.[0] ||
            Object.values(result.validationErrors.fieldErrors || {})
              .flat()
              .join(", ")}
        </div>
      ) : null}

      <Button className="w-full" disabled={isExecuting} type="submit">
        {isExecuting ? <Loader2 className="animate-spin" size={16} /> : "Login"}
      </Button>
    </form>
  );
};
