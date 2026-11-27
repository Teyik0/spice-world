import * as ProductModel from "@spice-world/server/modules/products/model";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@spice-world/ui/components/alert-dialog";
import { Button } from "@spice-world/ui/components/button";
import {
  Field,
  FieldError,
  FieldGroup,
  FieldLabel,
  FieldLegend,
  FieldSet,
} from "@spice-world/ui/components/field";
import {
  focusFirstError,
  SubmitButton,
  useAppForm,
} from "@spice-world/ui/components/form";
import { Input } from "@spice-world/ui/components/input";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "@spice-world/ui/components/sheet";
import { Skeleton } from "@spice-world/ui/components/skeleton";
import {
  ToggleGroup,
  ToggleGroupItem,
} from "@spice-world/ui/components/toggle-group";
import { standardSchema } from "@spice-world/ui/lib/schema";
import { useQuery } from "@teyik0/furin/client";
import { Link, useNavigate } from "@teyik0/furin/link";
import { t } from "elysia";
import { ArrowUpRightIcon } from "lucide-react";
import type { ReactNode, RefObject } from "react";
import { createContext, use, useEffect, useRef, useState } from "react";
import { flushSync } from "react-dom";
import { toast } from "sonner";

import { api } from "../../../../lib/api";
import { formatCount } from "../../../../lib/format";
import type { ProductsQuery } from "./products-query";
import { label, STATUSES, useProductsQuery } from "./products-query";
import {
  mergeUpdates,
  stockDraft,
  stockDraftOf,
  StockInput,
  variantOperations,
} from "./stock";

const quickEditBody = t.Object({
  ...t.Omit(ProductModel.patchBody, ["stockMode", "inventory"]).properties,
  stock: stockDraft,
});

function useQuickEdit(query: ProductsQuery) {
  const navigate = useNavigate();
  const [id, setId] = useState(query.edit);
  if (query.edit && query.edit !== id) {
    setId(query.edit);
  }
  const [pending, setPending] = useState<() => void>();
  const dirty = useRef<boolean>(false);
  const guard = (action: () => void) =>
    dirty.current ? setPending(() => action) : action();
  const setOpen = (open: boolean) =>
    navigate({
      to: "/products",
      search: { ...query, edit: open ? id : undefined },
    });
  return {
    dirty,
    edit: (next: string) =>
      query.edit === next
        ? undefined
        : guard(() =>
            navigate({ to: "/products", search: { ...query, edit: next } }),
          ),
    guard,
    id,
    open: Boolean(query.edit),
    pending,
    setOpen,
    setPending,
  };
}

const QuickEditContext = createContext<ReturnType<typeof useQuickEdit> | null>(
  null,
);

export function QuickEditProvider({ children }: { children: ReactNode }) {
  const [query] = useProductsQuery();
  const quickEdit = useQuickEdit(query);
  return (
    <QuickEditContext value={quickEdit}>
      {children}
      <ProductQuickEdit {...quickEdit} />
    </QuickEditContext>
  );
}

export function useQuickEditContext() {
  const context = use(QuickEditContext);
  if (!context) {
    throw new Error(
      "useQuickEditContext must be used within QuickEditProvider",
    );
  }
  return context;
}

function ProductQuickEdit({
  dirty,
  guard,
  id,
  open,
  pending,
  setOpen,
  setPending,
}: ReturnType<typeof useQuickEdit>) {
  return (
    <>
      <Sheet
        disablePointerDismissal
        modal={false}
        onOpenChange={(next) =>
          next ? setOpen(true) : guard(() => setOpen(false))
        }
        open={open}
      >
        <SheetContent
          className="gap-0 rounded-xl border data-[side=right]:inset-y-2 data-[side=right]:right-2 data-[side=right]:h-auto data-[side=right]:w-[calc(100%-1rem)] data-[side=right]:sm:max-w-md"
          overlay={false}
        >
          {id ? (
            <Loaded dirty={dirty} id={id} onDone={() => setOpen(false)} />
          ) : null}
        </SheetContent>
      </Sheet>
      <AlertDialog
        onOpenChange={(next) => (next ? null : setPending(undefined))}
        open={pending !== undefined}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Discard unsaved changes?</AlertDialogTitle>
            <AlertDialogDescription>
              Your edits to this product will be lost.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Keep Editing</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                dirty.current = false;
                pending?.();
                setPending(undefined);
              }}
              variant="destructive"
            >
              Discard Changes
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

function Loaded({
  dirty,
  id,
  onDone,
}: {
  dirty: RefObject<boolean>;
  id: string;
  onDone: () => void;
}) {
  const { data, error } = useQuery(api.products({ id }).get.live());
  if (error) {
    return (
      <SheetHeader>
        <SheetTitle>Couldn’t load this product</SheetTitle>
        <SheetDescription>
          {"message" in error.value ? error.value.message : error.value.title}
        </SheetDescription>
      </SheetHeader>
    );
  }
  if (!data) {
    return (
      <div aria-busy="true" className="flex flex-col gap-4 p-4">
        <SheetTitle className="sr-only">Loading product</SheetTitle>
        <Skeleton className="h-32 rounded-lg" />
        <Skeleton className="h-9" />
        <Skeleton className="h-24" />
      </div>
    );
  }

  return (
    <QuickEditForm
      dirty={dirty}
      key={`${data.id}:${data.version}`}
      onDone={onDone}
      product={ProductModel.adminView(data)}
    />
  );
}

export const variantName = (
  variant: ProductModel.productResult["variants"][number],
) =>
  variant.attributeValues.map((v) => v.value).join(" · ") ||
  variant.sku ||
  "Default";

const fieldsOf = (product: ProductModel.productResult) => ({
  name: product.name,
  description: product.description,
  status: product.status,
  variants: {
    update: product.variants.map(({ id, price }) => ({ id, price })),
  },
  stock: stockDraftOf(product),
});

function QuickEditForm({
  dirty,
  onDone,
  product,
}: {
  dirty: RefObject<boolean>;
  onDone: () => void;
  product: ProductModel.productResult;
}) {
  const [failure, setFailure] = useState<{ message: string }[]>([]);
  const failureRef = useRef<HTMLDivElement>(null);
  const initial = fieldsOf(product);
  const form = useAppForm({
    defaultValues: initial,
    validators: { onSubmit: standardSchema(quickEditBody) },
    onSubmitInvalid: focusFirstError,
    listeners: {
      onChange: ({ formApi }) => {
        dirty.current = !formApi.state.isDefaultValue;
      },
    },
    onSubmit: async ({ value }) => {
      const { update: updates, ...stock } = variantOperations(
        product,
        value.stock,
      );
      const update = mergeUpdates(
        value.variants.update.filter(
          (v, i) => v.price !== initial.variants.update[i]?.price,
        ),
        updates,
      );
      const { error } = await api.products({ id: product.id }).patch(
        {
          ...(value.name === product.name ? {} : { name: value.name }),
          ...(value.description === product.description
            ? {}
            : { description: value.description }),
          ...(value.status === product.status ? {} : { status: value.status }),
          ...stock,
          ...(update.length ? { variants: { update } } : {}),
        },
        { headers: { "x-version": product.version } },
      );
      if (error) {
        flushSync(() =>
          setFailure(
            "details" in error.value
              ? error.value.details.subErrors
              : [error.value],
          ),
        );
        failureRef.current?.scrollIntoView({ block: "nearest" });
        return;
      }
      toast.success(`${value.name} updated.`);
      dirty.current = false;
      onDone();
    },
  });

  useEffect(
    () => () => {
      dirty.current = false;
    },
    [dirty],
  );
  const [thumbnail] = product.images;
  const shared = product.stockMode === "SHARED";
  const dimension = product.variants[0]?.inventory.dimension ?? "COUNT";

  return (
    <form
      action={() => form.handleSubmit()}
      className="flex min-h-0 flex-1 flex-col"
      noValidate
    >
      <SheetHeader className="border-b pr-12">
        <SheetDescription className="truncate font-mono text-xs">
          /products/{product.slug}
        </SheetDescription>
        <SheetTitle className="sr-only">Edit {product.name}</SheetTitle>
      </SheetHeader>

      <div className="flex flex-1 flex-col gap-6 overflow-y-auto overscroll-contain p-4 motion-safe:scroll-smooth">
        {thumbnail ? (
          <img
            alt={thumbnail.altText ?? ""}
            className="aspect-video w-full rounded-lg object-cover"
            height={180}
            src={thumbnail.urlMedium}
            width={320}
          />
        ) : null}
        <FieldGroup>
          <form.AppField name="name">
            {(field) => (
              <field.TextField
                autoComplete="off"
                label="Name"
                onChange={(e) =>
                  field.handleChange(e.target.value.toLowerCase())
                }
                spellCheck={false}
              />
            )}
          </form.AppField>
          <form.AppField name="description">
            {(field) => (
              <field.TextareaField className="min-h-24" label="Description" />
            )}
          </form.AppField>
          <form.Field name="status">
            {(field) => (
              <Field>
                <FieldLabel>Status</FieldLabel>
                <ToggleGroup
                  className="bg-muted w-full rounded-lg p-0.5"
                  onValueChange={([next]) => {
                    const status = STATUSES.find((s) => s === next);
                    if (status) {
                      field.handleChange(status);
                    }
                  }}
                  size="sm"
                  spacing={0}
                  value={[field.state.value]}
                >
                  {STATUSES.map((status) => (
                    <ToggleGroupItem
                      className="data-pressed:bg-background flex-1 rounded-md! data-pressed:shadow-sm"
                      key={status}
                      value={status}
                    >
                      {label(status)}
                    </ToggleGroupItem>
                  ))}
                </ToggleGroup>
              </Field>
            )}
          </form.Field>
        </FieldGroup>

        {shared ? (
          <form.Field name="stock.quantity">
            {(field) => (
              <Field>
                <FieldLabel htmlFor={field.name}>Shared Stock</FieldLabel>
                <StockInput
                  aria-invalid={!field.state.meta.isValid}
                  dimension={dimension}
                  id={field.name}
                  label="Shared stock"
                  name={field.name}
                  onChange={field.handleChange}
                  value={field.state.value}
                />
              </Field>
            )}
          </form.Field>
        ) : null}

        <FieldSet className="gap-2">
          <FieldLegend variant="label">Variants</FieldLegend>
          <div className="text-muted-foreground grid grid-cols-[1fr_6.5rem_6.5rem] gap-2 text-xs">
            <span>Variant</span>
            <span>Price (€)</span>
            <span>{shared ? "Available" : "Stock"}</span>
          </div>
          {product.variants.map((variant, i) => (
            <div
              className="grid grid-cols-[1fr_6.5rem_6.5rem] items-center gap-2"
              key={variant.id}
            >
              <span className="truncate text-sm">{variantName(variant)}</span>
              <form.Field name={`variants.update[${i}].price`}>
                {(field) => (
                  <Input
                    aria-invalid={!field.state.meta.isValid}
                    aria-label={`${variantName(variant)} price`}
                    className="text-right tabular-nums"
                    id={field.name}
                    inputMode="decimal"
                    min={0}
                    name={field.name}
                    onChange={(e) =>
                      field.handleChange(
                        Math.round(e.target.valueAsNumber * 100),
                      )
                    }
                    step={0.01}
                    type="number"
                    value={
                      Number.isNaN(field.state.value)
                        ? ""
                        : field.state.value / 100
                    }
                  />
                )}
              </form.Field>
              {shared ? (
                <span className="text-muted-foreground text-right text-sm tabular-nums">
                  {formatCount(variant.available)}
                </span>
              ) : (
                <form.Field name={`stock.variants[${i}].quantity`}>
                  {(field) => (
                    <StockInput
                      aria-invalid={!field.state.meta.isValid}
                      dimension="COUNT"
                      id={field.name}
                      label={`${variantName(variant)} stock`}
                      name={field.name}
                      onChange={field.handleChange}
                      value={field.state.value}
                    />
                  )}
                </form.Field>
              )}
            </div>
          ))}
        </FieldSet>
        <FieldError aria-live="polite" errors={failure} ref={failureRef} />
      </div>

      <SheetFooter className="flex-row justify-end border-t">
        <Button
          nativeButton={false}
          render={<Link params={{ slug: product.slug }} to="/products/:slug" />}
          variant="outline"
        >
          <ArrowUpRightIcon data-icon="inline-start" />
          Open Product
        </Button>
        <SubmitButton>Save Changes</SubmitButton>
      </SheetFooter>
    </form>
  );
}
