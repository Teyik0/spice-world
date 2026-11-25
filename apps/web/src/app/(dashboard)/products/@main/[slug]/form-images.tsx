"use client";

import type * as ProductModel from "@spice-world/server/modules/products/model";
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
  altText: string | null;
  id: string;
  isThumbnail: boolean;
  urlLarge: string;
  urlMedium: string;
  urlThumb: string;
}

interface ProductFormImagesProps {
  existingImages?: ImageMetadata[];
  form: ProductForm;
  isNew: boolean;
  slug: string;
}

interface DisplayImage {
  altText: string;
  file?: File;
  id: string;
  isThumbnail: boolean;
  originalId?: string;
  url: string;
  urlThumb: string;
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
  // Cache blob URLs by File object to prevent creating duplicate URLs for the same file
  const fileUrlCache = useRef<Map<File, string>>(new Map());

  useEffect(() => {
    if (!api) {
      return;
    }
    setCurrent(api.selectedScrollSnap() + 1);
    api.on("select", () => setCurrent(api.selectedScrollSnap() + 1));
  }, [api]);

  const existingMap = useMemo(
    () => new Map(existingImages.map((img) => [img.id, img])),
    [existingImages],
  );

  const getFileUrl = (file: File) => {
    let url = fileUrlCache.current.get(file);
    if (!url) {
      url = URL.createObjectURL(file);
      fileUrlCache.current.set(file, url);
      createdBlobUrls.current.add(url);
    }
    return url;
  };

  const { displayImages, imageOps } = useStore(form.store, (state) => {
    const ops = state.values.images as ProductModel.imageOperations | undefined;
    const createOps = ops?.create ?? [];
    const updateOps = ops?.update ?? [];
    const deleteIds = new Set(ops?.delete ?? []);

    const images: DisplayImage[] = [];

    // Process existing images
    for (const [id, img] of existingMap) {
      if (deleteIds.has(id)) {
        continue;
      }

      const updateOp = updateOps.find((op) => op.id === id);
      const updatedFile = updateOp?.file;

      const url = updatedFile ? getFileUrl(updatedFile) : img.urlMedium;

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
      const url = getFileUrl(op.file);
      const urlThumb = url;

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
  useEffect(
    () => () => {
      for (const url of createdBlobUrls.current) {
        URL.revokeObjectURL(url);
      }
      createdBlobUrls.current.clear();
    },
    [],
  );

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

      const currentCreate = imageOps?.create ?? [];

      form.setFieldValue("images.create", [
        ...currentCreate,
        ...files.map((file) => ({
          file,
          altText: file.name,
          isThumbnail: false,
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
            isThumbnail: imageToReplace?.isThumbnail ?? false,
          };
          form.setFieldValue("images.create", newCreate);
        }
      }
    },
    [existingMap, imageOps, displayImages, form],
  );

  const handleSetThumbnail = useCallback(
    (imageId: string) => {
      const selected = displayImages.find((image) => image.id === imageId);
      const selectedFile = selected?.originalId ? undefined : selected?.file;
      const currentUpdate = imageOps?.update ?? [];
      form.setFieldValue("images", {
        ...imageOps,
        create: (imageOps?.create ?? []).map((op) => ({
          ...op,
          isThumbnail: op.file === selectedFile,
        })),
        ...(existingMap.size > 0 && {
          update: displayImages
            .filter((image) => image.originalId !== undefined)
            .map((image) => ({
              ...currentUpdate.find((op) => op.id === image.id),
              id: image.id,
              isThumbnail: image.id === imageId,
            })),
        }),
      });
      api?.scrollTo(0);
    },
    [displayImages, existingMap, imageOps, form, api],
  );

  const handleDeleteImage = useCallback(
    (imageId: string) => {
      if (displayImages.length <= 1) {
        return;
      }

      const existing = existingMap.get(imageId);
      const imageToDelete = displayImages.find((d) => d.id === imageId);

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

      setCurrent(1);
    },
    [displayImages, existingMap, imageOps, form],
  );

  const handleFileInputChange = (e: ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    handleAddImages(files);
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
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
          images (max {formatBytes(MAX_FILE_SIZE)} each). Select exactly one
          thumbnail using the star button before saving.
        </CardDescription>
      </CardHeader>

      <CardContent>
        {displayImages.length > 0 &&
          !displayImages.some((image) => image.isThumbnail) && (
            <p className="text-destructive mb-3 text-sm" role="status">
              Select a thumbnail before saving. If you removed it, choose a
              replacement.
            </p>
          )}
        {displayImages.length ? (
          <Carousel
            className="w-full"
            opts={{
              align: "start",
              loop: true,
              duration: 20,
            }}
            setApi={setApi}
          >
            <span className="bg-background/80 absolute top-3 left-3 z-50 rounded px-2 py-1 text-xs font-bold backdrop-blur-sm">
              {current} / {displayImages.length}
            </span>
            <CarouselContent>
              {sortedImages.map((item) => (
                <CarouselItem
                  className="relative flex h-full basis-full justify-center"
                  key={item.id}
                >
                  <Image
                    alt={item.altText}
                    className="aspect-square w-full rounded-md object-cover"
                    height={200}
                    priority={item.isThumbnail}
                    quality={75}
                    src={item.url}
                    unoptimized={item.url.startsWith("blob:")}
                    width={200}
                  />
                  <div className="absolute top-2 right-2 z-50 flex gap-2">
                    <label
                      className="cursor-pointer"
                      htmlFor={`replace-${item.id}`}
                    >
                      <input
                        accept="image/*"
                        className="sr-only"
                        id={`replace-${item.id}`}
                        onChange={(e) => {
                          const file = e.target.files?.[0];
                          if (file) {
                            handleReplaceImage(item.id, file);
                          }
                        }}
                        type="file"
                      />
                      <span className="bg-background/80 hover:bg-background group inline-flex size-8 items-center justify-center rounded-full backdrop-blur-sm transition-colors">
                        <RefreshCw className="size-4 text-blue-600 transition-transform group-hover:scale-125" />
                        <span className="sr-only">Replace image</span>
                      </span>
                    </label>
                    <Button
                      className={`group size-8 rounded-full backdrop-blur-sm transition-all ${
                        item.isThumbnail
                          ? "bg-yellow-500/90 hover:bg-yellow-500"
                          : "bg-background/80 hover:bg-background"
                      }`}
                      onClick={() => handleSetThumbnail(item.id)}
                      size="icon"
                      type="button"
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
                        className="bg-background/80 hover:bg-background group size-8 rounded-full backdrop-blur-sm transition-colors"
                        onClick={() => handleDeleteImage(item.id)}
                        size="icon"
                        type="button"
                      >
                        <Trash2 className="size-4 text-red-600 transition-transform group-hover:scale-125" />
                        <span className="sr-only">Delete image</span>
                      </Button>
                    )}
                  </div>
                  <div className="bg-background/80 absolute bottom-2 rounded px-2 py-1 backdrop-blur-sm">
                    <p className="truncate text-xs font-medium">
                      {item.altText}
                    </p>
                  </div>
                </CarouselItem>
              ))}
            </CarouselContent>
            <CarouselPrevious
              className="bg-background/80! hover:bg-background/1! -left-6 size-6 rounded-none backdrop-blur-sm"
              type="button"
            />
            <CarouselNext
              className="bg-background/80! hover:bg-background/1! -right-6 size-6 rounded-none backdrop-blur-sm"
              type="button"
            />
            <div className="mt-4">
              <input
                accept="image/*"
                className="hidden"
                multiple
                onChange={handleFileInputChange}
                ref={fileInputRef}
                type="file"
              />
              {displayImages.length < MAX_IMAGES && (
                <Button
                  onClick={() => fileInputRef.current?.click()}
                  size="sm"
                  type="button"
                  variant="outline"
                >
                  <Upload className="-ms-0.5 h-3.5 w-3.5 opacity-60" />
                  Add more
                </Button>
              )}
            </div>
          </Carousel>
        ) : (
          <label className="border-input hover:bg-accent/50 relative flex cursor-pointer items-center justify-center rounded-md border-2 border-dashed p-16 transition-colors">
            <input
              accept="image/*"
              className="absolute inset-0 z-50 h-full w-full cursor-pointer opacity-0"
              multiple
              onChange={handleFileInputChange}
              type="file"
            />
            <div className="flex flex-col items-center justify-center text-center">
              <div
                aria-hidden="true"
                className="bg-background mb-2 flex h-11 w-11 shrink-0 items-center justify-center rounded-full border"
              >
                <ImageIcon className="h-4 w-4 opacity-60" />
              </div>
              <p className="mb-1.5 text-sm font-medium">
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
