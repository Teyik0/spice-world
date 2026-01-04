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
import { selectedProductIdsAtom } from "../store";

interface Category {
	id: string;
	name: string;
}

interface PendingChanges {
	status?: ProductStatus;
	categoryId?: string;
	categoryName?: string;
}

interface BulkActionsBarProps {
	categories: Category[];
}

export function BulkActionsBar({ categories }: BulkActionsBarProps) {
	const [selectedIds, setSelectedIds] = useAtom(selectedProductIdsAtom);

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
						`Failed to bulk update products with error ${error.status}: ${elysiaErrorToString(error)}`,
					);
					throw error;
				}
				toast.success("Product created successfully");
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
			<div className="flex items-center gap-2 p-3 border-b bg-muted/50 flex-wrap">
				{isPending && <Loader2Icon className="size-4 animate-spin" />}
				<span className="text-sm text-muted-foreground">
					{selectedIds.size} selected
				</span>

				<DropdownMenu>
					<DropdownMenuTrigger asChild>
						<Button
							variant={pendingChanges.status ? "default" : "outline"}
							size="sm"
							disabled={isPending}
						>
							{pendingChanges.status
								? `Status: ${pendingChanges.status.charAt(0) + pendingChanges.status.slice(1).toLowerCase()}`
								: "Change Status"}
						</Button>
					</DropdownMenuTrigger>
					<DropdownMenuContent>
						{productStatusOptions.map((status) => (
							<DropdownMenuItem
								key={status}
								onClick={() => handleStatusSelect(status)}
							>
								{pendingChanges.status === status && (
									<CheckIcon className="size-4 mr-2" />
								)}
								{status.charAt(0) + status.slice(1).toLowerCase()}
							</DropdownMenuItem>
						))}
					</DropdownMenuContent>
				</DropdownMenu>

				<DropdownMenu>
					<DropdownMenuTrigger asChild>
						<Button
							variant={pendingChanges.categoryId ? "default" : "outline"}
							size="sm"
							disabled={isPending}
						>
							{pendingChanges.categoryName
								? `Category: ${pendingChanges.categoryName}`
								: "Change Category"}
						</Button>
					</DropdownMenuTrigger>
					<DropdownMenuContent>
						{categories.map((cat) => (
							<DropdownMenuItem
								key={cat.id}
								onClick={() => handleCategorySelect(cat.id, cat.name)}
							>
								{pendingChanges.categoryId === cat.id && (
									<CheckIcon className="size-4 mr-2" />
								)}
								{cat.name}
							</DropdownMenuItem>
						))}
					</DropdownMenuContent>
				</DropdownMenu>

				{hasPendingChanges && (
					<>
						<Button
							variant="default"
							size="sm"
							onClick={handleApplyChanges}
							disabled={isPending}
						>
							Apply Changes
						</Button>
						<Button
							variant="ghost"
							size="sm"
							onClick={handleClearChanges}
							disabled={isPending}
						>
							Reset
						</Button>
					</>
				)}

				<Button
					variant="ghost"
					size="sm"
					onClick={handleClearSelection}
					disabled={isPending}
					className="ml-auto"
				>
					<XIcon className="size-4 mr-1" />
					Clear
				</Button>
			</div>

			<Dialog open={showConfirmDialog} onOpenChange={setShowConfirmDialog}>
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
							{pendingChanges.status && (
								<Badge variant="secondary">
									Status →{" "}
									{pendingChanges.status.charAt(0) +
										pendingChanges.status.slice(1).toLowerCase()}
								</Badge>
							)}
							{pendingChanges.categoryName && (
								<Badge variant="secondary">
									Category → {pendingChanges.categoryName}
								</Badge>
							)}
						</div>
					</div>

					<DialogFooter>
						<Button
							variant="outline"
							onClick={() => setShowConfirmDialog(false)}
							disabled={isPending}
						>
							Cancel
						</Button>
						<Button onClick={handleConfirm} disabled={isPending}>
							{isPending && (
								<Loader2Icon className="size-4 mr-2 animate-spin" />
							)}
							Confirm
						</Button>
					</DialogFooter>
				</DialogContent>
			</Dialog>
		</>
	);
}
