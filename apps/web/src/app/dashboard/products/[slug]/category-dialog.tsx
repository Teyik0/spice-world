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
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";

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
					<CategoryForm categories={categories} setOpen={handleClose} />
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
				<CategoryForm categories={categories} setOpen={handleClose} />
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

const CategoryForm = ({ categories }: CategoryFormProps) => {
	const [_toggleValue, setToggleValue] = useState<
		"create" | "update" | "delete"
	>("create");

	const pathname = usePathname();
	const isNew = pathname.endsWith("new");

	const onToggleChange = (toggleValue: "create" | "update" | "delete") => {
		setToggleValue(toggleValue);
		clearFiles();
	};

	const form = useForm({
		schema: isNew ? CategoryModel.postBody : CategoryModel.patchBody,
		validationMode: "onSubmit",
		defaultValues: {
			name: categories[0]?.name ?? "",
			file: undefined,
			attributes: {
				create: undefined,
				update: undefined,
				delete: undefined,
			},
		},
		onSubmit: (values) => {
			console.log("✅ onSubmit called with values:", values);
		},
		onSubmitInvalid: ({ formApi, value }) => {
			console.log("❌ Form validation failed");
			console.log(
				"Current values:",
				JSON.stringify(value.attributes?.create, null, 2),
			);

			let hasRemovedAny = false;

			// Remove empty values from arrays
			for (const index in value.attributes?.create) {
				const values = value.attributes.create[Number(index)]?.values;
				if (!values) continue;

				console.log(`Checking attribute[${index}].values:`, values);

				// Loop backwards to avoid index shifting
				for (let j = values.length - 1; j >= 0; j--) {
					const val = values[j];
					console.log(
						`  [${j}]: "${val}" - isEmpty: ${!val || val.trim() === ""}`,
					);

					if (!val || val.trim() === "") {
						console.log(`  -> Removing empty value at index ${j}`);
						formApi.removeFieldValue(`attributes.create[${index}].values`, j);
						hasRemovedAny = true;
					}
				}
			}

			console.log("Has removed any?", hasRemovedAny);

			// Only retry if we actually removed something
			if (hasRemovedAny) {
				setTimeout(() => {
					console.log("Retrying submission after cleanup...");
					formApi.handleSubmit();
				}, 100);
			} else {
				console.log("No empty values found, stopping retry");
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
				<ToggleGroup
					className="flex w-full justify-start"
					defaultValue="create"
					onValueChange={(value) =>
						onToggleChange(value as "create" | "update" | "delete")
					}
					type="single"
				>
					<ToggleGroupItem aria-label="create" value="create" variant="outline">
						Create
					</ToggleGroupItem>
					<ToggleGroupItem aria-label="update" value="update" variant="outline">
						Update
					</ToggleGroupItem>
					<ToggleGroupItem aria-label="delete" value="delete" variant="outline">
						Delete
					</ToggleGroupItem>
				</ToggleGroup>

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
										<>
											<Image
												alt="Category image"
												className="aspect-square w-1/2 rounded-md border-2 object-cover"
												height={200}
												src={files[0].preview}
												width={200}
											/>
											<field.Input
												{...getInputProps()}
												className="absolute left-1/2 z-50 h-full w-1/2 -translate-x-1/2 cursor-pointer opacity-0"
												type="image"
											/>
										</>
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
					<Button className="col-start-3">Reset</Button>
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
