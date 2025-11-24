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
import { Form, useForm } from "@spice-world/web/components/ui/tanstack-form";
import {
	ToggleGroup,
	ToggleGroupItem,
} from "@spice-world/web/components/ui/toggle-group";
import { useFileUpload } from "@spice-world/web/hooks/use-file-upload";
import { useIsMobile } from "@spice-world/web/hooks/use-mobile";
import { Edit2, ImageIcon, Trash2Icon } from "lucide-react";
import Image from "next/image";
import { useState } from "react";

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
			<Dialog open={open} onOpenChange={setOpen}>
				<DialogTrigger asChild>
					<Button variant="outline" size="icon-sm">
						<Edit2 className="h-3 w-3" />
					</Button>
				</DialogTrigger>
				<DialogContent className="sm:max-w-[600px] max-h-[90vh] overflow-y-auto">
					<DialogHeader>
						<DialogTitle>Edit category</DialogTitle>
						<DialogDescription>
							Add, update or delete categories here. Click save when you&apos;re
							done.
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
	categories: CategoryModel.getResult;
}

const CategoryForm = ({ setOpen, categories }: CategoryFormProps) => {
	const [toggleValue, setToggleValue] = useState<
		"create" | "update" | "delete"
	>("create");

	const onToggleChange = (toggleValue: "create" | "update" | "delete") => {
		setToggleValue(toggleValue);
		clearFiles();
	};

	const [{ files, errors }, { getInputProps, clearFiles }] = useFileUpload({
		maxFiles: 1,
		maxSize: 1024 * 1024 * 3,
		accept: "image/*",
		multiple: false,
	});

	const form = useForm({
		schema: CategoryModel.patchBody,
		validationMode: "onBlur",
		defaultValues: {
			name: categories[0]?.name ?? "",
			file: undefined,
			attributes: {
				create: undefined,
				update: undefined,
				delete: undefined,
			},
		},
		onSubmit: async (values) => {
			console.log("✅ onSubmit called with values:", values);
		},
	});

	return (
		<div>
			<Form form={form} className="grid items-start gap-4 px-4 md:px-0">
				<ToggleGroup
					type="single"
					className="flex w-full justify-start"
					onValueChange={(value) =>
						onToggleChange(value as "create" | "update" | "delete")
					}
					defaultValue="create"
				>
					<ToggleGroupItem value="create" aria-label="create" variant="outline">
						Create
					</ToggleGroupItem>
					<ToggleGroupItem value="update" aria-label="update" variant="outline">
						Update
					</ToggleGroupItem>
					<ToggleGroupItem value="delete" aria-label="delete" variant="outline">
						Delete
					</ToggleGroupItem>
				</ToggleGroup>

				{toggleValue === "create" && (
					<div className="flex flex-col gap-4">
						<form.AppField name="name">
							{(field) => (
								<field.Field>
									<field.Label>Name</field.Label>
									<field.Input type="text" id="name" placeholder="Épices" />
									<field.Message />
								</field.Field>
							)}
						</form.AppField>

						<form.AppField name="attributes.create" mode="array">
							{(field) => (
								<field.Field>
									<div className="flex justify-between items-center">
										<field.Label>Attributes</field.Label>
										<Button
											type="button"
											size="sm"
											variant="outline"
											onClick={() => field.pushValue({ name: "", values: [] })}
										>
											New attributes
										</Button>
									</div>

									{field.state.value?.map((_, index) => (
										<field.Content
											className="grid grid-cols-8 gap-4"
											key={index}
										>
											<form.AppField name={`attributes.create[${index}].name`}>
												{(aField) => (
													<aField.Content className="col-span-3">
														<aField.Input type="text" placeholder="couleur" />
														<aField.Message />
													</aField.Content>
												)}
											</form.AppField>
											<form.AppField
												name={`attributes.create[${index}].values`}
												mode="array"
											>
												{(avField) => (
													<avField.Content className="col-span-4">
														<avField.MultiSelect
															options={
																avField.state.value?.map((v) => {
																	return {
																		label: v,
																		value: v,
																	} as MultiSelectOption;
																}) ?? null
															}
															placeholder="Select or create attribute values"
															maxCount={5}
															creatable
															onCreateNew={async (value) => {
																avField.pushValue(value);
																return {
																	label: value,
																	value: value,
																};
															}}
														/>
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
									<field.Content className="flex justify-center items-center relative">
										{files.length > 0 && files[0]?.preview ? (
											<>
												<Image
													src={files[0].preview}
													alt="Category image"
													className="object-cover aspect-square w-1/2 rounded-md border-2"
													width={200}
													height={200}
												/>
												<field.Input
													{...getInputProps()}
													type="image"
													className="absolute  left-1/2 -translate-x-1/2 z-50 w-1/2 h-full opacity-0 cursor-pointer"
												/>
											</>
										) : (
											<div
												className="relative flex p-16 items-center justify-center rounded-md
										                  border-2 border-dashed border-input cursor-pointer"
											>
												<field.Input
													{...getInputProps()}
													className="absolute inset-0 z-50 w-full h-full opacity-0 cursor-pointer"
												/>
												<div className="flex flex-col items-center justify-center text-center">
													<div
														className="mb-2 flex h-11 w-11 shrink-0 items-center justify-center rounded-full border bg-background"
														aria-hidden="true"
													>
														<ImageIcon className="h-4 w-4 opacity-60" />
													</div>
													<p className="mb-1.5 text-sm font-medium">
														Drop your images here
													</p>
													<p className="text-xs text-muted-foreground">
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
				)}
				<div className="grid grid-cols-4 justify-end mt-4 gap-4">
					<Button className="col-start-3">Reset</Button>
					<form.SubmitButton
						type="submit"
						variant="outline"
						className="col-span-1 col-start-4"
					>
						Save
					</form.SubmitButton>
				</div>
			</Form>
		</div>
	);
};
