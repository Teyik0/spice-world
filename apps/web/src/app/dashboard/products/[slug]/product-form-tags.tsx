"use client";

import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from "@spice-world/web/components/ui/card";
import {
	MultiSelect,
	type MultiSelectOption,
} from "@spice-world/web/components/ui/multi-select";
import { app } from "@spice-world/web/lib/elysia";
import { useAtom } from "jotai";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { currentProductAtom, newProductAtom } from "../store";

const generateRandomColor = (): string => {
	const colors = [
		"#3b82f6",
		"#ef4444",
		"#10b981",
		"#f59e0b",
		"#8b5cf6",
		"#ec4899",
		"#06b6d4",
		"#f97316",
	];
	return colors[Math.floor(Math.random() * colors.length)] || "#3b82f6";
};

export const ProductFormTags = ({ isNew }: { isNew: boolean }) => {
	const [product, setProduct] = useAtom(
		isNew ? newProductAtom : currentProductAtom,
	);
	const [tags, setTags] = useState<MultiSelectOption[]>([]);
	const [isLoading, setIsLoading] = useState(true);

	useEffect(() => {
		const fetchTags = async () => {
			setIsLoading(true);
			const { data } = await app.tags.get();
			if (data) {
				setTags(
					data.map((tag) => ({
						label: tag.name,
						value: tag.id,
					})),
				);
			}
			setIsLoading(false);
		};
		fetchTags();
	}, []);

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

	const handleTagsChange = (selectedTagIds: string[]) => {
		if (!product) return;
		setProduct({ ...product, tags: selectedTagIds });
	};

	if (!product) return null;

	return (
		<Card className="rounded-md">
			<CardHeader>
				<CardTitle>Tags</CardTitle>
				<CardDescription>
					Add tags to help categorize your product. You can create new tags by
					typing and pressing enter.
				</CardDescription>
			</CardHeader>
			<CardContent>
				<MultiSelect
					options={tags}
					onValueChange={handleTagsChange}
					defaultValue={product.tags || []}
					placeholder={isLoading ? "Loading tags..." : "Select or create tags"}
					maxCount={5}
					creatable
					onCreateNew={handleCreateTag}
					disabled={isLoading}
				/>
			</CardContent>
		</Card>
	);
};
