import { ClientOnly } from "@spice-world/web/components/client-only";
import { Button } from "@spice-world/web/components/ui/button";
import { ButtonGroup } from "@spice-world/web/components/ui/button-group";
import { Input } from "@spice-world/web/components/ui/input";
import { Skeleton } from "@spice-world/web/components/ui/skeleton";
import { SearchIcon } from "lucide-react";
import { Suspense } from "react";

import type { UserItemProps } from "./store";
import { AddUserButton, NewUserItem, UserItem } from "./user-item";

export function SidebarRight({ users }: { users: UserItemProps[] }) {
  return (
    <Suspense fallback={<UsersSidebarSkeleton />}>
      <aside className="bg-background hidden h-screen flex-1 flex-col overflow-hidden border-r md:flex">
        <header className="flex h-16 items-center border-b p-3">
          <ButtonGroup className="w-full">
            <Input placeholder="Search users..." />
            <Button aria-label="Search" variant="outline">
              <SearchIcon />
            </Button>
            <ClientOnly>
              <AddUserButton />
            </ClientOnly>
          </ButtonGroup>
        </header>
        <div className="flex-1 overflow-auto">
          <ClientOnly>
            <NewUserItem />
          </ClientOnly>
          {users.map((user) => (
            <UserItem key={user.id} user={user} />
          ))}
        </div>
      </aside>
    </Suspense>
  );
}

function UsersSidebarSkeleton() {
  return (
    <aside className="bg-background hidden h-screen flex-1 flex-col overflow-hidden border-r md:flex">
      <header className="h-16 border-b p-3">
        <div className="flex gap-2">
          <Skeleton className="h-9 flex-1" />
        </div>
      </header>
      <div className="flex-1 overflow-auto">
        {["first", "second", "third", "fourth", "fifth"].map((key) => (
          <div className="flex items-center gap-3 border-b p-4" key={key}>
            <Skeleton className="h-10 w-10 shrink-0 rounded-full" />
            <div className="flex-1">
              <Skeleton className="mb-2 h-4 w-3/4" />
              <Skeleton className="h-3 w-full" />
            </div>
          </div>
        ))}
      </div>
    </aside>
  );
}
