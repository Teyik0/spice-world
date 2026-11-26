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
import { useRouter } from "@teyik0/furin/link";
import { ChevronDownIcon } from "lucide-react";
import { useState, useTransition } from "react";
import { toast } from "sonner";

import { api } from "../../../../lib/api";
import type { ProductsQuery } from "./products-query";
import { STATUSES } from "./products-query";

type Change =
  | { label: string; status: NonNullable<ProductsQuery["status"]> }
  | { label: string; categoryId: string };

export function BulkActions({
  categories,
  ids,
  onDone,
}: {
  categories: { id: string; name: string }[];
  ids: string[];
  onDone: () => void;
}) {
  const router = useRouter();
  const [change, setChange] = useState<Change | undefined>(undefined);
  const [pending, startTransition] = useTransition();

  const apply = () =>
    startTransition(async () => {
      if (!change) {
        return;
      }
      const { label, ...patch } = change;
      const { data, error } = await api().products.bulk.patch({
        ids,
        ...patch,
      });
      setChange(undefined);
      if (error) {
        const { value } = error;
        toast.error(
          "message" in value ? value.message : (value.detail ?? value.title),
        );
        return;
      }
      toast.success(`${data.count} products updated.`);
      onDone();
      await router.refresh();
    });

  return (
    <div className="bg-muted/50 flex flex-wrap items-center gap-2 rounded-lg border p-2">
      <span className="px-2 text-sm tabular-nums">{ids.length} selected</span>
      <DropdownMenu>
        <DropdownMenuTrigger render={<Button size="sm" variant="outline" />}>
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
                {status.charAt(0) + status.slice(1).toLowerCase()}
              </DropdownMenuItem>
            ))}
          </DropdownMenuGroup>
        </DropdownMenuContent>
      </DropdownMenu>
      <DropdownMenu>
        <DropdownMenuTrigger render={<Button size="sm" variant="outline" />}>
          Move to Category
          <ChevronDownIcon data-icon="inline-end" />
        </DropdownMenuTrigger>
        <DropdownMenuContent className="max-h-80">
          <DropdownMenuGroup>
            {categories.map(({ id, name }) => (
              <DropdownMenuItem
                key={id}
                onClick={() =>
                  setChange({ label: `Category → ${name}`, categoryId: id })
                }
              >
                {name}
              </DropdownMenuItem>
            ))}
          </DropdownMenuGroup>
        </DropdownMenuContent>
      </DropdownMenu>
      <Button className="ml-auto" onClick={onDone} size="sm" variant="ghost">
        Clear Selection
      </Button>
      <AlertDialog
        onOpenChange={(open) => (open ? null : setChange(undefined))}
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
