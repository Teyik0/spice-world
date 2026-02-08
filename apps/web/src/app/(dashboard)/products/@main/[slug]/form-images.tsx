"use client";

import type { ProductModel } from "@spice-world/server/modules/products/model";
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
import { formatBytes } from "@spice-world/web/hooks/use-file-upload";
import { useStore } from "@tanstack/react-form";
import { ImageIcon, RefreshCw, Star, Trash2, Upload } from "lucide-react";
import Image from "next/image";
import {
	type ChangeEvent,
	useCallback,
	useEffect,
	useMemo,
	useRef,
	useState,
} from "react";
import { toast } from "sonner";
import { type ProductForm, useProductSidebarSync } from "../../store";

const MAX_IMAGES = 5;
const MAX_FILE_SIZE = 1024 * 1024 * 3;

interface ImageMetadata {
	id: string;
	urlThumb: string;
	urlMedium: string;
	urlLarge: string;
	isThumbnail: boolean;
	altText: string | null;
}

interface ProductFormImagesProps {
	isNew: boolean;
	slug: string;
	form: ProductForm;
	existingImages?: ImageMetadata[];
}

interface DisplayImage {
	id: string;
	url: string;
	urlThumb: string;
	isThumbnail: boolean;
	altText: string;
	file?: File;
	originalId?: string;
}

export const ProductFormImages = ({
	isNew,
	slug,
	form,
	existingImages = [],
}: ProductFormImagesProps) => {
	const [api, setApi] = useState<CarouselApi>();
	const [current, setCurrent] = useState(0);
	const fileInputRef = useRef<HTMLInputElement>(null);
	const updateSidebar = useProductSidebarSync(isNew, slug);
	// Track all created blob URLs for proper cleanup
	const createdBlobUrls = useRef<Set<string>>(new Set());

	useEffect(() => {
		if (!api) return;
		setCurrent(api.selectedScrollSnap() + 1);
		api.on("select", () => setCurrent(api.selectedScrollSnap() + 1));
	}, [api]);

	const existingMap = useMemo(
		() => new Map(existingImages.map((img) => [img.id, img])),
		[existingImages],
	);

	const { displayImages, imageOps } = useStore(form.store, (state) => {
		const ops = state.values.images as ProductModel.imageOperations | undefined;
		const createOps = ops?.create ?? [];
		const updateOps = ops?.update ?? [];
		const deleteIds = new Set(ops?.delete ?? []);

		const images: DisplayImage[] = [];

		// Process existing images
		for (const [id, img] of existingMap) {
			if (deleteIds.has(id)) continue;

			const updateOp = updateOps.find((op) => op.id === id);
			const updatedFile = updateOp?.file;

			let url = img.urlMedium;
			if (updatedFile) {
				url = URL.createObjectURL(updatedFile);
				createdBlobUrls.current.add(url);
			}

			images.push({
				id,
				url,
				urlThumb: img.urlThumb,
				isThumbnail: updateOp?.isThumbnail ?? img.isThumbnail,
				altText: updateOp?.altText ?? img.altText ?? "image",
				file: updatedFile,
				originalId: id,
			});
		}

		// Process new images
		for (const op of createOps) {
			const url = URL.createObjectURL(op.file);
			const urlThumb = URL.createObjectURL(op.file);
			createdBlobUrls.current.add(url);
			createdBlobUrls.current.add(urlThumb);

			images.push({
				id: `new-${Math.random().toString(36).slice(2)}`,
				url,
				urlThumb,
				isThumbnail: op.isThumbnail ?? false,
				altText: op.altText ?? op.file.name,
				file: op.file,
			});
		}

		return { displayImages: images, imageOps: ops };
	});

	// Cleanup all blob URLs on component unmount
	useEffect(() => {
		return () => {
			createdBlobUrls.current.forEach((url) => {
				URL.revokeObjectURL(url);
			});
			createdBlobUrls.current.clear();
		};
	}, []);

	// Sync thumbnail to sidebar
	useEffect(() => {
		const thumb = displayImages.find((img) => img.isThumbnail);
		updateSidebar("img", thumb?.urlThumb ?? null);
	}, [displayImages, updateSidebar]);

	const handleAddImages = useCallback(
		(files: File[]) => {
			// Validation inline to avoid dependency issues
			if (displayImages.length + files.length > MAX_IMAGES) {
				toast.error(`You can only upload a maximum of ${MAX_IMAGES} images`);
				return;
			}

			const invalid = files.filter((f) => f.size > MAX_FILE_SIZE);
			if (invalid.length > 0) {
				toast.error(
					`Some files exceed the maximum size of ${formatBytes(MAX_FILE_SIZE)}`,
				);
				return;
			}

			const needsThumbnail = displayImages.length === 0;
			const currentCreate = imageOps?.create ?? [];

			form.setFieldValue("images.create", [
				...currentCreate,
				...files.map((file, i) => ({
					file,
					altText: file.name,
					isThumbnail: needsThumbnail && i === 0,
				})),
			]);

			setTimeout(() => {
				api?.scrollTo(displayImages.length + files.length - 1);
			}, 50);
		},
		[displayImages.length, imageOps, api, form],
	);

	const handleReplaceImage = useCallback(
		(imageId: string, newFile: File) => {
			const existing = existingMap.get(imageId);
			const imageToReplace = displayImages.find((d) => d.id === imageId);

			// Revoke old blob URLs before replacing
			if (imageToReplace?.url.startsWith("blob:")) {
				URL.revokeObjectURL(imageToReplace.url);
				createdBlobUrls.current.delete(imageToReplace.url);
			}
			if (imageToReplace?.urlThumb.startsWith("blob:")) {
				URL.revokeObjectURL(imageToReplace.urlThumb);
				createdBlobUrls.current.delete(imageToReplace.urlThumb);
			}

			if (existing) {
				// Replace existing image
				const currentUpdate = imageOps?.update ?? [];
				const existingIndex = currentUpdate.findIndex((u) => u.id === imageId);

				if (existingIndex >= 0) {
					// Update existing entry
					const newUpdate = [...currentUpdate];
					const entry = newUpdate[existingIndex];
					if (entry) {
						newUpdate[existingIndex] = {
							...entry,
							file: newFile,
							altText: newFile.name,
						};
						form.setFieldValue("images.update", newUpdate);
					}
				} else {
					// Add new update entry
					form.setFieldValue("images.update", [
						...currentUpdate,
						{
							id: imageId,
							file: newFile,
							altText: newFile.name,
							isThumbnail: existing.isThumbnail,
						},
					]);
				}
			} else {
				// Replace new image (in create array)
				const currentCreate = imageOps?.create ?? [];
				const createIndex = currentCreate.findIndex(
					(c) => c.file === imageToReplace?.file,
				);

				if (createIndex >= 0) {
					const newCreate = [...currentCreate];
					newCreate[createIndex] = {
						...newCreate[createIndex],
						file: newFile,
						altText: newFile.name,
					};
					form.setFieldValue("images.create", newCreate);
				}
			}
		},
		[existingMap, imageOps, displayImages, form],
	);

	const handleSetThumbnail = useCallback(
		(imageId: string) => {
			const currentCreate = imageOps?.create ?? [];
			const currentUpdate = imageOps?.update ?? [];

			// Clear all thumbnails in create
			const newCreate = currentCreate.map((c) => ({
				...c,
				isThumbnail: false,
			}));

			// Clear all thumbnails in update
			const newUpdate = currentUpdate.map((u) => ({
				...u,
				isThumbnail: false,
			}));

			// Set new thumbnail
			const existing = existingMap.get(imageId);

			if (existing) {
				const updateIndex = newUpdate.findIndex((u) => u.id === imageId);
				if (updateIndex >= 0) {
					const entry = newUpdate[updateIndex];
					if (entry) {
						newUpdate[updateIndex] = {
							...entry,
							isThumbnail: true,
							id: imageId,
						};
					}
				} else {
					newUpdate.push({
						id: imageId,
						isThumbnail: true,
						altText: existing.altText ?? undefined,
					});
				}
			} else {
				// It's a new image
				const image = displayImages.find((d) => d.id === imageId);
				const createIndex = newCreate.findIndex((c) => c.file === image?.file);
				if (createIndex >= 0) {
					const entry = newCreate[createIndex];
					if (entry?.file) {
						newCreate[createIndex] = {
							...entry,
							isThumbnail: true,
							file: entry.file,
						};
					}
				}
			}

			form.setFieldValue("images.create", newCreate);
			form.setFieldValue("images.update", newUpdate);

			api?.scrollTo(0);
		},
		[displayImages, existingMap, imageOps, form, api],
	);

	const handleDeleteImage = useCallback(
		(imageId: string) => {
			if (displayImages.length <= 1) return;

			const existing = existingMap.get(imageId);
			const imageToDelete = displayImages.find((d) => d.id === imageId);
			const wasThumbnail = imageToDelete?.isThumbnail;

			// Revoke blob URLs for the deleted image immediately
			if (imageToDelete?.url.startsWith("blob:")) {
				URL.revokeObjectURL(imageToDelete.url);
				createdBlobUrls.current.delete(imageToDelete.url);
			}
			if (imageToDelete?.urlThumb.startsWith("blob:")) {
				URL.revokeObjectURL(imageToDelete.urlThumb);
				createdBlobUrls.current.delete(imageToDelete.urlThumb);
			}

			if (existing) {
				// Delete existing image
				const currentDelete = imageOps?.delete ?? [];
				const currentUpdate = imageOps?.update ?? [];

				// Remove from update if present
				form.setFieldValue(
					"images.update",
					currentUpdate.filter((u) => u.id !== imageId),
				);
				// Add to delete
				form.setFieldValue("images.delete", [...currentDelete, imageId]);
			} else {
				// Delete new image (in create array)
				const currentCreate = imageOps?.create ?? [];
				const createIndex = currentCreate.findIndex(
					(c) => c.file === imageToDelete?.file,
				);

				if (createIndex >= 0) {
					const newCreate = [...currentCreate];
					newCreate.splice(createIndex, 1);
					form.setFieldValue("images.create", newCreate);
				}
			}

			// Auto-assign new thumbnail if needed
			if (wasThumbnail) {
				const remaining = displayImages.filter((d) => d.id !== imageId);
				const firstRemaining = remaining[0];
				if (firstRemaining) {
					handleSetThumbnail(firstRemaining.id);
				}
			}

			setCurrent(1);
		},
		[displayImages, existingMap, imageOps, form, handleSetThumbnail],
	);

	const handleFileInputChange = (e: ChangeEvent<HTMLInputElement>) => {
		const files = Array.from(e.target.files || []);
		handleAddImages(files);
		if (fileInputRef.current) fileInputRef.current.value = "";
	};

	const sortedImages = useMemo(
		() =>
			[...displayImages].sort(
				(a, b) => (b.isThumbnail ? 1 : 0) - (a.isThumbnail ? 1 : 0),
			),
		[displayImages],
	);

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
				{displayImages.length ? (
					<Carousel
						opts={{
							align: "start",
							loop: true,
							duration: 20,
						}}
						setApi={setApi}
						className="w-full"
					>
						<span className="absolute top-3 left-3 z-50 text-xs font-bold bg-background/80 backdrop-blur-sm rounded px-2 py-1">
							{current} / {displayImages.length}
						</span>
						<CarouselContent>
							{sortedImages.map((item) => (
								<CarouselItem
									key={item.id}
									className="flex justify-center relative h-full basis-full"
								>
									<Image
										alt={item.altText}
										className="aspect-square w-full rounded-md object-cover"
										height={200}
										width={200}
										src={item.url}
										quality={75}
										priority={item.isThumbnail}
										unoptimized={item.url.startsWith("blob:")}
									/>
									<div className="absolute top-2 right-2 flex gap-2 z-50">
										<label
											className="cursor-pointer"
											htmlFor={`replace-${item.id}`}
										>
											<input
												id={`replace-${item.id}`}
												type="file"
												accept="image/*"
												className="sr-only"
												onChange={(e) => {
													const file = e.target.files?.[0];
													if (file) handleReplaceImage(item.id, file);
												}}
											/>
											<span className="inline-flex items-center justify-center size-8 rounded-full bg-background/80 hover:bg-background backdrop-blur-sm transition-colors group">
												<RefreshCw className="size-4 text-blue-600 transition-transform group-hover:scale-125" />
												<span className="sr-only">Replace image</span>
											</span>
										</label>
										<Button
											type="button"
											size="icon"
											className={`size-8 rounded-full backdrop-blur-sm transition-all group ${
												item.isThumbnail
													? "bg-yellow-500/90 hover:bg-yellow-500"
													: "bg-background/80 hover:bg-background"
											}`}
											onClick={() => handleSetThumbnail(item.id)}
										>
											<Star
												className={`size-4 transition-transform group-hover:scale-125 ${
													item.isThumbnail
														? "fill-white text-white"
														: "text-yellow-600"
												}`}
											/>
											<span className="sr-only">
												{item.isThumbnail
													? "Current thumbnail"
													: "Set as thumbnail"}
											</span>
										</Button>
										{displayImages.length > 1 && (
											<Button
												type="button"
												size="icon"
												className="size-8 rounded-full bg-background/80 hover:bg-background backdrop-blur-sm transition-colors group"
												onClick={() => handleDeleteImage(item.id)}
											>
												<Trash2 className="size-4 text-red-600 transition-transform group-hover:scale-125" />
												<span className="sr-only">Delete image</span>
											</Button>
										)}
									</div>
									<div className="absolute bottom-2 bg-background/80 backdrop-blur-sm rounded px-2 py-1">
										<p className="truncate text-xs font-medium">
											{item.altText}
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
						<div className="mt-4">
							<input
								ref={fileInputRef}
								type="file"
								accept="image/*"
								multiple
								onChange={handleFileInputChange}
								className="hidden"
							/>
							{displayImages.length < MAX_IMAGES && (
								<Button
									type="button"
									variant="outline"
									size="sm"
									onClick={() => fileInputRef.current?.click()}
								>
									<Upload className="-ms-0.5 h-3.5 w-3.5 opacity-60" />
									Add more
								</Button>
							)}
						</div>
					</Carousel>
				) : (
					<label className="relative flex cursor-pointer items-center justify-center rounded-md border-2 border-input border-dashed p-16 hover:bg-accent/50 transition-colors">
						<input
							type="file"
							accept="image/*"
							multiple
							onChange={handleFileInputChange}
							className="absolute inset-0 z-50 h-full w-full cursor-pointer opacity-0"
						/>
						<div className="flex flex-col items-center justify-center text-center">
							<div
								aria-hidden="true"
								className="mb-2 flex h-11 w-11 shrink-0 items-center justify-center rounded-full border bg-background"
							>
								<ImageIcon className="h-4 w-4 opacity-60" />
							</div>
							<p className="mb-1.5 font-medium text-sm">
								Drop your images here
							</p>
							<p className="text-muted-foreground text-xs">
								or click to browse
							</p>
						</div>
					</label>
				)}
				<form.AppField name="images">
					{(field) => <field.Message />}
				</form.AppField>
			</CardContent>
		</Card>
	);
};
