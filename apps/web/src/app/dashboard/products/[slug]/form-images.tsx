"use client";

import type { ProductModel } from "@spice-world/server/modules/products/model";
import { ErrorItem } from "@spice-world/web/components/elysia-error";
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
import type { useForm } from "@spice-world/web/components/ui/tanstack-form";
import {
	formatBytes,
	useFileUpload,
} from "@spice-world/web/hooks/use-file-upload";
import { useSetAtom } from "jotai";
import { ImageIcon, Star, Trash2Icon, Upload, XIcon } from "lucide-react";
import Image from "next/image";
import { useEffect, useState } from "react";
import {
	currentProductAtom,
	newProductAtom,
	type ProductItemProps,
} from "../store";

const MAX_IMAGES = 5;
const MAX_FILE_SIZE = 1024 * 1024 * 3;

interface ProductFormImagesProps {
	isNew: boolean;
	form: ReturnType<
		typeof useForm<typeof ProductModel.postBody | typeof ProductModel.patchBody>
	>;
	existingImages?: Array<{
		id: string;
		url: string;
		altText: string | null;
		isThumbnail: boolean;
	}>;
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
	const [imagesToDelete, setImagesToDelete] = useState<string[]>([]);
	const [imagesToUpdate, setImagesToUpdate] = useState<
		Array<{
			id: string;
			isThumbnail?: boolean;
			altText?: string;
		}>
	>([]);

	const [
		{ files, isDragging, errors },
		{
			handleDragEnter,
			handleDragLeave,
			handleDragOver,
			handleDrop,
			openFileDialog,
			removeFile,
			clearFiles,
			getInputProps,
			setThumbnail,
		},
	] = useFileUpload({
		multiple: true,
		maxFiles: MAX_IMAGES,
		maxSize: MAX_FILE_SIZE,
		accept: "image/*",
		onFilesChange: (updatedFiles) => {
			// Extract File objects from FileWithPreview
			const fileObjects = updatedFiles
				.map((f) => f.file)
				.filter((f): f is File => f instanceof File);

			// Update form state with files array
			form.setFieldValue("images", fileObjects);

			// Build imagesOps.create array with fileIndex references
			if (updatedFiles.length > 0) {
				const imagesOpsCreate = updatedFiles.map((f, index) => ({
					fileIndex: index,
					altText: f.file.name,
					isThumbnail: f.isThumbnail ?? false,
				}));

				form.setFieldValue("imagesOps.create", imagesOpsCreate);
			} else {
				// Clear imagesOps.create if no files
				form.setFieldValue("imagesOps.create", undefined);
			}
		},
	});

	// Sync image operations (update/delete) with form state
	useEffect(() => {
		if (imagesToUpdate.length > 0) {
			form.setFieldValue("imagesOps.update", imagesToUpdate);
		}
		if (imagesToDelete.length > 0) {
			form.setFieldValue("imagesOps.delete", imagesToDelete);
		}
	}, [imagesToUpdate, imagesToDelete, form]);

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
		const fileObjects = files
			.map((f) => f.file)
			.filter((f): f is File => f instanceof File);

		setSidebarProduct((prev) => {
			return {
				...(prev as ProductItemProps),
				img: fileObjects[0] ? URL.createObjectURL(fileObjects[0]) : null,
			};
		});
	}, [files, setSidebarProduct]);

	// Helper to check if an existing image is currently the thumbnail
	const isExistingImageThumbnail = (imageId: string): boolean => {
		const updateEntry = imagesToUpdate.find((img) => img.id === imageId);
		if (updateEntry) {
			// If there's an update entry, use that value
			return updateEntry.isThumbnail ?? false;
		}
		// Otherwise, use the original value
		const originalImage = existingImages.find((img) => img.id === imageId);
		return originalImage?.isThumbnail ?? false;
	};

	const handleThumbnailChange = (imageId: string, isExisting: boolean) => {
		if (isExisting) {
			// Update existing images: set selected as thumbnail, remove thumbnail from others
			setImagesToUpdate((prev) => {
				const updates = new Map(prev.map((img) => [img.id, img]));

				// For all existing images, set isThumbnail accordingly
				for (const existingImg of existingImages) {
					if (existingImg.id === imageId) {
						// This one becomes the thumbnail
						updates.set(imageId, {
							id: imageId,
							isThumbnail: true,
							altText: updates.get(imageId)?.altText,
						});
					} else if (
						existingImg.isThumbnail ||
						updates.get(existingImg.id)?.isThumbnail
					) {
						// Remove thumbnail from other images that were or are thumbnails
						updates.set(existingImg.id, {
							id: existingImg.id,
							isThumbnail: false,
							altText: updates.get(existingImg.id)?.altText,
						});
					}
				}

				return Array.from(updates.values());
			});
		} else {
			// It's a new file, use the existing setThumbnail from useFileUpload
			setThumbnail(imageId);
		}
	};

	const handleDeleteImage = (imageId: string, isExisting: boolean) => {
		if (isExisting) {
			// Add to delete list
			setImagesToDelete((prev) => [...prev, imageId]);
		} else {
			// It's a new file, remove from files
			removeFile(imageId);
		}
	};

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
				<div className="flex flex-col gap-4">
					<input
						{...getInputProps()}
						className="sr-only"
						aria-label="Upload image files"
					/>
					{files.length > 0 ||
					existingImages.filter((img) => !imagesToDelete.includes(img.id))
						.length > 0 ? (
						<>
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
											(img) => !imagesToDelete.includes(img.id),
										).length}
								</span>
								<CarouselContent>
									{files.map((fileItem) => (
										<CarouselItem
											key={fileItem.id}
											className="flex justify-center relative h-full basis-full"
										>
											<Image
												alt={fileItem.file.name}
												className="aspect-square w-full rounded-md object-cover"
												height="100"
												width="100"
												src={
													fileItem.preview ||
													(fileItem.file instanceof File
														? URL.createObjectURL(fileItem.file)
														: "")
												}
											/>
											<div className="absolute top-2 right-2 flex gap-2">
												<Button
													type="button"
													size="icon"
													className={`size-8 rounded-full backdrop-blur-sm transition-all group ${
														fileItem.isThumbnail
															? "bg-yellow-500/90 hover:bg-yellow-500"
															: "bg-background/80 hover:bg-background"
													}`}
													onClick={() =>
														handleThumbnailChange(fileItem.id, false)
													}
													title={
														fileItem.isThumbnail
															? "Current thumbnail"
															: "Set as thumbnail"
													}
												>
													<Star
														className={`size-4 transition-transform group-hover:scale-125 ${
															fileItem.isThumbnail
																? "fill-white text-white"
																: "text-yellow-600"
														}`}
													/>
													<span className="sr-only">
														{fileItem.isThumbnail
															? "Current thumbnail"
															: "Set as thumbnail"}
													</span>
												</Button>
												<Button
													type="button"
													size="icon"
													className="size-8 rounded-full bg-background/80 hover:bg-background backdrop-blur-sm transition-colors group"
													onClick={() => handleDeleteImage(fileItem.id, false)}
												>
													<Trash2Icon className="size-4 text-red-600 transition-transform group-hover:scale-125" />
													<span className="sr-only">Delete image</span>
												</Button>
											</div>
											<div className="absolute bottom-2 bg-background/80 backdrop-blur-sm rounded px-2 py-1">
												<p className="truncate text-xs font-medium">
													{fileItem.file.name}
												</p>
												<p className="text-xs text-muted-foreground">
													{formatBytes(fileItem.file.size)}
												</p>
											</div>
										</CarouselItem>
									))}
									{existingImages
										.filter((img) => !imagesToDelete.includes(img.id))
										.map((fileItem) => (
											<CarouselItem
												key={fileItem.id}
												className="flex justify-center relative h-full basis-full"
											>
												<Image
													alt={fileItem.altText ?? "Product image"}
													className="aspect-square w-full rounded-md object-cover"
													height="100"
													width="100"
													src={fileItem.url}
												/>
												<div className="absolute top-2 right-2 flex gap-2">
													<Button
														type="button"
														size="icon"
														className={`size-8 rounded-full backdrop-blur-sm transition-all group ${
															isExistingImageThumbnail(fileItem.id)
																? "bg-yellow-500/90 hover:bg-yellow-500"
																: "bg-background/80 hover:bg-background"
														}`}
														onClick={() =>
															handleThumbnailChange(fileItem.id, true)
														}
														title={
															isExistingImageThumbnail(fileItem.id)
																? "Current thumbnail"
																: "Set as thumbnail"
														}
													>
														<Star
															className={`size-4 transition-transform group-hover:scale-125 ${
																isExistingImageThumbnail(fileItem.id)
																	? "fill-white text-white"
																	: "text-yellow-600"
															}`}
														/>
														<span className="sr-only">
															{isExistingImageThumbnail(fileItem.id)
																? "Current thumbnail"
																: "Set as thumbnail"}
														</span>
													</Button>
													<Button
														type="button"
														size="icon"
														className="size-8 rounded-full bg-background/80 hover:bg-background backdrop-blur-sm transition-colors group"
														onClick={() => handleDeleteImage(fileItem.id, true)}
													>
														<Trash2Icon className="size-4 text-red-600 transition-transform group-hover:scale-125" />
														<span className="sr-only">Delete image</span>
													</Button>
												</div>
												<div className="absolute bottom-2 bg-background/80 backdrop-blur-sm rounded px-2 py-1">
													<p className="truncate text-xs font-medium">
														{fileItem.altText || "Image"}
													</p>
												</div>
											</CarouselItem>
										))}
								</CarouselContent>
								<CarouselPrevious
									type="button"
									className="-left-6 size-6 bg-background/80! hover:bg-background/1! backdrop-blur-sm rounded-none"
								/>
								<CarouselNext
									type="button"
									className="-right-6 size-6 bg-background/80! hover:bg-background/1! backdrop-blur-sm rounded-none"
								/>
							</Carousel>
							<div className="grid grid-cols-2 items-center justify-between gap-2">
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
								<Button
									type="button"
									variant="outline"
									size="sm"
									onClick={clearFiles}
								>
									<XIcon className="-ms-0.5 h-3.5 w-3.5 opacity-60" />
									Remove all
								</Button>
							</div>
						</>
					) : (
						<section
							aria-label="Drag and drop image upload area"
							onDragEnter={handleDragEnter}
							onDragLeave={handleDragLeave}
							onDragOver={handleDragOver}
							onDrop={handleDrop}
							data-dragging={isDragging || undefined}
							onClick={openFileDialog}
							onKeyUp={openFileDialog}
							aria-disabled={files.length >= MAX_IMAGES}
							className="relative h-56 flex flex-col items-center justify-center rounded-md border-2 border-dashed cursor-pointer
								border-input p-6 transition-colors data-[dragging=true]:border-ring data-[dragging=true]:bg-accent/50"
						>
							<div className="flex flex-col items-center justify-center text-center">
								<div
									className="mb-2 flex h-11 w-11 shrink-0 items-center justify-center rounded-full border bg-background"
									aria-hidden="true"
								>
									<ImageIcon className="h-4 w-4 opacity-60" />
								</div>
								<p className="mb-1.5 text-sm font-medium">
									Drop your images here
								</p>
								<p className="text-xs text-muted-foreground">
									or click to browse
								</p>
							</div>
						</section>
					)}
					{errors.length > 0 && <ErrorItem>{errors[0]}</ErrorItem>}
				</div>
			</CardContent>
		</Card>
	);
};
