import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@spice-world/ui/components/alert-dialog";
import { Button } from "@spice-world/ui/components/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@spice-world/ui/components/dropdown-menu";
import { ChevronDownIcon, XIcon } from "lucide-react";
import { useState, useTransition } from "react";
import { toast } from "sonner";

import { api } from "../../../../lib/api";
import type { ProductsQuery } from "./products-query";
import { label, STATUSES } from "./products-query";

// Ghost buttons on the inverted bar.
const ON_DARK =
  "text-background hover:bg-background/15 hover:text-background dark:hover:bg-background/15 aria-expanded:bg-background/15 aria-expanded:text-background";

type Change =
  | { label: string; status: NonNullable<ProductsQuery["status"]> }
  | { label: string; categoryId: string; status: "DRAFT" };

export function BulkActions({
  categories,
  ids,
  onDone,
}: {
  categories: { id: string; name: string }[];
  ids: string[];
  onDone: () => void;
}) {
  const [change, setChange] = useState<Change | null>(null);
  const [pending, startTransition] = useTransition();

  const apply = () =>
    startTransition(async () => {
      if (!change) {
        return;
      }
      const { label: _, ...patch } = change;
      const { data, error } = await api.products.bulk.patch({
        ids,
        ...patch,
      });
      setChange(null);
      if (error) {
        const { value } = error;
        toast.error(
          "message" in value ? value.message : (value.detail ?? value.title),
        );
        return;
      }
      toast.success(`${data.count} products updated.`);
      onDone();
    });

  return (
    <div
      aria-label="Bulk actions"
      className="bg-foreground text-background fixed inset-x-0 bottom-6 z-20 mx-auto flex w-fit max-w-[calc(100%-2rem)] items-center gap-1 overflow-x-auto rounded-xl p-1.5 pl-4 shadow-lg"
      role="toolbar"
    >
      <span className="mr-2 text-sm font-medium whitespace-nowrap tabular-nums">
        {ids.length} selected
      </span>
      <DropdownMenu>
        <DropdownMenuTrigger
          render={<Button className={ON_DARK} size="sm" variant="ghost" />}
        >
          Set Status
          <ChevronDownIcon data-icon="inline-end" />
        </DropdownMenuTrigger>
        <DropdownMenuContent>
          <DropdownMenuGroup>
            {STATUSES.map((status) => (
              <DropdownMenuItem
                key={status}
                onClick={() =>
                  setChange({
                    label: `Status → ${status.toLowerCase()}`,
                    status,
                  })
                }
              >
                {label(status)}
              </DropdownMenuItem>
            ))}
          </DropdownMenuGroup>
        </DropdownMenuContent>
      </DropdownMenu>
      <DropdownMenu>
        <DropdownMenuTrigger
          render={<Button className={ON_DARK} size="sm" variant="ghost" />}
        >
          Move to Category
          <ChevronDownIcon data-icon="inline-end" />
        </DropdownMenuTrigger>
        <DropdownMenuContent className="max-h-80">
          <DropdownMenuGroup>
            {categories.map(({ id, name }) => (
              <DropdownMenuItem
                key={id}
                onClick={() =>
                  setChange({
                    label: `Category → ${name}, status → draft. Variant attribute values are cleared`,
                    categoryId: id,
                    status: "DRAFT",
                  })
                }
              >
                {name}
              </DropdownMenuItem>
            ))}
          </DropdownMenuGroup>
        </DropdownMenuContent>
      </DropdownMenu>
      <span className="bg-background/25 mx-1 h-5 w-px" />
      <Button
        aria-label="Clear selection"
        className={ON_DARK}
        onClick={onDone}
        size="icon-sm"
        variant="ghost"
      >
        <XIcon />
      </Button>
      <AlertDialog
        onOpenChange={(open) => (open ? null : setChange(null))}
        open={Boolean(change)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Update {ids.length} products?</AlertDialogTitle>
            <AlertDialogDescription>
              {change?.label}. This applies to every selected product at once.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={pending}>Cancel</AlertDialogCancel>
            <AlertDialogAction disabled={pending} onClick={apply}>
              Update Products
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
