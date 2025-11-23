"use client";

import type { CategoryModel } from "@spice-world/server/modules/categories/model";
import type { ProductModel } from "@spice-world/server/modules/products/model";
import type { TagModel } from "@spice-world/server/modules/tags/model";
import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from "@spice-world/web/components/ui/card";
import { FieldGroup } from "@spice-world/web/components/ui/field";
import type { MultiSelectOption } from "@spice-world/web/components/ui/multi-select";
import {
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@spice-world/web/components/ui/select";
import type { useForm } from "@spice-world/web/components/ui/tanstack-form";
import { app } from "@spice-world/web/lib/elysia";
import { generateRandomColor } from "@spice-world/web/lib/utils";
import { useSetAtom } from "jotai";
import { useState } from "react";
import { toast } from "sonner";
import {
	currentProductAtom,
	newProductAtom,
	type ProductItemProps,
} from "../store";
import { CategoryDialog } from "./category-dialog";

interface ProductFormOrganizationProps {
	form: ReturnType<typeof useForm<typeof ProductModel.postBody>>;
	isNew: boolean;
	initialCategories: CategoryModel.getResult;
	initialTags: TagModel.getResult;
}

export const ProductFormOrganization = ({
	form,
	isNew,
	initialCategories,
	initialTags,
}: ProductFormOrganizationProps) => {
	const setSidebarProduct = useSetAtom(
		isNew ? newProductAtom : currentProductAtom,
	);

	const [categories, setCategories] =
		useState<CategoryModel.getResult>(initialCategories);

	const [tags, setTags] = useState<MultiSelectOption[]>(
		initialTags.map((tag) => ({
			label: tag.name,
			value: tag.id,
		})),
	);

	const fetchCategories = async () => {
		const { data } = await app.categories.get();
		if (data) {
			setCategories(data);
		}
	};

	const handleCreateTag = async (
		name: string,
	): Promise<MultiSelectOption | null> => {
		try {
			const normalizedName = name.toLowerCase().trim();
			const { data, error } = await app.tags.post({
				name: normalizedName,
				badgeColor: generateRandomColor(),
			});

			if (error) {
				toast.error(`Failed to create tag: ${error.value}`);
				return null;
			}

			if (data) {
				const newTag = {
					label: data.name,
					value: data.id,
				};
				setTags((prev) => [...prev, newTag]);
				toast.success(`Tag "${data.name}" created successfully`);
				return newTag;
			}
		} catch (err) {
			toast.error("Failed to create tag");
			console.error(err);
		}
		return null;
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
					Manage the product's category, tags and visibility status
				</CardDescription>
			</CardHeader>
			<CardContent>
				<FieldGroup className="gap-4">
					<form.AppField
						name="categoryId"
						validators={{
							onChange: ({ value }) => {
								setSidebarProduct((prev) => {
									return { ...(prev as ProductItemProps), categoryId: value };
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
									return { ...(prev as ProductItemProps), status: value };
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
					<form.AppField name="tags">
						{(field) => (
							<field.Field>
								<field.Label>Tags</field.Label>
								<field.MultiSelect
									options={tags}
									placeholder="Select or create tags"
									maxCount={5}
									creatable
									onCreateNew={handleCreateTag}
								/>
								<field.Message />
							</field.Field>
						)}
					</form.AppField>
				</FieldGroup>
			</CardContent>
		</Card>
	);
};
