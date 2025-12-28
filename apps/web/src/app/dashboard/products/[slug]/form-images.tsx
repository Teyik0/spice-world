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
import { useSetAtom } from "jotai";
import { ImageIcon, RefreshCw, Star, Trash2Icon, Upload } from "lucide-react";
import Image from "next/image";
import {
	type ChangeEvent,
	useCallback,
	useEffect,
	useRef,
	useState,
} from "react";
import { toast } from "sonner";
import {
	currentProductAtom,
	newProductAtom,
	type ProductItemProps,
} from "../store";

const MAX_IMAGES = 5;
const MAX_FILE_SIZE = 1024 * 1024 * 3;

interface ImageMetadata {
	id: string;
	url: string;
	isThumbnail: boolean;
	altText: string | null;
}

interface ProductFormImagesProps {
	isNew: boolean;
	form: ReturnType<
		typeof useForm<typeof ProductModel.postBody | typeof ProductModel.patchBody>
	>;
	existingImages?: ImageMetadata[];
}

export const ProductFormImages = ({
	isNew,
	form,
	existingImages = [],
}: ProductFormImagesProps) => {
	const [api, setApi] = useState<CarouselApi>();
	const [current, setCurrent] = useState(0);
	useEffect(() => {
		// Track carousel state
		if (!api) return;
		setCurrent(api.selectedScrollSnap() + 1);
		api.on("select", () => {
			setCurrent(api.selectedScrollSnap() + 1);
		});
	}, [api]);

	const fileInputRef = useRef<HTMLInputElement>(null);
	const setSidebarProduct = useSetAtom(
		isNew ? newProductAtom : currentProductAtom,
	);
	type UnifiedImage = ImageMetadata & {
		state: "toCreate" | "toUpdate" | null;
		fileIndex?: number; // Pour référencer form.images
		file?: File;
	};
	const [files, setFiles] = useState<UnifiedImage[]>(() =>
		existingImages.map((img) => ({
			...img,
			state: null,
		})),
	);

	useEffect(() => {
		// Sync product card on sidebar
		const newThum = files.find((img) => img.isThumbnail);
		setSidebarProduct((prev) => ({
			...(prev as ProductItemProps),
			img: newThum ? newThum.url : null,
		}));
	}, [setSidebarProduct, files]);

	const syncToForm = useCallback(
		(images: UnifiedImage[]) => {
			const toCreate = images.filter((img) => img.state === "toCreate");
			const toUpdate = images.filter((img) => img.state === "toUpdate");

			// Sync images array
			const allFiles = [
				...toCreate.map((img) => img.file as File),
				...toUpdate.filter((img) => img.file).map((img) => img.file as File),
			];
			if (allFiles.length > 0) {
				form.setFieldValue("images", allFiles);
			}

			// Sync imagesOps.create
			form.setFieldValue(
				"imagesOps.create",
				toCreate.map((img, index) => ({
					fileIndex: index,
					altText: img.altText ?? img.file?.name,
					isThumbnail: img.isThumbnail,
				})),
			);

			// Sync imagesOps.update
			if (toUpdate.length > 0) {
				form.setFieldValue(
					"imagesOps.update",
					toUpdate.map((img, index) => ({
						id: img.id,
						altText: img.altText ?? img.file?.name,
						isThumbnail: img.isThumbnail,
						fileIndex: img.file ? toCreate.length + index : undefined,
					})),
				);
			}
		},
		[form],
	);

	useEffect(() => {
		// Sync files to form whenever files change
		syncToForm(files);
	}, [files, syncToForm]);

	const handleNewImg = (e: React.ChangeEvent<HTMLInputElement>) => {
		const selectedFiles = Array.from(e.target.files || []);

		if (files.length + selectedFiles.length > MAX_IMAGES) {
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

		// Créer les nouvelles images
		const newImgs: UnifiedImage[] = selectedFiles.map((file) => ({
			id: crypto.randomUUID(),
			url: URL.createObjectURL(file),
			altText: file.name,
			isThumbnail: files.length === 0, // First image is thumbnail
			state: "toCreate",
			file,
		}));

		setFiles((prev) => {
			const updated = [...prev, ...newImgs];
			setTimeout(() => {
				// wait the files update and component rerender
				api?.scrollTo(updated.length - 1);
			}, 50);
			return updated;
		});

		// Reset input to allow re-selection
		if (fileInputRef.current) {
			fileInputRef.current.value = "";
		}
	};

	const handleImgChange = (e: ChangeEvent<HTMLInputElement>, imgId: string) => {
		const newFile = e.target.files?.[0];
		if (!newFile) return;

		setFiles((prev) => {
			const updated = prev.map((img) => {
				if (img.id !== imgId) return img;

				// Révoquer l'ancien blob URL si c'était un fichier local
				if (img.url.startsWith("blob:")) {
					URL.revokeObjectURL(img.url);
				}

				return {
					...img,
					url: URL.createObjectURL(newFile),
					altText: newFile.name,
					file: newFile,
					state: img.state === null ? "toUpdate" : img.state, // null → toUpdate
				};
			});

			return updated;
		});
	};

	const handleDeleteImg = (imgId: string) => {
		const imgToDelete = files.find((img) => img.id === imgId);
		if (imgToDelete && imgToDelete.state !== "toCreate") {
			// @ts-expect-error - imagesOps.delete exist here
			form.pushFieldValue("imagesOps.delete", imgId);
		}
		setFiles((prev) => {
			const updated = prev.filter((img) => {
				if (img.id !== imgId) return true;
				// Revoke blob url if local file
				if (img.url.startsWith("blob:")) {
					URL.revokeObjectURL(img.url);
				}
				if (img.state === "toCreate") return false;
				return false;
			});

			// If deleted img was the thumbnail, set a new one
			const hasThumbnail = updated.some((img) => img.isThumbnail);
			if (!hasThumbnail && updated.length > 0) {
				const newThumb = updated[0] as UnifiedImage;
				newThumb.isThumbnail = true;
				// If existing image set state "toUpdate"
				if (newThumb.state === null) {
					newThumb.state = "toUpdate";
				}
			}

			return updated;
		});
		setCurrent(1); // update current scroll state
	};

	const handleThumbnailChange = (imgId: string) => {
		setFiles((prev) => {
			const updated = prev.map((img) => {
				const isThumbnail = img.id === imgId;

				return {
					...img,
					isThumbnail,
					// Si on change le thumbnail d'une image existing, marquer toUpdate
					state: img.state === null && isThumbnail ? "toUpdate" : img.state,
				};
			});

			return updated;
		});
		if (api) {
			api.scrollTo(0);
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
				{files.length ? (
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
							{[...files]
								.sort(
									(a, b) => (b.isThumbnail ? 1 : 0) - (a.isThumbnail ? 1 : 0),
								)
								.map((item) => {
									return (
										<CarouselImageItem
											key={item.id}
											altText={item.altText ?? item.file?.name ?? "image"}
											imgId={item.id}
											imgUrl={item.url}
											isThumbnail={item.isThumbnail}
											handleDeleteImg={
												files.length > 1 ? () => handleDeleteImg(item.id) : null
											}
											handleThumbnailChange={() =>
												handleThumbnailChange(item.id)
											}
											onImgChange={(e) => handleImgChange(e, item.id)}
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
							{files.length < MAX_IMAGES && (
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
