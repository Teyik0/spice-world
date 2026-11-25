import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@spice-world/web/components/ui/breadcrumb";
import { SidebarInset } from "@spice-world/web/components/ui/sidebar";
import { app } from "@spice-world/web/lib/elysia-server";

import { Collections } from "./collections";

export default async function CollectionsPage() {
  const { data } = await app.collections.get();

  return (
    <SidebarInset>
      <header className="flex h-16 shrink-0 items-center gap-2 border-b px-4">
        <Breadcrumb>
          <BreadcrumbList>
            <BreadcrumbItem className="hidden md:block">
              <BreadcrumbLink href="/">Spice World</BreadcrumbLink>
            </BreadcrumbItem>
            <BreadcrumbSeparator className="hidden md:block" />
            <BreadcrumbItem>
              <BreadcrumbPage>Collections</BreadcrumbPage>
            </BreadcrumbItem>
          </BreadcrumbList>
        </Breadcrumb>
      </header>
      <Collections collections={data ?? []} />
    </SidebarInset>
  );
}
