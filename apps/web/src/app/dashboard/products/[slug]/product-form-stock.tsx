"use client";

import { useAtom } from "jotai";
import { PlusCircle, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
	Card,
	CardContent,
	CardDescription,
	CardFooter,
	CardHeader,
	CardTitle,
} from "@/components/ui/card";
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import {
	Table,
	TableBody,
	TableCell,
	TableHead,
	TableHeader,
	TableRow,
} from "@/components/ui/table";
import { currentProductAtom, newProductAtom } from "../store";

const DEFAULT_VARIANT = {
	price: 0,
	sku: "",
	stock: 0,
	currency: "EUR",
	attributeValueIds: [],
};

export const ProductFormStock = ({ isNew }: { isNew: boolean }) => {
	const [currentProduct, setProduct] = useAtom(
		isNew ? newProductAtom : currentProductAtom,
	);

	const variants =
		currentProduct && "variants" in currentProduct
			? currentProduct.variants && currentProduct.variants.length > 0
				? currentProduct.variants
				: [DEFAULT_VARIANT]
			: [DEFAULT_VARIANT];

	const handleAddVariant = (e: React.MouseEvent<HTMLButtonElement>) => {
		e.preventDefault();
		if (!currentProduct || !("variants" in currentProduct)) return;

		setProduct({
			...currentProduct,
			variants: [
				...(currentProduct.variants || [DEFAULT_VARIANT]),
				DEFAULT_VARIANT,
			],
		});
	};

	const handleRemoveVariant = (index: number) => {
		if (!currentProduct || !("variants" in currentProduct)) return;

		const updatedVariants = [...(currentProduct.variants || [])];

		// Prevent deletion if only one variant remains
		if (updatedVariants.length <= 1) {
			return;
		}

		updatedVariants.splice(index, 1);

		setProduct({
			...currentProduct,
			variants: updatedVariants,
		});
	};

	const handleVariantChange = (
		index: number,
		field: "price" | "stock" | "sku",
		value: string | number,
	) => {
		if (!currentProduct || !("variants" in currentProduct)) return;

		const updatedVariants = [...(currentProduct.variants || [])];
		const currentVariant = updatedVariants[index];

		if (!currentVariant) return;

		updatedVariants[index] = {
			...currentVariant,
			price: currentVariant.price ?? 0,
			attributeValueIds: currentVariant.attributeValueIds ?? [],
			[field]: field === "sku" ? value : Number(value),
		};

		setProduct({
			...currentProduct,
			variants: updatedVariants,
		});
	};

	const totalStock = variants.reduce(
		(sum, variant) => sum + (variant.stock || 0),
		0,
	);

	if (!currentProduct || !("variants" in currentProduct)) {
		return null;
	}

	return (
		<Card className="rounded-md">
			<CardHeader>
				<CardTitle>Stock</CardTitle>
				<CardDescription>Add product variants and manage stock</CardDescription>
				<FieldGroup className="mt-6">
					<Field>
						<FieldLabel htmlFor="total-stock">
							Total Stock Quantity (items)
						</FieldLabel>
						<Input
							id="total-stock"
							type="number"
							value={totalStock}
							disabled
							className="bg-muted"
						/>
					</Field>
				</FieldGroup>
			</CardHeader>
			<CardContent>
				<Table>
					<TableHeader>
						<TableRow>
							<TableHead className="w-[70px]">SKU</TableHead>
							<TableHead className="w-[50px]">Price (€)</TableHead>
							<TableHead className="w-[50px]">Stock</TableHead>
							<TableHead className="w-[30px]" />
						</TableRow>
					</TableHeader>
					<TableBody>
						{variants.map((variant, index) => (
							<TableRow key={index}>
								<TableCell>
									<Input
										type="text"
										value={variant.sku || ""}
										onChange={(e) =>
											handleVariantChange(index, "sku", e.target.value)
										}
										placeholder="SKU-001"
										className="min-w-[120px]"
									/>
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
										className="min-w-[100px]"
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
										className="w-[100px]"
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
						))}
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
