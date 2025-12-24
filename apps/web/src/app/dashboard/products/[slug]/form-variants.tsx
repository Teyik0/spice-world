"use client";

import type { AttributeModel } from "@spice-world/server/modules/attributes/model";
import type { ProductModel } from "@spice-world/server/modules/products/model";
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
import type { MultiSelectOption } from "@spice-world/web/components/ui/multi-select";
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
import type { useForm } from "@spice-world/web/components/ui/tanstack-form";
import { app, elysiaErrorToString } from "@spice-world/web/lib/elysia";
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

	const categoryId = form.store.state.values.categoryId;
	const variants = form.store.state.values.variants;

	// Ensure variants is always an array
	const variantsArray = Array.isArray(variants) ? variants : [];

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

	const attributeOptions = useMemo(
		(): MultiSelectOption[] =>
			attributes.flatMap((attr) =>
				attr.values.map((val) => ({
					label: `${attr.name}: ${val.value}`,
					value: val.id,
				})),
			),
		[attributes],
	);

	// Build lookup map: valueId -> attributeId
	const valueToAttributeMap = useMemo(() => {
		const map = new Map<string, string>();
		for (const attr of attributes) {
			for (const val of attr.values) {
				map.set(val.id, attr.id);
			}
		}
		return map;
	}, [attributes]);

	// Validation function to ensure one value per attribute
	const validateOneValuePerAttribute = (selectedValueIds: string[]) => {
		const seenAttributes = new Set<string>();

		for (const valueId of selectedValueIds) {
			const attributeId = valueToAttributeMap.get(valueId);
			if (!attributeId) continue;

			if (seenAttributes.has(attributeId)) {
				const attr = attributes.find((a) => a.id === attributeId);
				return `Cannot select multiple values from "${attr?.name}". Please select only one value per attribute.`;
			}
			seenAttributes.add(attributeId);
		}

		return undefined;
	};

	// Handler to initiate creation of new attribute value
	const handleCreateNew = (variantIndex: number) => {
		return async (valueName: string): Promise<MultiSelectOption | null> => {
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
				const currentValues =
					variantsArray[currentVariantIndex]?.attributeValueIds || [];
				form.setFieldValue(
					`variants[${currentVariantIndex}].attributeValueIds`,
					[...currentValues, data.id],
				);

				toast.success("Attribute value created successfully");
			}
		} catch (_) {
			toast.error("Failed to create attribute value");
		}
	};

	const handleAddVariant = (e: React.MouseEvent<HTMLButtonElement>) => {
		e.preventDefault();
		form.setFieldValue("variants", [...variantsArray, DEFAULT_VARIANT]);
	};

	const handleRemoveVariant = (index: number) => {
		if (variantsArray.length <= 1) return;
		const updatedVariants = variantsArray.filter(
			(_: unknown, i: number) => i !== index,
		);
		form.setFieldValue("variants", updatedVariants);
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
						{variantsArray.map(
							(
								variant: {
									id?: string;
									sku?: string;
									price?: number;
									stock?: number;
									attributeValueIds?: string[];
								},
								index: number,
							) => (
								<TableRow key={variant.id || index}>
									<TableCell className="min-w-50">
										<form.AppField
											name={`variants[${index}].attributeValueIds`}
										>
											{(field) => (
												<div className="flex flex-col gap-1">
													<field.MultiSelect
														options={attributeOptions}
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
															const error =
																validateOneValuePerAttribute(newValues);
															if (error) {
																toast.error(error);
																return;
															}
															field.handleChange(newValues);
														}}
													/>
													{field.state.value?.map((v, j) => (
														<form.AppField
															key={v}
															name={`variants[${index}].attributeValueIds[${j}]`}
														>
															{(valueField) => <valueField.Message />}
														</form.AppField>
													))}
													<field.Message />
												</div>
											)}
										</form.AppField>
									</TableCell>
									<TableCell>
										<form.AppField name={`variants[${index}].sku`}>
											{(field) => (
												<div className="flex flex-col gap-1">
													<field.Input
														type="text"
														placeholder="SKU-001"
														className="min-w-25"
													/>
													<field.Message />
												</div>
											)}
										</form.AppField>
									</TableCell>
									<TableCell>
										<form.AppField name={`variants[${index}].price`}>
											{(field) => (
												<>
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
													<field.Message />
												</>
											)}
										</form.AppField>
									</TableCell>
									<TableCell>
										<form.AppField name={`variants[${index}].stock`}>
											{(field) => (
												<>
													<field.Input
														type="number"
														placeholder="0"
														min="0"
														className="w-20"
														onChange={(e) =>
															field.handleChange(Number(e.target.value))
														}
													/>
													<field.Message />
												</>
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
							),
						)}
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
