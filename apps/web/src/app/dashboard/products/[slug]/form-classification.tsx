"use client";

import type { CategoryModel } from "@spice-world/server/modules/categories/model";
import type { ProductModel } from "@spice-world/server/modules/products/model";
import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from "@spice-world/web/components/ui/card";
import { FieldGroup } from "@spice-world/web/components/ui/field";
import {
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@spice-world/web/components/ui/select";
import type { useForm } from "@spice-world/web/components/ui/tanstack-form";
import { app } from "@spice-world/web/lib/elysia";
import { useSetAtom } from "jotai";
import { useState } from "react";
import {
	currentProductAtom,
	newProductAtom,
	type ProductItemProps,
} from "../store";
import { CategoryDialog } from "./category-dialog";

interface ProductFormClassificationProps {
	form: ReturnType<
		typeof useForm<typeof ProductModel.postBody | typeof ProductModel.patchBody>
	>;
	isNew: boolean;
	initialCategories: CategoryModel.getResult;
}

export const ProductFormClassification = ({
	form,
	isNew,
	initialCategories,
}: ProductFormClassificationProps) => {
	const setSidebarProduct = useSetAtom(
		isNew ? newProductAtom : currentProductAtom,
	);

	const [categories, setCategories] =
		useState<CategoryModel.getResult>(initialCategories);

	const fetchCategories = async () => {
		const { data } = await app.categories.get();
		if (data) {
			setCategories(data);
		}
	};

	return (
		<Card className="rounded-md">
			<CardHeader>
				<div className="flex items-center justify-between">
					<CardTitle>Organization</CardTitle>
					<CategoryDialog
						categories={categories}
						onCategoryChange={fetchCategories}
					/>
				</div>
				<CardDescription>
					Manage the product's category and visibility status
				</CardDescription>
			</CardHeader>
			<CardContent>
				<FieldGroup className="gap-4">
					<form.AppField
						name="categoryId"
						validators={{
							onChange: ({ value }) => {
								setSidebarProduct((prev) => {
									return {
										...(prev as ProductItemProps),
										categoryId: value ?? "",
									};
								});
							},
						}}
					>
						{(field) => (
							<field.Field>
								<field.Label>Category</field.Label>
								<field.Select>
									<SelectTrigger>
										<SelectValue placeholder="Select category" />
									</SelectTrigger>
									<SelectContent>
										{categories.map((category) => (
											<SelectItem key={category.id} value={category.id}>
												<span className="first-letter:capitalize">
													{category.name}
												</span>
											</SelectItem>
										))}
									</SelectContent>
								</field.Select>
								<field.Message />
							</field.Field>
						)}
					</form.AppField>
					<form.AppField
						name="status"
						validators={{
							onChange: ({ value }) => {
								setSidebarProduct((prev) => {
									return {
										...(prev as ProductItemProps),
										status: value ?? "DRAFT",
									};
								});
							},
						}}
					>
						{(field) => (
							<field.Field>
								<field.Label>Status</field.Label>
								<field.Select>
									<SelectTrigger>
										<SelectValue placeholder="Select status" />
									</SelectTrigger>
									<SelectContent>
										<SelectItem value="DRAFT">Draft</SelectItem>
										<SelectItem value="PUBLISHED">Published</SelectItem>
										<SelectItem value="ARCHIVED">Archived</SelectItem>
									</SelectContent>
								</field.Select>
								<field.Message />
							</field.Field>
						)}
					</form.AppField>
				</FieldGroup>
			</CardContent>
		</Card>
	);
};
