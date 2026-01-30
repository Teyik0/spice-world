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
import { formatBytes } from "@spice-world/web/hooks/use-file-upload";
import { useStore } from "@tanstack/react-form";
import { useSetAtom } from "jotai";
import { ImageIcon, RefreshCw, Star, Trash2Icon, Upload } from "lucide-react";
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
import {
	newProductAtom,
	type ProductItemProps,
	productPagesAtom,
} from "../../store";

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

interface DisplayImage {
	id: string;
	url: string;
	isThumbnail: boolean;
	altText: string;
	source: "existing" | "create" | "update";
	createIndex?: number;
	updateIndex?: number;
}

interface ProductFormImagesProps {
	isNew: boolean;
	slug: string;
	form: ReturnType<
		typeof useForm<typeof ProductModel.postBody | typeof ProductModel.patchBody>
	>;
	existingImages?: ImageMetadata[];
}

export const ProductFormImages = ({
	isNew,
	slug,
	form,
	existingImages = [],
}: ProductFormImagesProps) => {
	const [api, setApi] = useState<CarouselApi>();
	const [current, setCurrent] = useState(0);
	useEffect(() => {
		if (!api) return;
		setCurrent(api.selectedScrollSnap() + 1);
		api.on("select", () => {
			setCurrent(api.selectedScrollSnap() + 1);
		});
	}, [api]);

	const fileInputRef = useRef<HTMLInputElement>(null);
	const setNewProduct = useSetAtom(newProductAtom);
	const setPages = useSetAtom(productPagesAtom);
	const blobUrlCache = useRef(new Map<File, string>());

	useEffect(() => {
		const cache = blobUrlCache.current;
		return () => {
			for (const url of cache.values()) {
				URL.revokeObjectURL(url);
			}
			cache.clear();
		};
	}, []);

	const getBlobUrl = useCallback((file: File): string => {
		const cached = blobUrlCache.current.get(file);
		if (cached) return cached;
		const url = URL.createObjectURL(file);
		blobUrlCache.current.set(file, url);
		return url;
	}, []);

	const revokeBlobUrl = useCallback((file: File) => {
		const url = blobUrlCache.current.get(file);
		if (url) {
			URL.revokeObjectURL(url);
			blobUrlCache.current.delete(file);
		}
	}, []);

	const updateSidebarImg = useCallback(
		(imgUrl: string | null) => {
			if (isNew) {
				setNewProduct((prev) => ({
					...(prev as ProductItemProps),
					img: imgUrl,
				}));
			} else {
				setPages((pages) =>
					pages.map((page) =>
						page.map((p) => (p.slug === slug ? { ...p, img: imgUrl } : p)),
					),
				);
			}
		},
		[isNew, slug, setNewProduct, setPages],
	);

	const existingMap = useMemo(
		() => new Map(existingImages.map((img) => [img.id, img])),
		[existingImages],
	);

	const displayImages: DisplayImage[] = useStore(form.store, (state) => {
		const images = state.values.images as
			| ProductModel.imageOperations
			| undefined;
		const createOps = images?.create ?? [];
		const updateOps = images?.update ?? [];
		const deleteIds = new Set(images?.delete ?? []);

		const result: DisplayImage[] = [];

		for (const [id, img] of existingMap) {
			if (deleteIds.has(id)) continue;
			const updateOp = updateOps.find((op) => op.id === id);
			const updateIndex = updateOp ? updateOps.indexOf(updateOp) : undefined;
			if (updateOp) {
				result.push({
					id,
					url: updateOp.file ? getBlobUrl(updateOp.file) : img.urlMedium,
					isThumbnail: updateOp.isThumbnail ?? img.isThumbnail,
					altText: updateOp.altText ?? img.altText ?? "image",
					source: "update",
					updateIndex,
				});
			} else {
				result.push({
					id,
					url: img.urlMedium,
					isThumbnail: img.isThumbnail,
					altText: img.altText ?? "image",
					source: "existing",
				});
			}
		}

		for (const [i, op] of createOps.entries()) {
			result.push({
				id: `create-${i}`,
				url: getBlobUrl(op.file),
				isThumbnail: op.isThumbnail ?? false,
				altText: op.altText ?? op.file.name,
				source: "create",
				createIndex: i,
			});
		}

		return result;
	});

	// biome-ignore lint/correctness/useExhaustiveDependencies: sidebar sync on display change
	useEffect(() => {
		const thumb = displayImages.find((img) => img.isThumbnail);
		updateSidebarImg(thumb ? thumb.url : null);
	}, [displayImages]);

	const handleNewImg = (e: React.ChangeEvent<HTMLInputElement>) => {
		const selectedFiles = Array.from(e.target.files || []);

		if (displayImages.length + selectedFiles.length > MAX_IMAGES) {
			toast.error(`You can only upload a maximum of ${MAX_IMAGES} images`);
			return;
		}

		const invalidFiles = selectedFiles.filter(
			(file) => file.size > MAX_FILE_SIZE,
		);
		if (invalidFiles.length > 0) {
			toast.error(
				`Some files exceed the maximum size of ${formatBytes(MAX_FILE_SIZE)}`,
			);
			return;
		}

		const needsThumbnail = displayImages.length === 0;
		for (const [i, file] of selectedFiles.entries()) {
			// @ts-expect-error - images.create exists on both postBody and patchBody
			form.pushFieldValue("images.create", {
				file,
				altText: file.name,
				isThumbnail: needsThumbnail && i === 0,
			});
		}

		setTimeout(() => {
			api?.scrollTo(displayImages.length + selectedFiles.length - 1);
		}, 50);

		if (fileInputRef.current) {
			fileInputRef.current.value = "";
		}
	};

	const handleImgChange = (
		e: ChangeEvent<HTMLInputElement>,
		img: DisplayImage,
	) => {
		const newFile = e.target.files?.[0];
		if (!newFile) return;

		if (img.source === "create" && img.createIndex !== undefined) {
			const oldFile = (
				form.getFieldValue(
					"images.create",
				) as ProductModel.imageOperations["create"]
			)?.[img.createIndex]?.file;
			if (oldFile) revokeBlobUrl(oldFile);
			form.setFieldValue(`images.create[${img.createIndex}].file`, newFile);
			form.setFieldValue(
				`images.create[${img.createIndex}].altText`,
				newFile.name,
			);
		} else if (img.source === "update" && img.updateIndex !== undefined) {
			const oldFile = (
				form.getFieldValue(
					"images.update",
				) as ProductModel.imageOperations["update"]
			)?.[img.updateIndex]?.file;
			if (oldFile) revokeBlobUrl(oldFile);
			form.setFieldValue(`images.update[${img.updateIndex}].file`, newFile);
			form.setFieldValue(
				`images.update[${img.updateIndex}].altText`,
				newFile.name,
			);
		} else if (img.source === "existing") {
			const existing = existingMap.get(img.id);
			if (!existing) return;
			// @ts-expect-error - images.update exists on patchBody
			form.pushFieldValue("images.update", {
				id: img.id,
				file: newFile,
				altText: newFile.name,
				isThumbnail: existing.isThumbnail,
			});
		}
	};

	const handleDeleteImg = (img: DisplayImage) => {
		if (img.source === "create" && img.createIndex !== undefined) {
			const oldFile = (
				form.getFieldValue(
					"images.create",
				) as ProductModel.imageOperations["create"]
			)?.[img.createIndex]?.file;
			if (oldFile) revokeBlobUrl(oldFile);
			form.removeFieldValue("images.create", img.createIndex);
		} else if (img.source === "update" && img.updateIndex !== undefined) {
			const oldFile = (
				form.getFieldValue(
					"images.update",
				) as ProductModel.imageOperations["update"]
			)?.[img.updateIndex]?.file;
			if (oldFile) revokeBlobUrl(oldFile);
			// @ts-expect-error - images.update exists
			form.removeFieldValue("images.update", img.updateIndex);
			// @ts-expect-error - images.delete exists
			form.pushFieldValue("images.delete", img.id);
		} else if (img.source === "existing") {
			// @ts-expect-error - images.delete exists
			form.pushFieldValue("images.delete", img.id);
		}

		// Auto-assign thumbnail if the deleted image was the thumbnail
		if (img.isThumbnail) {
			setTimeout(() => {
				autoAssignThumbnail();
			}, 0);
		}
		setCurrent(1);
	};

	const autoAssignThumbnail = () => {
		const images = form.getFieldValue("images") as
			| ProductModel.imageOperations
			| undefined;
		const createOps = images?.create ?? [];
		const updateOps = images?.update ?? [];
		const deleteIds = new Set(images?.delete ?? []);

		// Find first remaining existing (not deleted, not in update)
		for (const [id, img] of existingMap) {
			if (deleteIds.has(id)) continue;
			const inUpdate = updateOps.find((op) => op.id === id);
			if (!inUpdate) {
				// Push as update with isThumbnail
				// @ts-expect-error - images.update exists
				form.pushFieldValue("images.update", {
					id,
					isThumbnail: true,
					altText: img.altText,
				});
				return;
			}
		}

		// Check update ops
		for (const [i, op] of updateOps.entries()) {
			if (deleteIds.has(op.id)) continue;
			form.setFieldValue(`images.update[${i}].isThumbnail`, true);
			return;
		}

		// Check create ops
		if (createOps.length > 0) {
			form.setFieldValue("images.create[0].isThumbnail", true);
		}
	};

	const handleThumbnailChange = (img: DisplayImage) => {
		const images = form.getFieldValue("images") as
			| ProductModel.imageOperations
			| undefined;
		const createOps = images?.create ?? [];
		const updateOps = images?.update ?? [];

		// Clear all thumbnails in create ops
		for (let i = 0; i < createOps.length; i++) {
			if (createOps[i]?.isThumbnail) {
				form.setFieldValue(`images.create[${i}].isThumbnail`, false);
			}
		}

		// Clear all thumbnails in update ops
		for (let i = 0; i < updateOps.length; i++) {
			if (updateOps[i]?.isThumbnail) {
				form.setFieldValue(`images.update[${i}].isThumbnail`, false);
			}
		}

		// Ensure existing images that were thumbnails get an update op to clear them
		for (const [id, existingImg] of existingMap) {
			if (!existingImg.isThumbnail) continue;
			if (id === img.id) continue;
			const alreadyInUpdate = updateOps.some((op) => op.id === id);
			if (!alreadyInUpdate) {
				// @ts-expect-error - images.update exists
				form.pushFieldValue("images.update", {
					id,
					isThumbnail: false,
					altText: existingImg.altText,
				});
			}
		}

		// Set the new thumbnail
		if (img.source === "create" && img.createIndex !== undefined) {
			form.setFieldValue(`images.create[${img.createIndex}].isThumbnail`, true);
		} else if (img.source === "update" && img.updateIndex !== undefined) {
			form.setFieldValue(`images.update[${img.updateIndex}].isThumbnail`, true);
		} else if (img.source === "existing") {
			const alreadyInUpdate = updateOps.find((op) => op.id === img.id);
			if (alreadyInUpdate) {
				const idx = updateOps.indexOf(alreadyInUpdate);
				form.setFieldValue(`images.update[${idx}].isThumbnail`, true);
			} else {
				// @ts-expect-error - images.update exists
				form.pushFieldValue("images.update", {
					id: img.id,
					isThumbnail: true,
					altText: existingMap.get(img.id)?.altText,
				});
			}
		}

		if (api) {
			api.scrollTo(0);
		}
	};

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
						}}
						setApi={setApi}
						className="w-full"
					>
						<span className="absolute top-3 left-3 z-50 text-xs font-bold bg-background/80 backdrop-blur-sm rounded px-2 py-1">
							{current} / {displayImages.length}
						</span>
						<CarouselContent>
							{[...displayImages]
								.sort(
									(a, b) => (b.isThumbnail ? 1 : 0) - (a.isThumbnail ? 1 : 0),
								)
								.map((item) => {
									return (
										<CarouselImageItem
											key={item.id}
											altText={item.altText}
											imgId={item.id}
											imgUrl={item.urlMedium}
											isThumbnail={item.isThumbnail}
											handleDeleteImg={
												displayImages.length > 1
													? () => handleDeleteImg(item)
													: null
											}
											handleThumbnailChange={() => handleThumbnailChange(item)}
											onImgChange={(e) => handleImgChange(e, item)}
										/>
									);
								})}
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
								onChange={handleNewImg}
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
					<DropZone onChange={handleNewImg} />
				)}
				<form.AppField name="images">
					{(field) => <field.Message />}
				</form.AppField>
			</CardContent>
		</Card>
	);
};

interface CarouselImageItemProps {
	altText: string;
	imgId: string;
	imgUrl: string;
	isThumbnail: boolean;
	handleThumbnailChange: () => void;
	handleDeleteImg: (() => void) | null;
	onImgChange: (e: ChangeEvent<HTMLInputElement>) => void;
}
const CarouselImageItem = ({
	altText,
	imgId,
	imgUrl,
	isThumbnail,
	handleDeleteImg,
	handleThumbnailChange,
	onImgChange,
}: CarouselImageItemProps) => {
	return (
		<CarouselItem className="flex justify-center relative h-full basis-full">
			<Image
				alt={altText}
				className="aspect-square w-full rounded-md object-cover"
				height="400"
				width="400"
				src={imgUrl}
				quality={75}
				priority={isThumbnail}
				unoptimized={imgUrl.startsWith("blob:")}
			/>
			<div className="absolute top-2 right-2 flex gap-2 z-50">
				<label className="cursor-pointer" htmlFor={imgId}>
					<input
						id={imgId}
						type="file"
						accept="image/*"
						className="sr-only"
						onChange={onImgChange}
					/>
					<span className="inline-flex items-center justify-center size-8 rounded-full bg-background/80 hover:bg-background backdrop-blur-sm transition-colors group">
						<RefreshCw className="size-4 text-blue-600 transition-transform group-hover:scale-125" />
						<span className="sr-only">Replace image</span>
					</span>
				</label>
				<StarButton isThumbnail={isThumbnail} onClick={handleThumbnailChange} />
				{handleDeleteImg !== null && <DeleteButton onClick={handleDeleteImg} />}
			</div>
			<div className="absolute bottom-2 bg-background/80 backdrop-blur-sm rounded px-2 py-1">
				<p className="truncate text-xs font-medium">{altText}</p>
			</div>
		</CarouselItem>
	);
};

function DropZone({
	onChange,
}: {
	onChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
}) {
	return (
		<div className="relative flex cursor-pointer items-center justify-center rounded-md border-2 border-input border-dashed p-16">
			<input
				type="file"
				accept="image/*"
				multiple
				onChange={onChange}
				className="absolute inset-0 z-50 h-full w-full cursor-pointer opacity-0"
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
