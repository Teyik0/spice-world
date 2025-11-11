"use client";

import { useAtom } from "jotai";
import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from "@/components/ui/card";
import {
	Field,
	FieldDescription,
	FieldGroup,
	FieldLabel,
} from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { currentProductAtom, newProductAtom } from "../store";

export const ProductFormDetails = ({ isNew }: { isNew: boolean }) => {
	const [product, setProduct] = useAtom(
		isNew ? newProductAtom : currentProductAtom,
	);

	const updateProduct = (field: string, value: string) => {
		if (!product) return;
		setProduct({ ...product, [field]: value });
	};

	return (
		<Card className="rounded-md">
			<CardHeader>
				<CardTitle>Product Details</CardTitle>
				<CardDescription>Informations concerning the product</CardDescription>
			</CardHeader>
			<CardContent>
				<FieldGroup>
					<Field>
						<FieldLabel htmlFor="product-name">Name</FieldLabel>
						<Input
							id="product-name"
							name="name"
							value={product?.name || ""}
							onChange={(e) => updateProduct("name", e.target.value)}
							placeholder="Coriandre"
							autoComplete="off"
						/>
						<FieldDescription>
							The name of your product as it will appear to customers
						</FieldDescription>
					</Field>
					<Field>
						<FieldLabel htmlFor="product-description">Description</FieldLabel>
						<Textarea
							id="product-description"
							name="description"
							value={product?.description || ""}
							onChange={(e) => updateProduct("description", e.target.value)}
							placeholder="Lorem ipsum dolor sit amet, consectetur adipiscing elit. Nullam auctor, nisl nec ultricies ultricies, nunc nisl ultricies nunc, nec ultricies nunc nisl nec nunc."
							className="min-h-32"
						/>
						<FieldDescription>
							A detailed description of your product
						</FieldDescription>
					</Field>
				</FieldGroup>
			</CardContent>
		</Card>
	);
};
