import type { DragEndEvent, DragOverEvent, DragStartEvent } from "@dnd-kit/dom";
import { Accessibility } from "@dnd-kit/dom";
import { arrayMove } from "@dnd-kit/helpers";
import { DragDropProvider } from "@dnd-kit/react";
import { isSortable, useSortable } from "@dnd-kit/react/sortable";
import * as ProductModel from "@spice-world/server/modules/products/model";
import type { ImageResult } from "@spice-world/server/modules/shared";
import { Badge } from "@spice-world/ui/components/badge";
import { Button, buttonVariants } from "@spice-world/ui/components/button";
import {
  Field,
  FieldDescription,
  FieldLabel,
} from "@spice-world/ui/components/field";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@spice-world/ui/components/popover";
import { Textarea } from "@spice-world/ui/components/textarea";
import { standardSchema } from "@spice-world/ui/lib/schema";
import { cn } from "@spice-world/ui/lib/utils";
import {
  ImagePlusIcon,
  RefreshCwIcon,
  StarIcon,
  Trash2Icon,
} from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";

export interface ImageDraft {
  altText: string;
  file?: File;
  id?: string;
  key: string;
  url?: string;
}

export const draftsOf = (images: ImageResult[]): ImageDraft[] =>
  images.map(({ altText, id, urlMedium }) => ({
    altText: altText ?? "",
    id,
    key: id,
    url: urlMedium,
  }));

export function imageOperations(
  images: ImageResult[],
  drafts: ImageDraft[],
): ProductModel.imageOperations | undefined {
  const kept = new Set(drafts.map(({ id }) => id));
  const ops = {
    create: drafts.flatMap(({ altText, file, id }, position) =>
      !id && file ? [{ file, position, ...(altText && { altText }) }] : [],
    ),
    update: drafts.flatMap(({ altText, file, id }, position) => {
      const image = images.find((saved) => saved.id === id);
      const altChanged = image && (image.altText ?? "") !== altText;
      return image && (file || altChanged || image.position !== position)
        ? [{ file, id: image.id, position, ...(altChanged && { altText }) }]
        : [];
    }),
    delete: images.filter(({ id }) => !kept.has(id)).map(({ id }) => id),
  };
  return ops.create.length || ops.update.length || ops.delete.length
    ? ops
    : undefined;
}

const imageCreate = standardSchema(ProductModel.imageCreate)["~standard"];
function rejection(file: File) {
  const result = imageCreate.validate({ file, position: 0 });
  const message = "issues" in result ? result.issues?.[0]?.message : undefined;
  return message ? `${file.name}: ${message}` : undefined;
}

export function useObjectUrl(file?: File) {
  const [url, setUrl] = useState<string>();
  useEffect(() => {
    if (!file) {
      return;
    }
    const objectUrl = URL.createObjectURL(file);
    setUrl(objectUrl);
    return () => URL.revokeObjectURL(objectUrl);
  }, [file]);
  return file ? url : undefined;
}

const announcements = Accessibility.configure({
  announcements: {
    dragstart: ({ operation: { source } }: DragStartEvent) =>
      isSortable(source) ? `Picked up image ${source.index + 1}.` : undefined,
    dragover: ({ operation: { source } }: DragOverEvent) =>
      isSortable(source)
        ? `Image moved to position ${source.index + 1}.`
        : undefined,
    dragend: ({ canceled, operation: { source } }: DragEndEvent) => {
      if (!isSortable(source)) {
        return;
      }
      return canceled
        ? `Reorder cancelled: image back to position ${source.initialIndex + 1}.`
        : `Image dropped at position ${source.index + 1}${source.index ? "" : ", the cover"}.`;
    },
  },
});

const ACTION =
  "bg-background/85 hover:bg-background size-8 rounded-full backdrop-blur-sm";

export function ProductImages({
  onChange,
  value,
}: {
  onChange: (value: ImageDraft[]) => void;
  value: ImageDraft[];
}) {
  const add = (files: File[]) => {
    const room = ProductModel.MAX_IMAGES_PER_PRODUCT - value.length;
    const errors = files.map(rejection).filter(Boolean);
    if (errors.length || files.length > room) {
      toast.error(
        errors[0] ??
          `A product has at most ${ProductModel.MAX_IMAGES_PER_PRODUCT} images.`,
      );
      return;
    }
    onChange([
      ...value,
      ...files.map((file) => ({
        altText: "",
        file,
        key: crypto.randomUUID(),
      })),
    ]);
  };
  const edit = (key: string, changes: Partial<ImageDraft>) =>
    onChange(
      value.map((draft) =>
        draft.key === key ? { ...draft, ...changes } : draft,
      ),
    );

  return (
    <DragDropProvider
      onDragEnd={({ canceled, operation: { source } }) => {
        if (!canceled && isSortable(source)) {
          onChange(arrayMove(value, source.initialIndex, source.index));
        }
      }}
      plugins={(defaults) => [...defaults, announcements]}
    >
      <ul className="grid grid-cols-3 gap-3 sm:grid-cols-4">
        {value.map((draft, index) => (
          <ImageTile
            draft={draft}
            index={index}
            key={draft.key}
            onAltText={(altText) => edit(draft.key, { altText })}
            onCover={() => onChange(arrayMove(value, index, 0))}
            onRemove={
              value.length > 1
                ? () => onChange(value.filter(({ key }) => key !== draft.key))
                : undefined
            }
            onReplace={(file) => {
              const error = rejection(file);
              if (error) {
                toast.error(error);
                return;
              }
              edit(draft.key, { file });
            }}
          />
        ))}
        {value.length < ProductModel.MAX_IMAGES_PER_PRODUCT ? (
          <li className="relative">
            <label className="border-input text-muted-foreground hover:bg-accent/50 hover:text-foreground has-focus-visible:ring-ring/50 flex aspect-square flex-col items-center justify-center gap-1.5 rounded-lg border-2 border-dashed text-center text-xs transition-colors has-focus-visible:ring-3">
              <ImagePlusIcon className="size-5" />
              Add images
              <input
                accept="image/*"
                aria-label="Add images"
                className="absolute inset-0 cursor-pointer opacity-0"
                multiple
                onChange={(e) => {
                  add([...(e.target.files ?? [])]);
                  e.target.value = "";
                }}
                type="file"
              />
            </label>
          </li>
        ) : null}
      </ul>
    </DragDropProvider>
  );
}

function ImageTile({
  draft,
  index,
  onAltText,
  onCover,
  onRemove,
  onReplace,
}: {
  draft: ImageDraft;
  index: number;
  onAltText: (altText: string) => void;
  onCover: () => void;
  onRemove?: () => void;
  onReplace: (file: File) => void;
}) {
  const { isDragging, ref } = useSortable({ id: draft.key, index });
  const src = useObjectUrl(draft.file) ?? draft.url;

  return (
    <li
      aria-label={`Image ${index + 1}${index ? "" : ", cover"}`}
      className={cn(
        "group bg-muted focus-visible:ring-ring/50 relative aspect-square cursor-grab touch-manipulation overflow-hidden rounded-lg border outline-none first:col-span-2 first:row-span-2 focus-visible:ring-3",
        isDragging && "cursor-grabbing opacity-60 shadow-lg",
      )}
      ref={ref}
    >
      {src ? (
        <img
          alt={draft.altText || `Product image ${index + 1}`}
          className="pointer-events-none size-full object-cover select-none"
          decoding="async"
          height={512}
          src={src}
          width={512}
        />
      ) : null}
      {index ? null : <Badge className="absolute top-2 left-2">Cover</Badge>}
      <Popover>
        <PopoverTrigger
          render={
            <Button
              className={cn(
                "absolute bottom-2 left-2 h-6 px-2 text-[0.6875rem] font-semibold tracking-wide",
                draft.altText ? null : "text-muted-foreground border-dashed",
              )}
              size="sm"
              type="button"
              variant="outline"
            />
          }
        >
          {draft.altText ? "ALT" : "+ ALT"}
        </PopoverTrigger>
        <PopoverContent align="start" className="w-72">
          <Field>
            <FieldLabel htmlFor={`alt-${draft.key}`}>Alt text</FieldLabel>
            <Textarea
              id={`alt-${draft.key}`}
              onChange={(e) => onAltText(e.target.value)}
              placeholder="Ground cumin in a wooden bowl"
              value={draft.altText}
            />
            <FieldDescription>
              Describes the image to screen readers and search engines.
            </FieldDescription>
          </Field>
        </PopoverContent>
      </Popover>
      <div className="absolute top-2 right-2 flex gap-1.5 opacity-0 transition-opacity group-focus-within:opacity-100 group-hover:opacity-100 pointer-coarse:opacity-100">
        {index ? (
          <Button
            aria-label="Set as cover"
            className={ACTION}
            onClick={onCover}
            size="icon"
            title="Set as cover"
            type="button"
            variant="ghost"
          >
            <StarIcon />
          </Button>
        ) : null}
        <label
          className={cn(
            buttonVariants({ size: "icon", variant: "ghost" }),
            ACTION,
            "has-focus-visible:ring-ring/50 cursor-pointer has-focus-visible:ring-3",
          )}
          title="Replace"
        >
          <RefreshCwIcon />
          <input
            accept="image/*"
            aria-label="Replace image"
            className="sr-only"
            onChange={(e) => {
              const [file] = e.target.files ?? [];
              if (file) {
                onReplace(file);
              }
              e.target.value = "";
            }}
            type="file"
          />
        </label>
        {onRemove ? (
          <Button
            aria-label="Remove image"
            className={cn(ACTION, "text-destructive")}
            onClick={onRemove}
            size="icon"
            title="Remove"
            type="button"
            variant="ghost"
          >
            <Trash2Icon />
          </Button>
        ) : null}
      </div>
    </li>
  );
}
