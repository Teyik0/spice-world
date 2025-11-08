"use client";

import { useAtom } from "jotai";
import { Edit2, Upload } from "lucide-react";
import Image from "next/image";
import { useCallback, useState } from "react";
import { toast } from "sonner";
import { z } from "zod";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogHeader,
	DialogTitle,
	DialogTrigger,
} from "@/components/ui/dialog";
import {
	Drawer,
	DrawerClose,
	DrawerContent,
	DrawerDescription,
	DrawerFooter,
	DrawerHeader,
	DrawerTitle,
	DrawerTrigger,
} from "@/components/ui/drawer";
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/components/ui/select";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { useIsMobile } from "@/hooks/use-mobile";
import { type GetCategory, productAtom } from "@/lib/product";
import { app, cn } from "@/lib/utils";

export const ProductFormCategory = ({
	initialCategories,
}: {
	initialCategories: GetCategory[];
}) => {
	const [product, setProduct] = useAtom(productAtom);
	const [categories, setCategories] =
		useState<GetCategory[]>(initialCategories);

	const fetchCategories = useCallback(async () => {
		const response = await app.categories.get();
		if (response.data) {
			setCategories(response.data);
		}
	}, []);

	const handleCategoryChange = (value: string) => {
		if (!product) return;
		setProduct({ ...product, categoryId: value });
	};

	return (
		<Card x-chunk="dashboard-07-chunk-2">
			<CardContent>
				<FieldGroup>
					<Field>
						<div className="flex justify-between">
							<FieldLabel htmlFor="product-category">Category</FieldLabel>
							<CategoryDialog
								categories={categories}
								onCategoryChange={fetchCategories}
							/>
						</div>
						<Select
							value={product?.categoryId || ""}
							onValueChange={handleCategoryChange}
						>
							<SelectTrigger id="product-category">
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
						<Edit2 size={8} />
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
				<Button variant="outline">
					<Edit2 size={16} />
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

const categoryFormSchema = z.object({
	name: z.string().min(4).max(20),
	imageUrl: z.url(),
});

interface CategoryFormProps {
	setOpen: () => void;
	categories: GetCategory[];
}

const CategoryForm = ({ setOpen, categories }: CategoryFormProps) => {
	const [toggleValue, setToggleValue] = useState<"new" | "update" | "delete">(
		"new",
	);

	const [name, setName] = useState("");
	const [imageUrl, setImageUrl] = useState<string | null>(null);
	const [file, setFile] = useState<File | null>(null);

	const [selectedCategory, setSelectedCategory] = useState<GetCategory | null>(
		null,
	);

	const handleNew = async () => {
		try {
			if (!file) throw new Error("No file selected");
			categoryFormSchema.parse({ name, imageUrl });

			const response = await app.categories.post({
				name,
				file,
			});

			if (response.error) {
				throw new Error(response.error.value as string);
			}

			toast.success("Category created successfully");
			setOpen();
		} catch (error) {
			console.log(error);
			toast.error("Couldn't create category. Fill the form!");
		}
	};

	const handleUpdate = async () => {
		try {
			if (!selectedCategory) throw new Error("Category not found");

			const response = await app.categories({ id: selectedCategory.id }).patch({
				name: name !== selectedCategory.name ? name : undefined,
				file: file || undefined,
			});

			if (response.error) {
				throw new Error(response.error.value as string);
			}

			toast.success("Category updated successfully");
			setOpen();
		} catch (error) {
			const errorMessage =
				error instanceof Error ? error.message : "Unknown error";
			console.log(error);
			toast.error(errorMessage);
		}
	};

	const handleFile = (event: React.ChangeEvent<HTMLInputElement>) => {
		const file = event.target.files?.[0];
		if (!file) return;
		console.log(file.name);
		const maxSize = 1024 * 1024; // 1 MB
		if (file.size > maxSize) {
			toast.error("File size must be less than 1MB.");
			return;
		}
		setFile(file);
		const imageUrl = URL.createObjectURL(file);
		setImageUrl(imageUrl);
	};

	return (
		<div className={cn("grid items-start gap-4 px-4 md:px-0")}>
			<ToggleGroup
				type="single"
				className="flex w-full justify-start"
				onValueChange={(value) => {
					if (value) {
						setToggleValue(value as "new" | "delete" | "update");
						setSelectedCategory(null);
						setName("");
						setImageUrl(null);
						setFile(null);
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
				<>
					<div className="grid gap-2 mt-4">
						<Label htmlFor="name">Name</Label>
						<Input
							type="text"
							id="name"
							placeholder="Épices"
							value={name}
							onChange={(e) => setName(e.target.value)}
						/>
					</div>
					<div className="grid grid-cols-2 gap-4">
						{imageUrl ? (
							<>
								<Image
									src={imageUrl}
									alt="Category image"
									className="object-cover aspect-square w-full rounded-md"
									width={200}
									height={200}
								/>
								<div className="flex flex-col w-full max-w-sm gap-2">
									<Label htmlFor="file">Change image</Label>
									<Input
										type="file"
										accept=".webp, .jpg, .jpeg, .png"
										onChange={(event) => handleFile(event)}
										className="cursor-pointer"
									/>
								</div>
							</>
						) : (
							<label className="flex aspect-square items-center justify-center rounded-md border border-dashed cursor-pointer">
								<input
									type="file"
									accept=".webp, .jpg, .jpeg, .png"
									className="hidden"
									onChange={(event) => handleFile(event)}
								/>
								<Upload className="h-4 w-4 text-muted-foreground" />
								<span className="sr-only">Upload</span>
							</label>
						)}
					</div>
					<Button type="button" variant="secondary" onClick={() => handleNew()}>
						Save
					</Button>
				</>
			)}

			{toggleValue === "update" && (
				<>
					<Label htmlFor="category" className="mt-4">
						Category
					</Label>
					<Select
						onValueChange={(value) => {
							const category = categories.find((cat) => cat.name === value);
							if (category) {
								setName(value);
								setSelectedCategory(category);
							}
						}}
					>
						<SelectTrigger id="category" aria-label="Select category">
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
						<div>
							<div className="grid gap-2">
								<Label htmlFor="name">Rename</Label>
								<Input
									type="text"
									id="name"
									placeholder="Épices"
									value={name}
									onChange={(e) => setName(e.target.value)}
								/>
							</div>
							<div className="grid grid-cols-2 gap-4">
								{imageUrl ? (
									<>
										<Image
											src={imageUrl}
											alt="Category image"
											className="object-cover aspect-square w-full rounded-md mt-4"
											width={200}
											height={200}
										/>
										<div className="flex flex-col w-full max-w-sm gap-2 mt-4">
											<Label htmlFor="file">Change image</Label>
											<Input
												type="file"
												accept=".webp, .jpg, .jpeg, .png"
												onChange={(event) => handleFile(event)}
												className="cursor-pointer"
											/>
										</div>
									</>
								) : (
									<label className="flex aspect-square items-center justify-center rounded-md border border-dashed cursor-pointer mt-4">
										<input
											type="file"
											accept=".webp, .jpg, .jpeg, .png"
											className="hidden"
											onChange={(event) => handleFile(event)}
										/>
										<Upload className="h-4 w-4 text-muted-foreground" />
										<span className="sr-only">Upload</span>
									</label>
								)}
							</div>
						</div>
					)}
					<Button
						type="button"
						variant="secondary"
						onClick={() => handleUpdate()}
					>
						Update
					</Button>
				</>
			)}
		</div>
	);
};
