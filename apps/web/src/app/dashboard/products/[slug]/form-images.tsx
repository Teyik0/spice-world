"use client";

import type { ProductModel } from "@spice-world/server/modules/products/model";
import type { useForm } from "@spice-world/web/components/tanstack-form";
import { Button } from "@spice-world/web/components/ui/button";
import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from "@spice-world/web/components/ui/card";
import type { CarouselApi } from "@spice-world/web/components/ui/carousel";
import {
	Carousel,
	CarouselContent,
	CarouselItem,
	CarouselNext,
	CarouselPrevious,
} from "@spice-world/web/components/ui/carousel";
import {
	type FileMetadata,
	type FileWithPreview,
	formatBytes,
	useFileUpload,
} from "@spice-world/web/hooks/use-file-upload";
import { useSetAtom } from "jotai";
import { ImageIcon, RefreshCw, Star, Trash2Icon, Upload } from "lucide-react";
import Image from "next/image";
import { type InputHTMLAttributes, useEffect, useMemo, useState } from "react";
import {
	currentProductAtom,
	newProductAtom,
	type ProductItemProps,
} from "../store";

const MAX_IMAGES = 5;
const MAX_FILE_SIZE = 1024 * 1024 * 3;

interface ExistingImage {
	id: string;
	url: string;
	altText: string | null;
	isThumbnail: boolean;
}

interface ProductFormImagesProps {
	isNew: boolean;
	form: ReturnType<
		typeof useForm<typeof ProductModel.postBody | typeof ProductModel.patchBody>
	>;
	existingImages?: ExistingImage[];
}

export const ProductFormImages = ({
	isNew,
	form,
	existingImages = [],
}: ProductFormImagesProps) => {
	const setSidebarProduct = useSetAtom(
		isNew ? newProductAtom : currentProductAtom,
	);

	const [api, setApi] = useState<CarouselApi>();
	const [current, setCurrent] = useState(0);

	const [
		{ files },
		{ removeFile, getInputProps, setThumbnail, openFileDialog },
	] = useFileUpload({
		maxFiles: MAX_IMAGES,
		maxSize: MAX_FILE_SIZE,
		accept: "image/*",
		multiple: true,
	});

	const existingImagesWithPreview = useMemo(
		() =>
			existingImages.map(
				(img) =>
					({
						file: {
							name: img.altText || "image",
							size: 0,
							type: "image/*",
							url: img.url,
							id: img.id,
						} as FileMetadata,
						id: img.id,
						preview: img.url,
						isThumbnail: img.isThumbnail,
					}) as FileWithPreview,
			),
		[existingImages],
	);

	useEffect(() => {
		const fileObjects = files
			.map((f) => f.file)
			.filter((f): f is File => f instanceof File);

		form.setFieldValue("images", fileObjects);

		// Build imagesOps.create array with fileIndex references
		if (files.length > 0) {
			const imagesOpsCreate = files.map((f, index) => ({
				fileIndex: index,
				altText: f.file.name,
				isThumbnail: f.isThumbnail ?? false,
			}));

			form.setFieldValue("imagesOps.create", imagesOpsCreate);
		} else {
			form.setFieldValue("imagesOps.create", undefined);
		}
	}, [files, form]);

	// Track carousel state
	useEffect(() => {
		if (!api) return;
		setCurrent(api.selectedScrollSnap() + 1);
		api.on("select", () => {
			setCurrent(api.selectedScrollSnap() + 1);
		});
	}, [api]);

	// Using useEffect to avoid state updates during render
	useEffect(() => {
		setSidebarProduct((prev) => {
			return {
				...(prev as ProductItemProps),
				img:
					files.find((img) => img.isThumbnail)?.preview ??
					files[0]?.preview ??
					null,
			};
		});
	}, [files, setSidebarProduct]);

	return (
		<Card className="overflow-hidden rounded-md min-w-xs">
			<CardHeader>
				<CardTitle>Product Images</CardTitle>
				<CardDescription>
					Upload images for your product. You can upload up to {MAX_IMAGES}{" "}
					images (max {formatBytes(MAX_FILE_SIZE)} each).
				</CardDescription>
			</CardHeader>

			<CardContent>
				{form.getFieldValue("imagesOps.create")?.length ||
				form.getFieldValue("imagesOps.update")?.length ? (
					<Carousel
						opts={{
							align: "start",
							loop: true,
						}}
						setApi={setApi}
						className="w-full"
					>
						<span className="absolute top-3 left-3 z-50 text-xs font-bold bg-background/80 backdrop-blur-sm rounded px-2 py-1">
							{current} /{" "}
							{files.length +
								existingImages.filter(
									(img) =>
										!form.getFieldValue("imagesOps.delete")?.includes(img.id),
								).length}
						</span>
						<CarouselContent>
							<ImageForm form={form} files={files} imField="imagesOps.create" />
							{existingImages.length > 0 && (
								<ImageForm
									form={form}
									files={existingImagesWithPreview}
									imField="imagesOps.update"
								/>
							)}
						</CarouselContent>
						<CarouselPrevious
							type="button"
							className="-left-6 size-6 bg-background/80! hover:bg-background/1! backdrop-blur-sm rounded-none"
						/>
						<CarouselNext
							type="button"
							className="-right-6 size-6 bg-background/80! hover:bg-background/1! backdrop-blur-sm rounded-none"
						/>
						<div className="mt-4">
							<input {...getInputProps()} className="hidden" />
							{files.length < MAX_IMAGES && (
								<Button
									type="button"
									variant="outline"
									size="sm"
									onClick={openFileDialog}
								>
									<Upload className="-ms-0.5 h-3.5 w-3.5 opacity-60" />
									Add more
								</Button>
							)}
						</div>
					</Carousel>
				) : (
					<DropZone {...getInputProps()} />
				)}
			</CardContent>
		</Card>
	);
};

interface ImageFormProps {
	form: ReturnType<
		typeof useForm<typeof ProductModel.postBody | typeof ProductModel.patchBody>
	>;
	files: FileWithPreview[];
	imField: "imagesOps.create" | "imagesOps.update";
}
function ImageForm({ form, files, imField }: ImageFormProps) {
	const isUpdate = imField === "imagesOps.update";
	const [imagePreviews, setImagePreviews] = useState<Record<string, string>>(
		{},
	);

	return (
		<form.AppField name={imField} mode="array">
			{(parentField) => (
				<>
					{parentField.state.value?.map((img, index) => {
						const file = files[isUpdate ? index : (img.fileIndex as number)];
						if (!file) return null;
						const previewUrl =
							imagePreviews[file.id] || (file.preview as string);

						return (
							<form.AppField key={file.id} name={`${imField}[${index}]`}>
								{(field) => (
									<CarouselItem className="flex justify-center relative h-full basis-full">
										<Image
											alt={field.state.value?.altText ?? "image"}
											className="aspect-square w-full rounded-md object-cover"
											height="100"
											width="100"
											src={previewUrl}
										/>
										<div className="absolute top-2 right-2 flex gap-2 z-50">
											<label
												className="cursor-pointer"
												htmlFor={`replace-${file.id}`}
											>
												<input
													id={`replace-${file.id}`}
													type="file"
													accept="image/*"
													className="sr-only"
													onChange={(e) => {
														const newFile = e.target.files?.[0];
														if (!newFile) return;

														const currentValue = field.state.value;
														const newPreview = URL.createObjectURL(newFile);
														setImagePreviews((prev) => ({
															...prev,
															[file.id]: newPreview,
														}));

														if (isUpdate) {
															if (currentValue?.fileIndex) {
																// replace existing file
																form.setFieldValue(
																	`images[${currentValue?.fileIndex}]`,
																	newFile,
																);
																field.handleChange({
																	...currentValue,
																	altText: newFile.name,
																});
															} else {
																// @ts-expect-error - images array exists in both postBody and patchBody
																form.pushFieldValue("images", newFile);
																const currentImages =
																	form.getFieldValue("images");
																field.handleChange({
																	...currentValue,
																	fileIndex: (currentImages?.length ?? 1) - 1,
																	altText: newFile.name,
																});
															}
														} else {
															// when user replace a new image
															form.setFieldValue(
																`images[${currentValue?.fileIndex as number}]`,
																newFile,
															);
															field.handleChange({
																...currentValue,
																altText: newFile.name,
															} as typeof currentValue);
														}
													}}
												/>
												<span className="inline-flex items-center justify-center size-8 rounded-full bg-background/80 hover:bg-background backdrop-blur-sm transition-colors group">
													<RefreshCw className="size-4 text-blue-600 transition-transform group-hover:scale-125" />
													<span className="sr-only">Replace image</span>
												</span>
											</label>
											<StarButton
												isThumbnail={file.isThumbnail ?? false}
												onClick={() => handleThumbnailChange(img.id, isUpdate)}
											/>
											<DeleteButton
												onClick={() => handleDeleteImage(img.id, isUpdate)}
											/>
										</div>
										<div className="absolute bottom-2 bg-background/80 backdrop-blur-sm rounded px-2 py-1">
											<p className="truncate text-xs font-medium">
												{field.state.value?.altText ?? file.file.name}
											</p>
											{!isUpdate && (
												<p className="text-xs text-muted-foreground">
													{formatBytes(file.file.size)}
												</p>
											)}
										</div>
									</CarouselItem>
								)}
							</form.AppField>
						);
					})}
					<parentField.Message />
				</>
			)}
		</form.AppField>
	);
}

function DropZone(props?: InputHTMLAttributes<HTMLInputElement>) {
	return (
		<div className="relative flex cursor-pointer items-center justify-center rounded-md border-2 border-input border-dashed p-16">
			<input
				{...props}
				className="absolute inset-0 z-50 h-full w-full cursor-pointer opacity-0"
				type="file"
			/>
			<div className="flex flex-col items-center justify-center text-center">
				<div
					aria-hidden="true"
					className="mb-2 flex h-11 w-11 shrink-0 items-center justify-center rounded-full border bg-background"
				>
					<ImageIcon className="h-4 w-4 opacity-60" />
				</div>
				<p className="mb-1.5 font-medium text-sm">Drop your images here</p>
				<p className="text-muted-foreground text-xs">or click to browse</p>
			</div>
		</div>
	);
}

function StarButton({
	isThumbnail,
	...props
}: React.ComponentProps<"button"> & { isThumbnail: boolean }) {
	return (
		<Button
			type="button"
			size="icon"
			className={`size-8 rounded-full backdrop-blur-sm transition-all group ${
				isThumbnail
					? "bg-yellow-500/90 hover:bg-yellow-500"
					: "bg-background/80 hover:bg-background"
			}`}
			{...props}
		>
			<Star
				className={`size-4 transition-transform group-hover:scale-125 ${
					isThumbnail ? "fill-white text-white" : "text-yellow-600"
				}`}
			/>
			<span className="sr-only">
				{isThumbnail ? "Current thumbnail" : "Set as thumbnail"}
			</span>
		</Button>
	);
}

function DeleteButton({ ...props }: React.ComponentProps<"button">) {
	return (
		<Button
			type="button"
			size="icon"
			className="size-8 rounded-full bg-background/80 hover:bg-background backdrop-blur-sm transition-colors group"
			{...props}
		>
			<Trash2Icon className="size-4 text-red-600 transition-transform group-hover:scale-125" />
			<span className="sr-only">Delete image</span>
		</Button>
	);
}
