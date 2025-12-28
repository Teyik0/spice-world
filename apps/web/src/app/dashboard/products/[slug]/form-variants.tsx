"use client";

import type { AttributeModel } from "@spice-world/server/modules/attributes/model";
import type { ProductModel } from "@spice-world/server/modules/products/model";
import type { useForm } from "@spice-world/web/components/tanstack-form";
import {
	type AttributeGroup,
	AttributeSelect,
} from "@spice-world/web/components/ui/attribute-select";
import { Button } from "@spice-world/web/components/ui/button";
import {
	Card,
	CardContent,
	CardDescription,
	CardFooter,
	CardHeader,
	CardTitle,
} from "@spice-world/web/components/ui/card";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from "@spice-world/web/components/ui/dialog";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@spice-world/web/components/ui/select";
import {
	Table,
	TableBody,
	TableCell,
	TableHead,
	TableHeader,
	TableRow,
} from "@spice-world/web/components/ui/table";
import { app, elysiaErrorToString } from "@spice-world/web/lib/elysia";
import { useStore } from "@tanstack/react-form";
import { PlusCircle, Trash2 } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";

const DEFAULT_VARIANT = {
	price: 0,
	sku: "",
	stock: 0,
	currency: "EUR",
	attributeValueIds: [],
};

interface ProductFormVariantsProps {
	form: ReturnType<
		typeof useForm<typeof ProductModel.postBody | typeof ProductModel.patchBody>
	>;
}

// Inline modal component for selecting attribute when creating new value
const AttributeSelectorDialog = ({
	open,
	onOpenChange,
	attributes,
	onSelect,
	valueName,
}: {
	open: boolean;
	onOpenChange: (open: boolean) => void;
	attributes: AttributeModel.getResult;
	onSelect: (attributeId: string) => void;
	valueName: string;
}) => {
	const [selectedId, setSelectedId] = useState<string>("");

	return (
		<Dialog open={open} onOpenChange={onOpenChange}>
			<DialogContent>
				<DialogHeader>
					<DialogTitle>Select Attribute</DialogTitle>
					<DialogDescription>
						Choose which attribute "{valueName}" should belong to
					</DialogDescription>
				</DialogHeader>
				<Select value={selectedId} onValueChange={setSelectedId}>
					<SelectTrigger>
						<SelectValue placeholder="Select attribute" />
					</SelectTrigger>
					<SelectContent>
						{attributes.map((attr) => (
							<SelectItem key={attr.id} value={attr.id}>
								{attr.name}
							</SelectItem>
						))}
					</SelectContent>
				</Select>
				<DialogFooter>
					<Button variant="outline" onClick={() => onOpenChange(false)}>
						Cancel
					</Button>
					<Button
						onClick={() => {
							onSelect(selectedId);
							onOpenChange(false);
							setSelectedId("");
						}}
						disabled={!selectedId}
					>
						Create
					</Button>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	);
};

export const ProductFormVariants = ({ form }: ProductFormVariantsProps) => {
	const [attributes, setAttributes] = useState<AttributeModel.getResult>([]);
	const [isLoadingAttributes, setIsLoadingAttributes] = useState(false);
	const [isAttributeSelectorOpen, setIsAttributeSelectorOpen] = useState(false);
	const [pendingValueName, setPendingValueName] = useState<string>("");
	const [currentVariantIndex, setCurrentVariantIndex] = useState<number>(0);

	const categoryId = useStore(form.store, (state) => state.values.categoryId);
	const variants = useStore(form.store, (state) => state.values.variants);

	// Type guard to check if variants has update/delete (patchBody)
	const isPatchVariants = (
		v: typeof variants,
	): v is {
		create?: Array<{
			price: number;
			sku?: string;
			stock?: number;
			currency?: string;
			attributeValueIds: string[];
		}>;
		update?: Array<{
			id: string;
			price?: number;
			sku?: string;
			stock?: number;
			currency?: string;
			attributeValueIds?: string[];
		}>;
		delete?: string[];
	} => {
		return v !== undefined && typeof v === "object" && !("0" in v);
	};

	// Extract variants from the operations structure
	// For display purposes, we merge create + update arrays
	const variantsArray = useMemo(() => {
		if (!variants) return [];

		if (isPatchVariants(variants)) {
			const createVariants = variants.create || [];
			const updateVariants = variants.update || [];
			return [...updateVariants, ...createVariants];
		}

		// It's postBody - variants.create is the array
		return variants.create || [];
	}, [variants]);

	useEffect(() => {
		const fetchAttributes = async () => {
			if (!categoryId) {
				setAttributes([]);
				return;
			}
			setIsLoadingAttributes(true);
			const { data, error } = await app.attributes.get({
				query: { categoryId },
			});

			if (error) {
				toast.error(
					`Failed to fetch attributes: ${elysiaErrorToString(error)}`,
				);
			}

			if (data) {
				setAttributes(data);
			}
			setIsLoadingAttributes(false);
		};
		fetchAttributes();
	}, [categoryId]);

	const attributeGroups = useMemo((): AttributeGroup[] => {
		return attributes.map((attr) => ({
			attributeId: attr.id,
			attributeName: attr.name,
			values: attr.values.map((val) => ({
				id: val.id,
				value: val.value,
			})),
		}));
	}, [attributes]);

	// Handler to initiate creation of new attribute value
	const handleCreateNew = (variantIndex: number) => {
		return async (
			valueName: string,
		): Promise<{ id: string; value: string } | null> => {
			setPendingValueName(valueName);
			setCurrentVariantIndex(variantIndex);
			setIsAttributeSelectorOpen(true);
			return null; // Modal will handle the actual creation
		};
	};

	// Handler when user selects an attribute in the modal
	const handleAttributeSelected = async (attributeId: string) => {
		try {
			// Create new attribute value via API
			const { data, error } = await app
				.attributes({ id: attributeId })
				.values.post({
					name: pendingValueName,
				});

			if (error) {
				toast.error(`Failed to create value: ${elysiaErrorToString(error)}`);
				return;
			}

			if (data) {
				// Refresh attributes to include new value
				const { data: updatedAttrs } = await app.attributes.get({
					query: { categoryId },
				});
				if (updatedAttrs) {
					setAttributes(updatedAttrs);
				}

				// Auto-select the newly created value
				const variant = variantsArray[currentVariantIndex];
				if (variant && variants) {
					const currentValues = variant.attributeValueIds || [];
					const newValues = [...currentValues, data.id];

					if (isPatchVariants(variants)) {
						// Determine if this is a create or update variant
						const variantId = "id" in variant ? variant.id : undefined;
						const updateIndex = variants.update?.findIndex(
							(v) => v.id === variantId,
						);
						const createIndex = variants.create?.findIndex(
							(_, i) =>
								i === currentVariantIndex - (variants.update?.length || 0),
						);

						if (updateIndex !== undefined && updateIndex >= 0) {
							form.setFieldValue(
								`variants.update[${updateIndex as number}].attributeValueIds`,
								newValues,
							);
						} else if (createIndex !== undefined && createIndex >= 0) {
							form.setFieldValue(
								`variants.create[${createIndex as number}].attributeValueIds`,
								newValues,
							);
						}
					} else {
						form.setFieldValue(
							`variants.create[${currentVariantIndex}].attributeValueIds`,
							newValues,
						);
					}
				}

				toast.success("Attribute value created successfully");
			}
		} catch (_) {
			toast.error("Failed to create attribute value");
		}
	};

	const handleAddVariant = (e: React.MouseEvent<HTMLButtonElement>) => {
		e.preventDefault();
		if (!variants) return;

		if (isPatchVariants(variants)) {
			const currentCreate = variants.create || [];
			form.setFieldValue("variants.create", [
				...currentCreate,
				DEFAULT_VARIANT,
			]);
		} else {
			// For postBody, we need to update the entire variants object
			const currentCreate = variants.create || [];
			form.setFieldValue("variants", {
				create: [...currentCreate, DEFAULT_VARIANT],
			});
		}
	};

	const handleRemoveVariant = (index: number) => {
		if (variantsArray.length <= 1 || !variants) return;

		const variant = variantsArray[index];
		if (!variant) return;

		if (isPatchVariants(variants)) {
			// Check if it's an update variant (has id) or create variant (no id)
			const variantId = "id" in variant ? variant.id : undefined;
			if (variantId) {
				// It's an existing variant - add to delete list
				const currentDeletes = variants.delete || [];
				form.setFieldValue("variants.delete", [...currentDeletes, variantId]);

				// Also remove from update list
				const updatedUpdate = (variants.update || []).filter(
					(v) => v.id !== variantId,
				);
				form.setFieldValue("variants.update", updatedUpdate);
			} else {
				// It's a new variant - just remove from create list
				const createIndex = index - (variants.update?.length || 0);
				const updatedCreate = (variants.create || []).filter(
					(_, i) => i !== createIndex,
				);
				form.setFieldValue("variants.create", updatedCreate);
			}
		} else {
			// postBody - update the entire variants object
			const updatedCreate = (variants.create || []).filter(
				(_, i) => i !== index,
			);
			form.setFieldValue("variants", {
				create: updatedCreate,
			});
		}
	};

	return (
		<Card className="rounded-md">
			<CardHeader>
				<CardTitle>Stock & Variants</CardTitle>
				<CardDescription>
					Add product variants with attributes and manage stock
				</CardDescription>
			</CardHeader>
			<CardContent>
				<Table>
					<TableHeader>
						<TableRow>
							<TableHead>Attributes</TableHead>
							<TableHead className="w-25">SKU</TableHead>
							<TableHead className="w-20">Price (€)</TableHead>
							<TableHead className="w-20">Stock</TableHead>
							<TableHead className="w-12.5" />
						</TableRow>
					</TableHeader>
					<TableBody>
						{variantsArray.map((variant, index) => {
							const variantId = "id" in variant ? variant.id : undefined;
							let fieldPrefix:
								| `variants.create[${number}]`
								| `variants.update[${number}]`;

							if (isPatchVariants(variants)) {
								const isUpdate = variantId !== undefined;
								const updateIndex = isUpdate
									? variants.update?.findIndex((v) => v.id === variantId)
									: -1;
								const createIndex = !isUpdate
									? index - (variants.update?.length || 0)
									: -1;

								if (isUpdate) {
									fieldPrefix = `variants.update[${updateIndex as number}]`;
								} else {
									fieldPrefix = `variants.create[${createIndex}]`;
								}
							} else {
								// postBody - all variants are in create array
								fieldPrefix = `variants.create[${index}]`;
							}

							return (
								<TableRow key={variantId ?? `new-${index}`}>
									<TableCell className="min-w-50">
										<form.AppField name={`${fieldPrefix}.attributeValueIds`}>
											{(field) => (
												<div className="flex flex-col gap-1">
													<AttributeSelect
														groups={attributeGroups}
														value={field.state.value}
														placeholder={
															isLoadingAttributes
																? "Loading..."
																: !categoryId
																	? "Select category first"
																	: attributes.length === 0
																		? "No attributes available"
																		: "Select attributes"
														}
														maxCount={2}
														disabled={
															isLoadingAttributes ||
															!categoryId ||
															attributes.length === 0
														}
														className="min-w-full"
														creatable={true}
														onCreateNew={handleCreateNew(index)}
														onValueChange={(newValues) => {
															field.handleChange(newValues);
														}}
														onBlur={field.handleBlur}
													/>
													<field.Message variant="tooltip" />
												</div>
											)}
										</form.AppField>
									</TableCell>

									<TableCell>
										<form.AppField name={`${fieldPrefix}.sku`}>
											{(field) => (
												<div className="relative flex flex-col gap-1">
													<field.Input
														type="text"
														placeholder="SKU-001"
														className="min-w-25"
													/>
													<div className="absolute -top-1.5 -right-1.5 z-10">
														<field.Message variant="tooltip" />
													</div>
												</div>
											)}
										</form.AppField>
									</TableCell>

									<TableCell>
										<form.AppField name={`${fieldPrefix}.price`}>
											{(field) => (
												<div className="relative flex flex-col gap-1">
													<field.Input
														type="number"
														placeholder="0.00"
														step="0.01"
														min="0"
														className="w-20"
														onChange={(e) =>
															field.handleChange(Number(e.target.value))
														}
													/>
													<div className="absolute -top-1.5 -right-1.5 z-10">
														<field.Message variant="tooltip" />
													</div>
												</div>
											)}
										</form.AppField>
									</TableCell>

									<TableCell>
										<form.AppField name={`${fieldPrefix}.stock`}>
											{(field) => (
												<div className="relative flex flex-col gap-1">
													<field.Input
														type="number"
														placeholder="0"
														min="0"
														className="w-20"
														onChange={(e) =>
															field.handleChange(Number(e.target.value))
														}
													/>
													<div className="absolute -top-1.5 -right-1.5 z-10">
														<field.Message variant="tooltip" />
													</div>
												</div>
											)}
										</form.AppField>
									</TableCell>

									<TableCell>
										<Button
											type="button"
											variant="ghost"
											size="icon"
											onClick={() => handleRemoveVariant(index)}
											disabled={variantsArray.length <= 1}
											className="h-8 w-8"
										>
											<Trash2 className="h-4 w-4" />
											<span className="sr-only">Remove variant</span>
										</Button>
									</TableCell>
								</TableRow>
							);
						})}
					</TableBody>
				</Table>
			</CardContent>
			<CardFooter className="justify-center border-t p-4">
				<Button
					size="sm"
					variant="ghost"
					className="gap-1"
					type="button"
					onClick={handleAddVariant}
				>
					<PlusCircle className="h-3.5 w-3.5" />
					Add Variant
				</Button>
			</CardFooter>

			<AttributeSelectorDialog
				open={isAttributeSelectorOpen}
				onOpenChange={setIsAttributeSelectorOpen}
				attributes={attributes}
				onSelect={handleAttributeSelected}
				valueName={pendingValueName}
			/>
		</Card>
	);
};
