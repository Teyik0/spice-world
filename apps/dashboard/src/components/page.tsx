import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@spice-world/ui/components/breadcrumb";
import { Separator } from "@spice-world/ui/components/separator";
import { SidebarTrigger } from "@spice-world/ui/components/sidebar";
import type { RoutePattern } from "@teyik0/furin/link";
import { Link } from "@teyik0/furin/link";
import type { ReactNode } from "react";
import { Fragment } from "react";

export function Page({
  children,
  parents = [],
  title,
}: {
  children: ReactNode;
  parents?: {
    label: string;
    to: Exclude<RoutePattern, `${string}:${string}`>;
  }[];
  title: string;
}) {
  return (
    <>
      <header className="bg-background/85 sticky top-0 z-10 flex h-12 shrink-0 items-center gap-2 border-b px-4 backdrop-blur-sm md:rounded-t-xl">
        <SidebarTrigger className="-ml-1" />
        <Separator className="my-3.5" orientation="vertical" />
        <Breadcrumb>
          <BreadcrumbList>
            {parents.map(({ label, to }) => (
              <Fragment key={to}>
                <BreadcrumbItem>
                  <BreadcrumbLink render={<Link to={to} />}>
                    {label}
                  </BreadcrumbLink>
                </BreadcrumbItem>
                <BreadcrumbSeparator>/</BreadcrumbSeparator>
              </Fragment>
            ))}
            <BreadcrumbItem>
              <BreadcrumbPage className="font-medium">{title}</BreadcrumbPage>
            </BreadcrumbItem>
          </BreadcrumbList>
        </Breadcrumb>
      </header>
      <div className="flex flex-1 flex-col gap-6 p-6">{children}</div>
    </>
  );
}
