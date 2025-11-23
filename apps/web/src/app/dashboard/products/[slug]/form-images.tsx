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
	form: ReturnType<typeof useForm<typeof ProductModel.postBody>>;
}

export const ProductFormImages = ({ isNew, form }: ProductFormImagesProps) => {
	const setSidebarProduct = useSetAtom(
		isNew ? newProductAtom : currentProductAtom,
	);

	const [api, setApi] = useState<CarouselApi>();
	const [current, setCurrent] = useState(0);

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

			// Update form state
			form.setFieldValue("images", fileObjects);
		},
	});

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
					{files.length > 0 ? (
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
									{current} / {files.length}
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
													onClick={() => setThumbnail(fileItem.id)}
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
													onClick={() => removeFile(fileItem.id)}
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
