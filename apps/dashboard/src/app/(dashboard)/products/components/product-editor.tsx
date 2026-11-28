import type * as CategoryModel from "@spice-world/server/modules/categories/model";
import type * as CollectionModel from "@spice-world/server/modules/collections/model";
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
import { Badge } from "@spice-world/ui/components/badge";
import { Button } from "@spice-world/ui/components/button";
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@spice-world/ui/components/card";
import { FieldGroup } from "@spice-world/ui/components/field";
import {
  focusFirstError,
  SubmitButton,
  useAppForm,
  validateOnSubmitThenChange,
} from "@spice-world/ui/components/form";
import {
  ToggleGroup,
  ToggleGroupItem,
} from "@spice-world/ui/components/toggle-group";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@spice-world/ui/components/tooltip";
import { standardSchema } from "@spice-world/ui/lib/schema";
import { useNavigate } from "@teyik0/furin/link";
import { t } from "elysia";
import { CheckIcon, CircleAlertIcon, InfoIcon, PlusIcon } from "lucide-react";
import { useRef, useState } from "react";
import { toast } from "sonner";

import { ConfirmDelete } from "../../../../components/confirm-delete";
import { api } from "../../../../lib/api";
import { formatAgo, formatStock } from "../../../../lib/format";
import { ON_DARK } from "./bulk-actions";
import { CategoryActions, CategoryAttributes } from "./category-dialog";
import { CollectionDialog, ProductCollections } from "./collection-dialog";
import { draftsOf, imageOperations, ProductImages } from "./product-images";
import {
  draftStock,
  MODES,
  ProductVariants,
  savedStock,
  StockModeToggle,
} from "./product-variants";
import { label, STATUSES } from "./products-query";
import { Price, STATUS_BADGE } from "./products-table";
import type { StockDraft } from "./stock";
import {
  newRow,
  postBodyOf,
  stockDraft,
  stockDraftOf,
  variantOperations,
} from "./stock";

const STATUS_HINTS = {
  DRAFT: "Hidden from the store.",
  PUBLISHED: "Visible in the store.",
  ARCHIVED: "Hidden, kept for past orders.",
} satisfies Record<ProductModel.productResult["status"], string>;
const AVAILABILITY = {
  in: ["text-success", "In stock"],
  low: ["text-warning", "Low stock"],
  out: ["text-destructive", "Out of stock"],
} as const satisfies Record<ProductModel.stockState, readonly [string, string]>;
const DESCRIPTION_MIN = 80;
const editorBody = t.Object({
  ...t.Omit(ProductModel.patchBody, [
    "images",
    "variants",
    "stockMode",
    "inventory",
  ]).properties,
  stock: stockDraft,
});

const categoryHint = (
  product: ProductModel.productResult | undefined,
  categoryId: string,
) =>
  !product || categoryId === product.categoryId
    ? "Sets the attributes its variants can use."
    : "Its variants take values of this category: pick them below.";

const withPicks = (
  stock: StockDraft,
  pick: (row: StockDraft["variants"][number]) => string[],
): StockDraft => ({
  ...stock,
  variants: stock.variants.map((row) => ({
    ...row,
    attributeValueIds: pick(row),
  })),
});

const fieldsOf = (product?: ProductModel.productResult) => ({
  name: product?.name ?? "",
  description: product?.description ?? "",
  status: product?.status ?? "DRAFT",
  categoryId: product?.categoryId ?? "",
  images: draftsOf(product?.images ?? []),
  stock: product
    ? stockDraftOf(product)
    : {
        ...stockDraftOf(),
        variants: [{ ...newRow("VARIANT"), key: crypto.randomUUID() }],
      },
  collectionIds: product?.collectionIds ?? [],
});

const sameIds = (a: string[], b: string[]) =>
  a.length === b.length && a.every((id) => b.includes(id));

function patchOf(
  saved: ProductModel.productResult,
  value: ReturnType<typeof fieldsOf>,
): ProductModel.patchBody {
  const initial = fieldsOf(saved);
  const { collectionIds, stock: stockValue, ...fields } = value;
  const {
    update,
    create,
    delete: remove,
    ...stock
  } = variantOperations(saved, stockValue);
  const variants = {
    ...(update.length && { update }),
    ...(create && { create }),
    ...(remove && { delete: remove }),
  };
  return Object.fromEntries(
    Object.entries({
      ...fields,
      ...stock,
      collectionIds: sameIds(collectionIds, saved.collectionIds)
        ? undefined
        : collectionIds,
      images: imageOperations(saved.images, value.images),
      variants: Object.keys(variants).length ? variants : undefined,
    }).filter(
      ([key, field]) =>
        field !== undefined && field !== initial[key as keyof typeof initial],
    ),
  );
}

const problemMessage = (
  problem:
    | string
    | { detail?: string; title: string }
    | { details: { subErrors: { message: string }[] } },
) => {
  if (typeof problem === "string") {
    return problem;
  }
  return "details" in problem
    ? problem.details.subErrors.map((sub) => sub.message).join("\n")
    : (problem.detail ?? problem.title);
};

function postOf({
  images,
  stock,
  ...fields
}: ReturnType<typeof fieldsOf>): ProductModel.postBody {
  return postBodyOf(
    { ...fields, images: imageOperations([], images)?.create ?? [] },
    stock,
  );
}

function ProductHeader({
  categoryName,
  product,
}: {
  categoryName: string;
  product: ProductModel.productResult;
}) {
  const [cover] = product.images;
  return (
    <div className="flex items-center gap-4 lg:col-span-2">
      {cover ? (
        <img
          alt=""
          className="size-16 shrink-0 rounded-xl border object-cover"
          height={64}
          src={cover.urlThumb}
          width={64}
        />
      ) : null}
      <div className="grid min-w-0 gap-1">
        <div className="flex flex-wrap items-center gap-2.5">
          <h1 className="truncate text-2xl font-semibold tracking-tight first-letter:uppercase">
            {product.name}
          </h1>
          <Badge className={STATUS_BADGE[product.status]}>
            {label(product.status)}
          </Badge>
        </div>
        <p className="text-muted-foreground flex flex-wrap gap-x-4 text-sm">
          <span className="font-mono text-xs leading-5">
            /products/{product.slug}
          </span>
          <span>{categoryName}</span>
          <span>Updated {formatAgo(product.updatedAt)}</span>
        </p>
      </div>
    </div>
  );
}

function ListingSummary({ product }: { product: ProductModel.productResult }) {
  const dimension = product.variants[0]?.inventory.dimension ?? "COUNT";
  const [tone, availability] = AVAILABILITY[product.stockState];
  const soldOut = product.variants.filter((v) => v.stockState === "out").length;
  const stats = [
    ["Price Range", <Price key="price" {...product} />],
    ["Total Stock", formatStock(product.totalStock, dimension)],
    [
      "Availability",
      product.stockState === "low" && soldOut > 0 ? (
        <Tooltip key="state">
          <TooltipTrigger
            render={
              <button
                className={`${tone} focus-visible:ring-ring/50 inline-flex items-center gap-1.5 rounded-sm outline-none focus-visible:ring-3`}
                type="button"
              />
            }
          >
            {availability}
            <InfoIcon aria-hidden="true" className="size-3.5 opacity-70" />
          </TooltipTrigger>
          <TooltipContent>
            {soldOut} variant{soldOut > 1 ? "s" : ""} sold out
          </TooltipContent>
        </Tooltip>
      ) : (
        <span className={tone} key="state">
          {availability}
        </span>
      ),
    ],
    [
      "Variants",
      `${product.variants.length} · ${product.stockMode === "SHARED" ? "shared stock" : "stock per variant"}`,
    ],
  ] as const;
  return (
    <dl className="bg-card ring-foreground/10 grid grid-cols-2 gap-px overflow-hidden rounded-xl ring-1 md:grid-cols-4 lg:col-span-2">
      {stats.map(([term, value]) => (
        <div className="bg-card flex flex-col gap-1 px-5 py-4" key={term}>
          <dt className="text-muted-foreground text-xs">{term}</dt>
          <dd className="text-lg font-semibold tabular-nums">{value}</dd>
        </div>
      ))}
    </dl>
  );
}

function Readiness({
  product,
  values,
}: {
  product?: ProductModel.productResult;
  values: ReturnType<typeof fieldsOf>;
}) {
  const { description, images, name, stock } = values;
  const missingAlt = images.filter(({ altText }) => !altText).length;
  const checks = [
    {
      label: "Name",
      ok: name.trim().length > 0,
      detail: name.trim() || "Required",
    },
    {
      label: "Description",
      ok: description.length >= DESCRIPTION_MIN,
      detail:
        description.length >= DESCRIPTION_MIN
          ? `${description.length} characters`
          : `${DESCRIPTION_MIN - description.length} more characters to reach ${DESCRIPTION_MIN}`,
    },
    {
      label: "Cover image",
      ok: images.length > 0,
      detail: "Shown in listings and search",
    },
    {
      label: "Alt text",
      ok: missingAlt === 0,
      detail: missingAlt
        ? `${missingAlt} of ${images.length} images have none`
        : "Every image has one",
    },
    {
      label: "Prices",
      ok: stock.variants.every(
        (row) => row.deleted || Number.isInteger(row.price),
      ),
      detail: "Every variant needs one",
    },
    {
      label: "Stock",
      ok: product?.stockState === "in",
      detail: product
        ? AVAILABILITY[product.stockState][1]
        : "Checked on first save",
    },
  ];
  const done = checks.filter(({ ok }) => ok).length;
  return (
    <Card>
      <CardHeader>
        <CardTitle>Store Readiness</CardTitle>
        <CardDescription className="tabular-nums">
          {done} of {checks.length} checks pass
        </CardDescription>
      </CardHeader>
      <CardContent className="grid gap-3">
        <div aria-hidden="true" className="flex gap-1">
          {checks.map(({ label: text, ok }) => (
            <span
              className={`h-1 flex-1 rounded-full ${ok ? "bg-success" : "bg-warning"}`}
              key={text}
            />
          ))}
        </div>
        <ul className="grid gap-3">
          {checks.map(({ detail, label: text, ok }) => (
            <li className="flex gap-2.5" key={text}>
              {ok ? (
                <CheckIcon
                  aria-label="Done"
                  className="text-success mt-0.5 size-4 shrink-0"
                />
              ) : (
                <CircleAlertIcon
                  aria-label="To do"
                  className="text-warning mt-0.5 size-4 shrink-0"
                />
              )}
              <span className="grid">
                <span className="font-medium">{text}</span>
                <span className="text-muted-foreground text-xs first-letter:uppercase">
                  {detail}
                </span>
              </span>
            </li>
          ))}
        </ul>
      </CardContent>
    </Card>
  );
}

export function ProductEditor({
  initialCategories,
  initialCollections,
  product,
}: {
  initialCategories: CategoryModel.categoryResult[];
  initialCollections: CollectionModel.collectionResult[];
  product?: ProductModel.productResult;
}) {
  const navigate = useNavigate();
  const [saved, setSaved] = useState(product);
  const [categories, setCategories] = useState(initialCategories);
  const [collections, setCollections] = useState(initialCollections);
  const [confirming, setConfirming] = useState(false);
  const confirmed = useRef(false);

  const form = useAppForm({
    defaultValues: fieldsOf(saved),
    validationLogic: validateOnSubmitThenChange,
    validators: {
      onDynamic: standardSchema(editorBody),
    },
    onSubmitInvalid: focusFirstError,
    onSubmit: async ({ value, formApi }) => {
      if (saved && value.stock.mode !== saved.stockMode && !confirmed.current) {
        setConfirming(true);
        return;
      }
      confirmed.current = false;
      const changed = saved && patchOf(saved, value);
      const { data, error } =
        saved && changed
          ? await api
              .products({ id: saved.id })
              .patch(changed, { headers: { "x-version": saved.version } })
          : await api.products.post(postOf(value));

      if (error) {
        toast.error(problemMessage(error.value));
        return;
      }

      setSaved(data);
      formApi.reset(fieldsOf(data));
      toast.success(saved ? "Product saved." : "Product created.");

      if (changed?.collectionIds) {
        const list = await api.collections.get();
        if (list.error) {
          toast.error(list.error.value.detail ?? list.error.value.title);
        } else {
          setCollections(list.data);
        }
      }

      if (data.slug !== saved?.slug) {
        await navigate({
          to: "/products/:slug",
          params: { slug: data.slug },
          replace: true,
        });
      }
    },
  });

  return (
    <form
      action={() => form.handleSubmit()}
      className="mx-auto grid w-full max-w-6xl items-start gap-6 lg:grid-cols-[minmax(0,1fr)_20rem]"
      noValidate
    >
      {saved ? (
        <>
          <ProductHeader
            categoryName={
              categories.find(({ id }) => id === saved.categoryId)?.name ??
              saved.category.name
            }
            product={saved}
          />
          <ListingSummary product={saved} />
        </>
      ) : (
        <h1 className="text-2xl font-semibold tracking-tight lg:col-span-2">
          New Product
        </h1>
      )}

      <div className="grid gap-6">
        <Card>
          <CardHeader>
            <CardTitle>Details</CardTitle>
            <CardDescription>What customers read in the store.</CardDescription>
          </CardHeader>
          <CardContent>
            <FieldGroup>
              <form.AppField name="name">
                {(field) => (
                  <field.TextField
                    autoComplete="off"
                    description="Lowercase. The product URL follows the name."
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
                  <field.TextareaField
                    className="min-h-40"
                    label="Description"
                  />
                )}
              </form.AppField>
            </FieldGroup>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Images</CardTitle>
            <CardDescription>
              Up to {ProductModel.MAX_IMAGES_PER_PRODUCT}. Drag to reorder: the
              first is the cover, shown in listings and search.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form.Field name="images">
              {(field) => (
                <ProductImages
                  onChange={field.handleChange}
                  value={field.state.value}
                />
              )}
            </form.Field>
          </CardContent>
        </Card>

        <Card>
          <form.Field name="stock">
            {(field) => (
              <CardHeader>
                <CardTitle>Variants & Stock</CardTitle>
                <CardDescription>
                  {MODES[field.state.value.mode].text}
                </CardDescription>
                <CardAction>
                  <StockModeToggle
                    onChange={field.handleChange}
                    product={saved}
                    value={field.state.value}
                  />
                </CardAction>
              </CardHeader>
            )}
          </form.Field>
          <CardContent>
            <form.Subscribe
              selector={(state) =>
                [state.values.categoryId, state.submissionAttempts] as const
              }
            >
              {([categoryId, attempts]) => {
                const category =
                  categories.find(({ id }) => id === categoryId) ??
                  saved?.category;
                return category ? (
                  <form.Field name="stock">
                    {(field) => (
                      <ProductVariants
                        category={category}
                        key={saved?.version}
                        onChange={field.handleChange}
                        product={saved}
                        showErrors={attempts > 0}
                        value={field.state.value}
                      />
                    )}
                  </form.Field>
                ) : (
                  <p className="text-muted-foreground text-sm">
                    Pick a category first: it sets the attributes your variants
                    choose from.
                  </p>
                );
              }}
            </form.Subscribe>
          </CardContent>
        </Card>
      </div>

      <aside className="grid gap-6 lg:sticky lg:top-16">
        <form.Field name="status">
          {(field) => (
            <StatusCard
              onChange={field.handleChange}
              value={field.state.value}
            />
          )}
        </form.Field>

        <Card>
          <CardContent>
            <form.AppField
              listeners={{
                onChange: ({ value: categoryId }) => {
                  const savedIds = new Map(
                    stockDraftOf(saved).variants.map((row) => [
                      row.id,
                      row.attributeValueIds,
                    ]),
                  );
                  form.setFieldValue("stock", (stock) =>
                    withPicks(stock, (row) =>
                      categoryId === saved?.categoryId
                        ? (savedIds.get(row.id) ?? [])
                        : [],
                    ),
                  );
                },
              }}
              name="categoryId"
            >
              {(field) => {
                const selected = categories.find(
                  ({ id }) => id === field.state.value,
                );
                return (
                  <div className="grid gap-3">
                    <field.SelectField
                      description={categoryHint(saved, field.state.value)}
                      items={categories.map(({ id, name }) => ({
                        label: name,
                        value: id,
                      }))}
                      label="Category"
                      labelEnd={
                        <CategoryActions
                          category={selected}
                          onCategories={setCategories}
                          onSelect={field.handleChange}
                          onValues={(ids) =>
                            form.setFieldValue("stock", (stock) =>
                              withPicks(stock, (row) =>
                                row.attributeValueIds.filter((id) =>
                                  ids.has(id),
                                ),
                              ),
                            )
                          }
                          savedId={saved?.categoryId ?? ""}
                        />
                      }
                    />
                    {selected ? (
                      <CategoryAttributes category={selected} />
                    ) : null}
                  </div>
                );
              }}
            </form.AppField>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Collections</CardTitle>
            <CardDescription>Curated lists the store shows.</CardDescription>
            <CardAction>
              <CollectionDialog
                onSaved={(created) => {
                  setCollections((list) => [...list, created]);
                  form.setFieldValue("collectionIds", (ids) => [
                    ...ids,
                    created.id,
                  ]);
                }}
                trigger={
                  <Button size="xs" type="button" variant="ghost">
                    <PlusIcon data-icon="inline-start" />
                    New
                  </Button>
                }
              />
            </CardAction>
          </CardHeader>
          <CardContent>
            <form.Field name="collectionIds">
              {(field) => (
                <ProductCollections
                  collections={collections}
                  onChange={field.handleChange}
                  onCollection={(updated) =>
                    setCollections((list) =>
                      list.map((c) => (c.id === updated.id ? updated : c)),
                    )
                  }
                  onDeleted={(id) => {
                    setCollections((list) => list.filter((c) => c.id !== id));
                    setSaved(
                      (current) =>
                        current && {
                          ...current,
                          collectionIds: current.collectionIds.filter(
                            (other) => other !== id,
                          ),
                        },
                    );
                  }}
                  value={field.state.value}
                />
              )}
            </form.Field>
          </CardContent>
        </Card>

        <form.Subscribe selector={(state) => state.values}>
          {(values) => <Readiness product={saved} values={values} />}
        </form.Subscribe>

        {saved ? <DeleteProductCard product={saved} /> : null}
      </aside>

      {saved ? (
        <ReplaceStockDialog
          draft={draftStock(form.getFieldValue("stock"))}
          onConfirm={async () => {
            confirmed.current = true;
            setConfirming(false);
            await form.handleSubmit();
          }}
          onOpenChange={setConfirming}
          open={confirming}
          saved={savedStock(saved)}
        />
      ) : null}

      <form.Subscribe selector={(state) => state.isDefaultValue}>
        {(isDefault) =>
          saved && isDefault ? null : (
            <UnsavedBar
              creating={!saved}
              onDiscard={isDefault ? undefined : () => form.reset()}
            />
          )
        }
      </form.Subscribe>
    </form>
  );
}

type Status = ProductModel.productResult["status"];

function StatusCard({
  onChange,
  value,
}: {
  onChange: (status: Status) => void;
  value: Status;
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle id="status-label">Status</CardTitle>
      </CardHeader>
      <CardContent>
        <ToggleGroup
          aria-labelledby="status-label"
          className="w-full"
          onValueChange={([next]) => {
            const status = STATUSES.find((s) => s === next);
            if (status) {
              onChange(status);
            }
          }}
          orientation="vertical"
          spacing={1.5}
          value={[value]}
        >
          {STATUSES.map((status) => (
            <ToggleGroupItem
              className="data-pressed:ring-foreground ring-border h-auto flex-col items-start gap-0 rounded-lg! px-3 py-2 text-left whitespace-normal ring-1 data-pressed:bg-transparent data-pressed:ring-2"
              key={status}
              value={status}
            >
              <span className="font-medium">{label(status)}</span>
              <span className="text-muted-foreground text-xs font-normal">
                {STATUS_HINTS[status]}
              </span>
            </ToggleGroupItem>
          ))}
        </ToggleGroup>
      </CardContent>
    </Card>
  );
}

function DeleteProductCard({
  product,
}: {
  product: ProductModel.productResult;
}) {
  const navigate = useNavigate();
  return (
    <Card className="ring-destructive/25">
      <CardHeader>
        <CardTitle>Delete Product</CardTitle>
        <CardDescription>
          Its variants and images go with it. This cannot be undone.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <ConfirmDelete
          description="Its variants and images are deleted with it. This cannot be undone."
          kind="Product"
          name={product.name}
          onConfirm={async () => {
            const { error } = await api.products({ id: product.id }).delete();
            if (error) {
              const { value } = error;
              toast.error(value.detail ?? value.title);
              return;
            }
            toast.success("Product deleted.");
            await navigate({ to: "/products", replace: true });
          }}
          size="sm"
        />
      </CardContent>
    </Card>
  );
}

function UnsavedBar({
  creating,
  onDiscard,
}: {
  creating: boolean;
  onDiscard?: () => void;
}) {
  const text = creating ? "New product" : "Unsaved changes";
  return (
    <div
      aria-label={text}
      className="bg-foreground text-background fixed inset-x-0 bottom-6 z-20 mx-auto flex w-fit items-center gap-1 rounded-xl p-1.5 pl-4 shadow-lg"
      role="region"
    >
      <span className="mr-2 text-sm font-medium whitespace-nowrap">{text}</span>
      {onDiscard ? (
        <Button
          className={ON_DARK}
          onClick={onDiscard}
          size="sm"
          type="button"
          variant="ghost"
        >
          Discard
        </Button>
      ) : null}
      <SubmitButton
        className="bg-background text-foreground hover:bg-background/90"
        size="sm"
      >
        {creating ? "Create Product" : "Save"}
      </SubmitButton>
    </div>
  );
}

function ReplaceStockDialog({
  draft,
  onConfirm,
  onOpenChange,
  open,
  saved,
}: {
  draft: string;
  onConfirm: () => Promise<void>;
  onOpenChange: (open: boolean) => void;
  open: boolean;
  saved: string;
}) {
  return (
    <AlertDialog onOpenChange={onOpenChange} open={open}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Replace the stock?</AlertDialogTitle>
          <AlertDialogDescription>
            The current stock, {saved}, becomes {draft}. The change is refused
            while pending orders reserve the current stock; paid orders keep
            what they took.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Keep Editing</AlertDialogCancel>
          <AlertDialogAction onClick={onConfirm}>
            Replace Stock
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
