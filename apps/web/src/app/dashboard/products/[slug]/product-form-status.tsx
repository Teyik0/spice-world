"use client";

import { useAtom } from "jotai";
import { Card, CardContent } from "@/components/ui/card";
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/components/ui/select";
import { productAtom } from "@/lib/product";

export const ProductFormStatus = () => {
	const [product, setProduct] = useAtom(productAtom);
	if (!product) return;

	const handleStatusChange = (value: typeof product.status) => {
		if (!product) return;
		setProduct({ ...product, status: value });
	};

	return (
		<Card className="rounded-md">
			<CardContent>
				<FieldGroup>
					<Field>
						<FieldLabel htmlFor="product-status">Status</FieldLabel>
						<Select
							value={product.status ?? "DRAFT"}
							onValueChange={(e) =>
								handleStatusChange(e as typeof product.status)
							}
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
