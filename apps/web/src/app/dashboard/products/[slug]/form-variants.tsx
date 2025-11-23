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
import { Input } from "@spice-world/web/components/ui/input";
import {
	MultiSelect,
	type MultiSelectOption,
} from "@spice-world/web/components/ui/multi-select";
import {
	Table,
	TableBody,
	TableCell,
	TableHead,
	TableHeader,
	TableRow,
} from "@spice-world/web/components/ui/table";
import type { useForm } from "@spice-world/web/components/ui/tanstack-form";
import { app } from "@spice-world/web/lib/elysia";
import { PlusCircle, Trash2 } from "lucide-react";
import { useEffect, useMemo, useState } from "react";

const DEFAULT_VARIANT = {
	price: 0,
	sku: "",
	stock: 0,
	currency: "EUR",
	attributeValueIds: [],
};

interface ProductFormVariantsProps {
	form: ReturnType<typeof useForm<typeof ProductModel.postBody>>;
}

export const ProductFormVariants = ({ form }: ProductFormVariantsProps) => {
	const [attributes, setAttributes] = useState<AttributeModel.getResult>([]);
	const [isLoadingAttributes, setIsLoadingAttributes] = useState(false);

	const categoryId = form.store.state.values.categoryId;
	const variants = form.store.state.values.variants;

	useEffect(() => {
		const fetchAttributes = async () => {
			if (!categoryId) {
				setAttributes([]);
				return;
			}
			setIsLoadingAttributes(true);
			const { data } = await app.attributes.get({
				query: { categoryId },
			});
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

	const handleAddVariant = (e: React.MouseEvent<HTMLButtonElement>) => {
		e.preventDefault();
		form.setFieldValue("variants", [...variants, DEFAULT_VARIANT]);
	};

	const handleRemoveVariant = (index: number) => {
		if (variants.length <= 1) return;
		const updatedVariants = variants.filter(
			(_: unknown, i: number) => i !== index,
		);
		form.setFieldValue("variants", updatedVariants);
	};

	const handleVariantChange = (
		index: number,
		field: "price" | "stock" | "sku" | "currency",
		value: string | number,
	) => {
		const updatedVariants = [...variants];
		const currentVariant = updatedVariants[index];

		if (!currentVariant) return;

		updatedVariants[index] = {
			...currentVariant,
			[field]: field === "sku" || field === "currency" ? value : Number(value),
		};

		form.setFieldValue("variants", updatedVariants);
	};

	const getSkuError = (index: number): string | undefined => {
		const currentSku = variants[index]?.sku;
		if (!currentSku || currentSku.trim() === "") return undefined;

		const duplicateIndex = variants.findIndex(
			(v: { sku?: string }, i: number) =>
				i !== index && v.sku && v.sku.trim() === currentSku.trim(),
		);

		if (duplicateIndex !== -1) {
			return `SKU "${currentSku}" is already used in variant ${duplicateIndex + 1}`;
		}

		return undefined;
	};

	const handleAttributeValuesChange = (index: number, valueIds: string[]) => {
		const updatedVariants = [...variants];
		const currentVariant = updatedVariants[index];

		if (!currentVariant) return;

		updatedVariants[index] = {
			...currentVariant,
			attributeValueIds: valueIds,
		};

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
							<TableHead className="w-[100px]">SKU</TableHead>
							<TableHead className="w-20">Price (€)</TableHead>
							<TableHead className="w-20">Stock</TableHead>
							<TableHead className="w-[50px]" />
						</TableRow>
					</TableHeader>
					<TableBody>
						{variants.map(
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
									<TableCell className="min-w-[200px]">
										<MultiSelect
											options={attributeOptions}
											onValueChange={(values) =>
												handleAttributeValuesChange(index, values)
											}
											defaultValue={variant.attributeValueIds || []}
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
										/>
									</TableCell>
									<TableCell>
										<div className="flex flex-col gap-1">
											<Input
												type="text"
												value={variant.sku || ""}
												onChange={(e) =>
													handleVariantChange(index, "sku", e.target.value)
												}
												placeholder="SKU-001"
												className={`min-w-[100px] ${getSkuError(index) ? "border-red-500" : ""}`}
											/>
											{getSkuError(index) && (
												<span className="text-xs text-red-500">
													{getSkuError(index)}
												</span>
											)}
										</div>
									</TableCell>
									<TableCell>
										<Input
											type="number"
											value={variant.price || 0}
											onChange={(e) =>
												handleVariantChange(index, "price", e.target.value)
											}
											placeholder="0.00"
											step="0.01"
											min="0"
											className="w-20"
										/>
									</TableCell>
									<TableCell>
										<Input
											type="number"
											value={variant.stock || 0}
											onChange={(e) =>
												handleVariantChange(index, "stock", e.target.value)
											}
											placeholder="0"
											min="0"
											className="w-20"
										/>
									</TableCell>
									<TableCell>
										<Button
											type="button"
											variant="ghost"
											size="icon"
											onClick={() => handleRemoveVariant(index)}
											disabled={variants.length <= 1}
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
		</Card>
	);
};
