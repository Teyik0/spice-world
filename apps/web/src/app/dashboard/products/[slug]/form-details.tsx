"use client";

import type { ProductModel } from "@spice-world/server/modules/products/model";
import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from "@spice-world/web/components/ui/card";
import {
	Field,
	FieldDescription,
	FieldGroup,
} from "@spice-world/web/components/ui/field";
import type { useForm } from "@spice-world/web/components/ui/tanstack-form";
import { useSetAtom } from "jotai";
import {
	currentProductAtom,
	newProductAtom,
	type ProductItemProps,
} from "../store";

export const ProductFormDetails = ({
	form,
	isNew,
}: {
	form: ReturnType<typeof useForm<typeof ProductModel.postBody>>;
	isNew: boolean;
}) => {
	const setSidebarProduct = useSetAtom(
		isNew ? newProductAtom : currentProductAtom,
	);

	return (
		<Card className="rounded-md">
			<CardHeader>
				<CardTitle>Product Details</CardTitle>
				<CardDescription>Informations concerning the product</CardDescription>
			</CardHeader>

			<CardContent>
				<FieldGroup>
					<form.AppField
						name="name"
						validators={{
							onChange: ({ value }) => {
								setSidebarProduct((prev) => {
									return { ...(prev as ProductItemProps), name: value };
								});
							},
						}}
					>
						{(field) => (
							<Field>
								<field.Label>Name</field.Label>
								<field.Input placeholder="Coriandre" autoComplete="off" />
								<FieldDescription>
									The name of your product as it will appear to customers
								</FieldDescription>
								<field.Message />
							</Field>
						)}
					</form.AppField>
					<form.AppField
						name="description"
						validators={{
							onChange: ({ value }) => {
								setSidebarProduct((prev) => {
									return { ...(prev as ProductItemProps), description: value };
								});
							},
						}}
					>
						{(field) => (
							<Field>
								<field.Label>Description</field.Label>
								<field.Textarea
									placeholder="Lorem ipsum dolor sit amet, consectetur adipiscing elit. Nullam auctor, nisl nec ultricies ultricies, nunc nisl ultricies nunc, nec ultricies nunc nisl nec nunc."
									className="min-h-32"
								/>
								<FieldDescription>
									A detailed description of your product
								</FieldDescription>
								<field.Message />
							</Field>
						)}
					</form.AppField>
				</FieldGroup>
			</CardContent>
		</Card>
	);
};
