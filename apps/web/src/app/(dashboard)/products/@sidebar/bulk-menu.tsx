"use client";

import type { ProductStatus } from "@spice-world/server/prisma/enums";
import { Badge } from "@spice-world/web/components/ui/badge";
import { Button } from "@spice-world/web/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@spice-world/web/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@spice-world/web/components/ui/dropdown-menu";
import { app, elysiaErrorToString } from "@spice-world/web/lib/elysia";
import { unknownError } from "@spice-world/web/lib/utils";
import { useAtom } from "jotai";
import { CheckIcon, Loader2Icon, XIcon } from "lucide-react";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { productStatusOptions } from "../search-params";
import { productPagesAtom, selectedProductIdsAtom } from "../store";

interface Category {
  id: string;
  name: string;
}

interface PendingChanges {
  categoryId?: string;
  categoryName?: string;
  status?: ProductStatus;
}

interface BulkActionsBarProps {
  categories: Category[];
}

export function BulkActionsBar({ categories }: BulkActionsBarProps) {
  const [selectedIds, setSelectedIds] = useAtom(selectedProductIdsAtom);
  const [, setPages] = useAtom(productPagesAtom);

  const [pendingChanges, setPendingChanges] = useState<PendingChanges>({});
  const hasPendingChanges =
    pendingChanges.status !== undefined ||
    pendingChanges.categoryId !== undefined;

  const handleStatusSelect = (status: ProductStatus) => {
    setPendingChanges((prev) => ({
      ...prev,
      status: prev.status === status ? undefined : status,
    }));
  };

  const handleCategorySelect = (categoryId: string, categoryName: string) => {
    setPendingChanges((prev) => ({
      ...prev,
      categoryId: prev.categoryId === categoryId ? undefined : categoryId,
      categoryName: prev.categoryId === categoryId ? undefined : categoryName,
    }));
  };

  const [showConfirmDialog, setShowConfirmDialog] = useState(false);
  const handleApplyChanges = () => {
    setShowConfirmDialog(true);
  };

  const [isPending, startTransition] = useTransition();
  const handleConfirm = () => {
    startTransition(async () => {
      try {
        const { error } = await app.products.bulk.patch({
          ids: Array.from(selectedIds),
          status: pendingChanges.status,
          categoryId: pendingChanges.categoryId,
        });
        if (error) {
          toast.error(
            `Failed to bulk update products with error ${error.status}: ${elysiaErrorToString(error)}`
          );
          throw error;
        }
        // Update products in sidebar list
        setPages((pages) =>
          pages.map((page) =>
            page.map((product) => {
              if (!selectedIds.has(product.id)) {
                return product;
              }
              return {
                ...product,
                ...(pendingChanges.status && { status: pendingChanges.status }),
                ...(pendingChanges.categoryId && {
                  categoryId: pendingChanges.categoryId,
                }),
              };
            })
          )
        );
        toast.success("Products updated successfully");
        setSelectedIds(new Set<string>());
        setPendingChanges({});
        setShowConfirmDialog(false);
      } catch (error: unknown) {
        const err = unknownError(error, "Failed to bulk update products");
        toast.error(elysiaErrorToString(err));
      }
    });
  };

  const handleClearSelection = () => {
    setSelectedIds(new Set<string>());
    setPendingChanges({});
  };

  const handleClearChanges = () => {
    setPendingChanges({});
  };

  return (
    <>
      <div className="bg-muted/50 flex flex-wrap items-center gap-2 border-b p-3">
        {isPending ? <Loader2Icon className="size-4 animate-spin" /> : null}
        <span className="text-muted-foreground text-sm">
          {selectedIds.size} selected
        </span>

        <DropdownMenu>
          <DropdownMenuTrigger
            render={
              <Button
                disabled={isPending}
                size="sm"
                variant={pendingChanges.status ? "default" : "outline"}
              >
                {pendingChanges.status
                  ? `Status: ${pendingChanges.status.charAt(0) + pendingChanges.status.slice(1).toLowerCase()}`
                  : "Change Status"}
              </Button>
            }
          />
          <DropdownMenuContent>
            <DropdownMenuGroup>
              {productStatusOptions.map((status) => (
                <DropdownMenuItem
                  key={status}
                  onClick={() => handleStatusSelect(status)}
                >
                  {pendingChanges.status === status && (
                    <CheckIcon className="mr-2 size-4" />
                  )}
                  {status.charAt(0) + status.slice(1).toLowerCase()}
                </DropdownMenuItem>
              ))}
            </DropdownMenuGroup>
          </DropdownMenuContent>
        </DropdownMenu>

        <DropdownMenu>
          <DropdownMenuTrigger
            render={
              <Button
                disabled={isPending}
                size="sm"
                variant={pendingChanges.categoryId ? "default" : "outline"}
              >
                {pendingChanges.categoryName
                  ? `Category: ${pendingChanges.categoryName}`
                  : "Change Category"}
              </Button>
            }
          />
          <DropdownMenuContent>
            <DropdownMenuGroup>
              {categories.map((cat) => (
                <DropdownMenuItem
                  key={cat.id}
                  onClick={() => handleCategorySelect(cat.id, cat.name)}
                >
                  {pendingChanges.categoryId === cat.id && (
                    <CheckIcon className="mr-2 size-4" />
                  )}
                  {cat.name}
                </DropdownMenuItem>
              ))}
            </DropdownMenuGroup>
          </DropdownMenuContent>
        </DropdownMenu>

        {hasPendingChanges ? (
          <>
            <Button
              disabled={isPending}
              onClick={handleApplyChanges}
              size="sm"
              variant="default"
            >
              Apply Changes
            </Button>
            <Button
              disabled={isPending}
              onClick={handleClearChanges}
              size="sm"
              variant="ghost"
            >
              Reset
            </Button>
          </>
        ) : null}

        <Button
          className="ml-auto"
          disabled={isPending}
          onClick={handleClearSelection}
          size="sm"
          variant="ghost"
        >
          <XIcon className="mr-1 size-4" />
          Clear
        </Button>
      </div>

      <Dialog onOpenChange={setShowConfirmDialog} open={showConfirmDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Confirm Bulk Edit</DialogTitle>
            <DialogDescription>
              You are about to modify {selectedIds.size} product
              {selectedIds.size > 1 ? "s" : ""}. This action cannot be undone.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-2">
            <p className="text-sm font-medium">Changes to apply:</p>
            <div className="flex flex-wrap gap-2">
              {pendingChanges.status ? (
                <Badge variant="secondary">
                  Status →{" "}
                  {pendingChanges.status.charAt(0) +
                    pendingChanges.status.slice(1).toLowerCase()}
                </Badge>
              ) : null}
              {pendingChanges.categoryName ? (
                <Badge variant="secondary">
                  Category → {pendingChanges.categoryName}
                </Badge>
              ) : null}
            </div>
          </div>

          <DialogFooter>
            <Button
              disabled={isPending}
              onClick={() => setShowConfirmDialog(false)}
              variant="outline"
            >
              Cancel
            </Button>
            <Button disabled={isPending} onClick={handleConfirm}>
              {isPending ? (
                <Loader2Icon className="mr-2 size-4 animate-spin" />
              ) : null}
              Confirm
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
