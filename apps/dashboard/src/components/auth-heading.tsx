import type { ReactNode } from "react";

export function AuthHeading({
  title,
  children,
}: {
  title: string;
  children: ReactNode;
}) {
  return (
    <header className="flex flex-col gap-1">
      <h1 className="text-2xl font-semibold tracking-tight text-balance">
        {title}
      </h1>
      <p className="text-muted-foreground text-sm text-pretty">{children}</p>
    </header>
  );
}
