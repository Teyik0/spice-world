import { CategoryModel } from "@spice-world/server/modules/categories/model";
import { Button } from "@spice-world/web/components/ui/button";
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
import type { MultiSelectOption } from "@spice-world/web/components/ui/multi-select";
import {
	Select,
	SelectContent,
	SelectGroup,
	SelectItem,
	SelectLabel,
	SelectTrigger,
	SelectValue,
} from "@spice-world/web/components/ui/select";
import { Form, useForm } from "@spice-world/web/components/ui/tanstack-form";
import { useFileUpload } from "@spice-world/web/hooks/use-file-upload";
import { useIsMobile } from "@spice-world/web/hooks/use-mobile";
import { app } from "@spice-world/web/lib/elysia";
import { Edit2, ImageIcon, Trash2Icon } from "lucide-react";
import Image from "next/image";
import { useEffect, useState } from "react";
import { toast } from "sonner";

interface CategoryDialogProps {
	categories: CategoryModel.getResult;
	onCategoryChange: () => void;
}

export const CategoryDialog = ({
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
			<Dialog onOpenChange={setOpen} open={open}>
				<DialogTrigger asChild>
					<Button size="icon-sm" variant="outline">
						<Edit2 className="h-3 w-3" />
					</Button>
				</DialogTrigger>
				<DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-150">
					<DialogHeader>
						<DialogTitle>Edit category</DialogTitle>
						<DialogDescription>
							Add, update or delete categories here. Click save when you&apos;re
							done.
						</DialogDescription>
					</DialogHeader>
					<CategoryForm categories={categories} handleClose={handleClose} />
				</DialogContent>
			</Dialog>
		);
	}

	return (
		<Drawer onOpenChange={setOpen} open={open}>
			<DrawerTrigger asChild>
				<Button size="icon-sm" variant="outline">
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
				<CategoryForm categories={categories} handleClose={handleClose} />
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
	handleClose: () => void;
	categories: CategoryModel.getResult;
}

const CategoryForm = ({ categories, handleClose }: CategoryFormProps) => {
	const [toggleValue, setToggleValue] = useState<string>("new");
	const [originalImageUrl, setOriginalImageUrl] = useState<string | null>(null);

	const resetForm = () => {
		setToggleValue("new");
		setOriginalImageUrl(null);
		form.reset(undefined, {});
		clearFiles();
	};

	const onToggleChange = (value: string) => {
		if (value === "new") {
			resetForm();
		} else {
			const selectedCategory = categories.find(
				(category) => category.id === value,
			);
			if (selectedCategory) {
				setToggleValue(selectedCategory.id);
				setOriginalImageUrl(selectedCategory.image.url);
				form.setFieldValue("name", selectedCategory.name);
				form.setFieldValue("attributes.create", []);
				form.setFieldValue("file", undefined);
				clearFiles();
			}
		}
	};

	const form = useForm({
		schema:
			toggleValue === "new" ? CategoryModel.postBody : CategoryModel.patchBody,
		validationMode: "onSubmit",
		defaultValues: {
			name: toggleValue === "new" ? "" : (categories[0]?.name ?? ""),
			file: undefined,
			attributes: {
				create: undefined,
				update: undefined,
				delete: undefined,
			},
		},
		onSubmit: async (values) => {
			switch (toggleValue) {
				case "new": {
					const { error } = await app.categories.post(
						values as CategoryModel.postBody,
					);
					if (error) {
						const errorMessage =
							typeof error.value === "string"
								? error.value
								: error.value.message;
						toast.error(
							`Failed to create category with error ${error.status}: ${errorMessage}`,
						);
						return;
					}
					toast.success("Category created successfully");
					handleClose();
					break;
				}

				default: {
					const { error } = await app
						.categories({ id: toggleValue })
						.patch(values as CategoryModel.patchBody);

					if (error) {
						const errorMessage =
							typeof error.value === "string"
								? error.value
								: error.value.message;
						toast.error(
							`Failed to update category with error ${error.status}: ${errorMessage}`,
						);
						return;
					}
					toast.success("Category updated successfully");
					handleClose();
					break;
				}
			}
		},
	});

	const [{ files }, { getInputProps, clearFiles }] = useFileUpload({
		maxFiles: 1,
		maxSize: 1024 * 1024 * 3,
		accept: "image/*",
		multiple: false,
	});

	useEffect(() => {
		const file = files[0]?.file;
		form.setFieldValue("file", file instanceof File ? file : undefined);
	}, [files, form]);

	return (
		<div>
			<Form className="grid items-start gap-4 px-4 md:px-0" form={form}>
				<Select
					defaultValue="new"
					onValueChange={(value) => onToggleChange(value)}
					value={toggleValue}
				>
					<SelectTrigger className="w-45 capitalize">
						<SelectValue placeholder="Select a category" />
					</SelectTrigger>
					<SelectContent>
						<SelectGroup>
							<SelectLabel>Category</SelectLabel>
							<SelectItem value="new">New</SelectItem>
							{categories.map((category) => (
								<SelectItem
									key={category.id}
									value={category.id}
									className="capitalize"
								>
									{category.name}
								</SelectItem>
							))}
						</SelectGroup>
					</SelectContent>
				</Select>

				<div className="flex flex-col gap-4">
					<form.AppField name="name">
						{(field) => (
							<field.Field>
								<field.Label>Name</field.Label>
								<field.Input
									id="name"
									onChange={(e) =>
										field.handleChange(e.target.value.toLowerCase())
									}
									placeholder="Épices"
									type="text"
								/>
								<field.Message />
							</field.Field>
						)}
					</form.AppField>

					<form.AppField mode="array" name="attributes.create">
						{(field) => (
							<field.Field>
								<div className="flex items-center justify-between">
									<field.Label>Attributes</field.Label>
									<Button
										onClick={() => field.pushValue({ name: "", values: [] })}
										size="sm"
										type="button"
										variant="outline"
									>
										New attributes
									</Button>
								</div>

								{field.state.value?.map((_, index) => (
									// biome-ignore lint/suspicious/noArrayIndexKey: throw user from input field otherwise
									<field.Content className="grid grid-cols-8 gap-4" key={index}>
										<form.AppField name={`attributes.create[${index}].name`}>
											{(aField) => (
												<aField.Content className="col-span-3">
													<aField.Input
														onChange={(e) =>
															aField.handleChange(e.target.value.toLowerCase())
														}
														placeholder="couleur"
														type="text"
													/>
													<aField.Message />
												</aField.Content>
											)}
										</form.AppField>
										<form.AppField
											mode="array"
											name={`attributes.create[${index}].values`}
											listeners={{
												onChange: ({ value, fieldApi }) => {
													// When values change, clear error state for removed indices
													const currentLength = value?.length ?? 0;
													const allFieldKeys = Object.keys(
														form.state.fieldMeta,
													);

													// Find and clear metadata for indices that no longer exist
													for (const key of allFieldKeys) {
														const match = key.match(
															new RegExp(
																`attributes\\.create\\[${index}\\]\\.values\\[(\\d+)\\]`,
															),
														);
														if (match) {
															const idx = Number(match[1]);
															if (idx >= currentLength) {
																// This index no longer exists, clear its metadata
																fieldApi.form.setFieldMeta(
																	key as any,
																	(prev) => ({
																		...prev,
																		errorMap: {},
																		errors: [],
																	}),
																);
															}
														}
													}
												},
											}}
										>
											{(avField) => (
												<avField.Content className="col-span-4">
													<avField.MultiSelect
														creatable
														maxCount={5}
														onCreateNew={async (value) => {
															avField.pushValue(value);
															return {
																label: value.toLowerCase(),
																value: value.toLowerCase(),
															};
														}}
														options={
															avField.state.value?.map(
																(v) =>
																	({
																		label: v,
																		value: v,
																	}) as MultiSelectOption,
															) ?? null
														}
														placeholder="Select or create attribute values"
													/>
													{avField.state.value?.map((v, j) => (
														<form.AppField
															key={v}
															name={`attributes.create[${index}].values[${j}]`}
														>
															{(valueField) => <valueField.Message />}
														</form.AppField>
													))}
													<avField.Message />
												</avField.Content>
											)}
										</form.AppField>
										<Button asChild onClick={() => field.removeValue(index)}>
											<Trash2Icon className="col-span-1 w-full bg-red-900 text-black hover:bg-red-800 hover:text-black" />
										</Button>
									</field.Content>
								))}
								<field.Message />
							</field.Field>
						)}
					</form.AppField>

					<form.AppField name="file">
						{(field) => (
							<field.Field>
								<field.Label>Image</field.Label>
								<field.Content className="relative flex items-center justify-center">
									{files.length > 0 && files[0]?.preview ? (
										<div className="relative w-1/2">
											<Image
												alt="Category image"
												className="aspect-square w-full rounded-md border-2 object-cover"
												height={200}
												src={files[0].preview}
												width={200}
											/>
											<input
												{...getInputProps()}
												className="absolute inset-0 z-50 h-full w-full cursor-pointer opacity-0"
												type="file"
											/>
										</div>
									) : originalImageUrl ? (
										<div className="relative w-1/2">
											<Image
												alt="Category image"
												className="aspect-square w-full rounded-md border-2 object-cover"
												height={200}
												src={originalImageUrl}
												width={200}
											/>
											<input
												{...getInputProps()}
												className="absolute inset-0 z-50 h-full w-full cursor-pointer opacity-0"
												type="file"
											/>
										</div>
									) : (
										<div className="relative flex cursor-pointer items-center justify-center rounded-md border-2 border-input border-dashed p-16">
											<field.Input
												{...getInputProps()}
												className="absolute inset-0 z-50 h-full w-full cursor-pointer opacity-0"
											/>
											<div className="flex flex-col items-center justify-center text-center">
												<div
													aria-hidden="true"
													className="mb-2 flex h-11 w-11 shrink-0 items-center justify-center rounded-full border bg-background"
												>
													<ImageIcon className="h-4 w-4 opacity-60" />
												</div>
												<p className="mb-1.5 font-medium text-sm">
													Drop your images here
												</p>
												<p className="text-muted-foreground text-xs">
													or click to browse
												</p>
											</div>
										</div>
									)}
									<field.Message />
								</field.Content>
							</field.Field>
						)}
					</form.AppField>
				</div>

				<div className="mt-4 grid grid-cols-4 justify-end gap-4">
					<Button className="col-start-3" type="button" onClick={resetForm}>
						Reset
					</Button>
					<form.SubmitButton
						className="col-span-1 col-start-4"
						variant="outline"
					>
						Save
					</form.SubmitButton>
				</div>
			</Form>
		</div>
	);
};
