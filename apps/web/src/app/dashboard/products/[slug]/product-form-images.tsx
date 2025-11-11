"use client";

import { useAtom } from "jotai";
import { ImageIcon, Trash, Upload, XIcon } from "lucide-react";
import Image from "next/image";
import { Button } from "@/components/ui/button";
import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from "@/components/ui/card";
import {
	Carousel,
	CarouselContent,
	CarouselItem,
	CarouselNext,
	CarouselPrevious,
} from "@/components/ui/carousel";
import { formatBytes, useFileUpload } from "@/hooks/use-file-upload";
import { currentProductAtom, newProductAtom } from "../store";

const MAX_IMAGES = 5;
const MAX_FILE_SIZE = 1024 * 1024;

export const ProductFormImages = ({ isNew }: { isNew: boolean }) => {
	const [product, setProduct] = useAtom(
		isNew ? newProductAtom : currentProductAtom,
	);

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
		},
	] = useFileUpload({
		multiple: true,
		maxFiles: MAX_IMAGES,
		maxSize: MAX_FILE_SIZE,
		accept: "image/*",
		onFilesChange: (updatedFiles) => {
			if (!product) return;
			const fileObjects = updatedFiles
				.map((f) => f.file)
				.filter((f): f is File => f instanceof File);
			setProduct({ ...product, images: fileObjects });
		},
	});

	return (
		<Card className="overflow-hidden rounded-md">
			<CardHeader>
				<CardTitle>Product Images</CardTitle>
				<CardDescription>
					Upload images for your product. You can upload up to {MAX_IMAGES}{" "}
					images (max {formatBytes(MAX_FILE_SIZE)} each).
				</CardDescription>
			</CardHeader>
			<CardContent>
				<div className="flex flex-col gap-4">
					{errors.length > 0 && (
						<div className="text-sm text-destructive" role="alert">
							{errors[0]}
						</div>
					)}
					{files.length > 0 && (
						<>
							<Carousel
								opts={{
									align: "start",
									loop: true,
								}}
								className="w-full max-w-sm"
							>
								<CarouselContent>
									{files.map((fileItem) => (
										<CarouselItem
											key={fileItem.id}
											className="flex justify-center relative"
										>
											<Image
												alt={fileItem.file.name}
												className="aspect-square w-full rounded-md object-cover"
												height="200"
												src={
													fileItem.preview ||
													(fileItem.file instanceof File
														? URL.createObjectURL(fileItem.file)
														: "")
												}
												width="200"
											/>
											<Button
												type="button"
												variant="destructive"
												size="icon"
												className="absolute top-2 right-2 h-8 w-8 rounded-full border-2 border-background"
												onClick={() => removeFile(fileItem.id)}
											>
												<Trash className="h-4 w-4" />
												<span className="sr-only">Delete image</span>
											</Button>
											<div className="absolute bottom-2 left-2 right-2 bg-background/80 backdrop-blur-sm rounded px-2 py-1">
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
								<CarouselPrevious type="button" className="-left-4" />
								<CarouselNext type="button" className="-right-4" />
							</Carousel>

							<div className="flex items-center justify-between gap-2">
								<p className="text-sm font-medium">
									{files.length} / {MAX_IMAGES} images
								</p>
								<div className="flex gap-2">
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
							</div>
						</>
					)}

					{files.length === 0 && (
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
							className="relative flex min-h-32 flex-col items-center justify-center rounded-lg border-2 border-dashed cursor-pointer
							border-input p-6 transition-colors data-[dragging=true]:border-ring data-[dragging=true]:bg-accent/50"
						>
							<input
								{...getInputProps()}
								className="sr-only"
								aria-label="Upload image files"
							/>
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
				</div>
			</CardContent>
		</Card>
	);
};
