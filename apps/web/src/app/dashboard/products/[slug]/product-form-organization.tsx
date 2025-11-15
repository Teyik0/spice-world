"use client";

import {
	ElysiaError,
	ErrorItem,
} from "@spice-world/web/components/elysia-error";
import { Button } from "@spice-world/web/components/ui/button";
import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from "@spice-world/web/components/ui/card";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogHeader,
	DialogTitle,
	DialogTrigger,
} from "@spice-world/web/components/ui/dialog";
import {
	Drawer,
	DrawerClose,
	DrawerContent,
	DrawerDescription,
	DrawerFooter,
	DrawerHeader,
	DrawerTitle,
	DrawerTrigger,
} from "@spice-world/web/components/ui/drawer";
import {
	Field,
	FieldGroup,
	FieldLabel,
} from "@spice-world/web/components/ui/field";
import { Input } from "@spice-world/web/components/ui/input";
import { Label } from "@spice-world/web/components/ui/label";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@spice-world/web/components/ui/select";
import { Spinner } from "@spice-world/web/components/ui/spinner";
import {
	ToggleGroup,
	ToggleGroupItem,
} from "@spice-world/web/components/ui/toggle-group";
import { useFileUpload } from "@spice-world/web/hooks/use-file-upload";
import { useIsMobile } from "@spice-world/web/hooks/use-mobile";
import {
	app,
	type GetCategory,
	type TreatyMethodState,
} from "@spice-world/web/lib/elysia";
import { cn, unknownError } from "@spice-world/web/lib/utils";
import { useAtom } from "jotai";
import { Edit2, Upload } from "lucide-react";
import Image from "next/image";
import { useActionState, useState } from "react";
import { toast } from "sonner";
import { currentProductAtom, newProductAtom } from "../store";

export const ProductFormOrganization = ({
	isNew,
	initialCategories,
}: {
	isNew: boolean;
	initialCategories: GetCategory[];
}) => {
	const [product, setProduct] = useAtom(
		isNew ? newProductAtom : currentProductAtom,
	);
	const [categories, setCategories] =
		useState<GetCategory[]>(initialCategories);

	// Set default category to first category if product has no category
	const defaultCategoryId = product?.categoryId ?? categories[0]?.id ?? null;

	const fetchCategories = async () => {
		const { data } = await app.categories.get();
		if (data) {
			setCategories(data);
		}
	};

	const handleStatusChange = (value: string) => {
		if (!product) return;
		setProduct({ ...product, status: value as typeof product.status });
	};

	const handleCategoryChange = (value: string) => {
		if (!product) return;
		setProduct({ ...product, categoryId: value });
	};

	if (!product) return null;

	return (
		<Card className="rounded-md">
			<CardHeader>
				<div className="flex items-center justify-between">
					<CardTitle>Organization</CardTitle>
					<CategoryDialog
						categories={categories}
						onCategoryChange={fetchCategories}
					/>
				</div>
				<CardDescription>
					Manage the product's category and visibility status
				</CardDescription>
			</CardHeader>
			<CardContent>
				<FieldGroup className="gap-4">
					<Field>
						<FieldLabel htmlFor="product-category">Category</FieldLabel>
						<Select
							value={defaultCategoryId ?? undefined}
							onValueChange={handleCategoryChange}
						>
							<SelectTrigger>
								<SelectValue placeholder="Select category" />
							</SelectTrigger>
							<SelectContent>
								{categories.map((category) => (
									<SelectItem key={category.id} value={category.id}>
										{category.name}
									</SelectItem>
								))}
							</SelectContent>
						</Select>
					</Field>
					<Field>
						<FieldLabel htmlFor="product-status">Status</FieldLabel>
						<Select
							value={product.status ?? "DRAFT"}
							onValueChange={handleStatusChange}
						>
							<SelectTrigger id="product-status">
								<SelectValue placeholder="Select status" />
							</SelectTrigger>
							<SelectContent>
								<SelectItem value="DRAFT">Draft</SelectItem>
								<SelectItem value="PUBLISHED">Published</SelectItem>
								<SelectItem value="ARCHIVED">Archived</SelectItem>
							</SelectContent>
						</Select>
					</Field>
				</FieldGroup>
			</CardContent>
		</Card>
	);
};

interface CategoryDialogProps {
	categories: GetCategory[];
	onCategoryChange: () => void;
}

const CategoryDialog = ({
	categories,
	onCategoryChange,
}: CategoryDialogProps) => {
	const [open, setOpen] = useState(false);
	const isDesktop = !useIsMobile();

	const handleClose = () => {
		setOpen(false);
		onCategoryChange();
	};

	if (isDesktop) {
		return (
			<Dialog open={open} onOpenChange={setOpen}>
				<DialogTrigger asChild>
					<Button variant="outline" size="icon-sm">
						<Edit2 className="h-3 w-3" />
					</Button>
				</DialogTrigger>
				<DialogContent className="sm:max-w-[425px]">
					<DialogHeader>
						<DialogTitle>Edit category</DialogTitle>
						<DialogDescription>
							Add or delete categories here. Click save when you&apos;re done.
						</DialogDescription>
					</DialogHeader>
					<CategoryForm setOpen={handleClose} categories={categories} />
				</DialogContent>
			</Dialog>
		);
	}

	return (
		<Drawer open={open} onOpenChange={setOpen}>
			<DrawerTrigger asChild>
				<Button variant="outline" size="icon-sm">
					<Edit2 className="h-3 w-3" />
				</Button>
			</DrawerTrigger>
			<DrawerContent>
				<DrawerHeader className="text-left">
					<DrawerTitle>Edit category</DrawerTitle>
					<DrawerDescription>
						Add or delete categories here. Click save when you&apos;re done.
					</DrawerDescription>
				</DrawerHeader>
				<CategoryForm setOpen={handleClose} categories={categories} />
				<DrawerFooter className="pt-2">
					<DrawerClose asChild>
						<Button variant="outline">Cancel</Button>
					</DrawerClose>
				</DrawerFooter>
			</DrawerContent>
		</Drawer>
	);
};

interface CategoryFormProps {
	setOpen: () => void;
	categories: GetCategory[];
}

const CategoryForm = ({ setOpen, categories }: CategoryFormProps) => {
	const [toggleValue, setToggleValue] = useState<"new" | "update">("new");
	const [selectedCategory, setSelectedCategory] = useState<GetCategory | null>(
		categories[0] ?? null,
	);

	const [{ files, errors }, { getInputProps, clearFiles }] = useFileUpload({
		maxFiles: 1,
		maxSize: 1024 * 1024, // 1 MB
		accept: "image/*",
		multiple: false,
	});

	const [catStateNew, submitCat, isPendingNewCat] = useActionState(
		async (
			_prevState: TreatyMethodState<typeof app.categories.post>,
			formData: FormData,
		) => {
			try {
				const name = formData.get("name") as string;

				const { data, error } = await app.categories.post({
					name: name.toLowerCase(),
					file: files[0]?.file as File,
				});

				if (error) {
					return error;
				}

				toast.success("Category created successfully");
				clearFiles();
				setOpen();
				return data;
			} catch (error: unknown) {
				return unknownError(error, "Failed to create category");
			}
		},
		null,
	);

	const [catStateUpdate, updateCat, isPendingUpdateCat] = useActionState(
		async (
			_prevState: TreatyMethodState<ReturnType<typeof app.categories>["patch"]>,
			formData: FormData,
		) => {
			try {
				if (!selectedCategory) {
					throw new Error("Select a category to update");
				}

				const name = formData.get("name") as string;
				// Build request body conditionally to avoid sending undefined
				const updateData: { name?: string; file?: File } = {};
				if (name?.trim()) {
					updateData.name = name.charAt(0).toUpperCase() + name.slice(1);
				}
				// Only add file if user uploaded a new one (must be File, not FileMetadata)
				if (files[0]?.file && files[0].file instanceof File) {
					updateData.file = files[0].file;
				}

				const { data, error } = await app
					.categories({ id: selectedCategory.id })
					.patch(updateData);

				if (error) {
					return error;
				}

				toast.success("Category updated successfully");
				clearFiles();
				setOpen();
				return data;
			} catch (error: unknown) {
				return unknownError(error, "Failed to update category");
			}
		},
		null,
	);

	return (
		<div className={cn("grid items-start gap-4 px-4 md:px-0")}>
			<ToggleGroup
				type="single"
				className="flex w-full justify-start"
				onValueChange={(value) => {
					if (value) {
						setToggleValue(value as "new" | "update");
						setSelectedCategory(categories[0] ?? null);
						clearFiles();
					}
				}}
				defaultValue="new"
			>
				<ToggleGroupItem value="new" aria-label="new" variant="outline">
					New
				</ToggleGroupItem>
				<ToggleGroupItem value="update" aria-label="update" variant="outline">
					Update
				</ToggleGroupItem>
			</ToggleGroup>

			{toggleValue === "new" && (
				<form action={submitCat} className="flex flex-col gap-4">
					<div className="grid gap-2 mt-4">
						<Label htmlFor="name">Name</Label>
						<Input type="text" id="name" name="name" placeholder="Épices" />
					</div>
					{catStateNew && "status" in catStateNew && (
						<ElysiaError {...catStateNew} />
					)}
					{errors.length > 0 && (
						<ErrorItem>{errors.map((error) => error)}</ErrorItem>
					)}
					<div className="grid grid-cols-2 gap-4">
						{files.length > 0 && files[0]?.preview ? (
							<>
								<Image
									src={files[0].preview}
									alt="Category image"
									className="object-cover aspect-square w-full rounded-md"
									width={200}
									height={200}
								/>
								<div className="flex flex-col w-full max-w-sm gap-2">
									<Label htmlFor="file">Change image</Label>
									<Input
										{...getInputProps()}
										id="file"
										className="cursor-pointer"
									/>
								</div>
							</>
						) : (
							<label className="flex aspect-square items-center justify-center rounded-md border border-dashed cursor-pointer">
								<input {...getInputProps()} className="hidden" />
								<Upload className="h-4 w-4 text-muted-foreground" />
								<span className="sr-only">Upload</span>
							</label>
						)}
					</div>
					<Button type="submit" variant="secondary" disabled={isPendingNewCat}>
						{isPendingNewCat ? (
							<>
								<Spinner />
								Saving...
							</>
						) : (
							"Save"
						)}
					</Button>
				</form>
			)}

			{toggleValue === "update" && (
				<form action={updateCat} className="flex flex-col gap-4">
					<Label htmlFor="category" className="mt-4">
						Category
					</Label>
					<Select
						onValueChange={(value) => {
							const category = categories.find((cat) => cat.name === value);
							if (category) {
								setSelectedCategory(category);
							}
						}}
						defaultValue={categories[0]?.name || ""}
					>
						<SelectTrigger
							id="category"
							name="category"
							aria-label="Select category"
						>
							<SelectValue placeholder="Select category" />
						</SelectTrigger>
						<SelectContent>
							{categories.map((category) => (
								<SelectItem key={category.id} value={category.name}>
									{category.name}
								</SelectItem>
							))}
						</SelectContent>
					</Select>
					{selectedCategory && (
						<>
							<div className="grid gap-2">
								<Label htmlFor="name">Rename</Label>
								<Input type="text" id="name" name="name" placeholder="Épices" />
							</div>
							{catStateUpdate && "status" in catStateUpdate && (
								<ElysiaError {...catStateUpdate} />
							)}
							{errors.length > 0 && (
								<ErrorItem>{errors.map((error) => error)}</ErrorItem>
							)}
							<div className="grid grid-cols-2 gap-4">
								{(files.length > 0 && files[0]?.preview) || selectedCategory ? (
									<>
										<Image
											src={
												files[0]?.preview
													? files[0].preview
													: selectedCategory.image.url
											}
											alt="Category image"
											className="object-cover aspect-square w-full rounded-md"
											width={200}
											height={200}
										/>
										<div className="flex flex-col w-full max-w-sm gap-2">
											<Label htmlFor="file">Change image</Label>
											<Input
												{...getInputProps()}
												id="file"
												className="cursor-pointer"
											/>
										</div>
									</>
								) : (
									<label className="flex aspect-square items-center justify-center rounded-md border border-dashed cursor-pointer">
										<input {...getInputProps()} className="hidden" />
										<Upload className="h-4 w-4 text-muted-foreground" />
										<span className="sr-only">Upload</span>
									</label>
								)}
							</div>
						</>
					)}
					<Button
						type="submit"
						variant="secondary"
						disabled={isPendingUpdateCat}
					>
						{isPendingUpdateCat ? (
							<>
								<Spinner />
								Saving...
							</>
						) : (
							"Update"
						)}
					</Button>
				</form>
			)}
		</div>
	);
};
