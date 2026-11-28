import * as ProductModel from "@spice-world/server/modules/products/model";
import { Button } from "@spice-world/ui/components/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
  MENU_ITEM,
  MENU_LABEL,
} from "@spice-world/ui/components/dropdown-menu";
import {
  Field,
  FieldDescription,
  FieldGroup,
  FieldLabel,
} from "@spice-world/ui/components/field";
import { Input } from "@spice-world/ui/components/input";
import {
  ToggleGroup,
  ToggleGroupItem,
} from "@spice-world/ui/components/toggle-group";
import { ChevronDownIcon, PlusIcon, Trash2Icon, Undo2Icon } from "lucide-react";
import type { ComponentProps } from "react";
import { useState } from "react";
import type { TSchema } from "typebox";
import { Value } from "typebox/value";

import { formatCount, formatStock } from "../../../../lib/format";
import { variantName } from "./product-quick-edit";
import { label } from "./products-query";
import type { StockDraft } from "./stock";
import {
  DIMENSIONS,
  needs,
  newRow,
  replacesStock,
  stockDraftOf,
  StockInput,
  switchDimension,
  switchMode,
} from "./stock";

type Product = ProductModel.productResult;
type Row = StockDraft["variants"][number];

export const MODES = {
  VARIANT: {
    title: "Per Variant",
    text: "Each variant counts its own units, like the sizes of a shirt.",
  },
  SHARED: {
    title: "Shared",
    text: "Every variant takes an amount from one stock, like sachets of a spice sold by weight.",
  },
} as const;

export const savedStock = (product: Product) => {
  const [first] = product.variants;
  if (product.stockMode === "SHARED" && first) {
    const { quantity, dimension } = first.inventory;
    return `one shared stock of ${formatStock(quantity, dimension)}`;
  }
  const units = product.variants.reduce(
    (sum, { inventory }) => sum + inventory.quantity,
    0,
  );
  return `${product.variants.length} stocks per variant (${formatCount(units)} units)`;
};

export const draftStock = (draft: StockDraft) => {
  const rows = draft.variants.filter((row) => !row.deleted);
  if (draft.mode === "SHARED") {
    return `one shared stock of ${formatStock(draft.quantity, draft.dimension)}, that its ${rows.length} variants draw from`;
  }
  const units = rows.reduce((sum, row) => sum + row.quantity, 0);
  return `${rows.length} stocks per variant (${formatCount(units)} units)`;
};

const availableOf = (quantity: number, stockUsage: number) => {
  const available = Math.floor(quantity / stockUsage);
  return Number.isFinite(available) ? formatCount(available) : "—";
};

const PRICE = ProductModel.variantCreate.properties.price;
const { stockAmount: AMOUNT, stockUsage: USAGE } = ProductModel;

const fits = (schema: TSchema, amounts: number[]) =>
  amounts.every((n) => Value.Check(schema, n));

const incomplete = (draft: StockDraft) => {
  const rows = draft.variants.filter((row) => !row.deleted);
  const stock =
    draft.mode === "SHARED"
      ? fits(AMOUNT, [draft.quantity, draft.lowStockAt]) &&
        fits(
          USAGE,
          rows.map((row) => row.stockUsage),
        )
      : fits(
          AMOUNT,
          rows.flatMap((row) => [row.quantity, row.lowStockAt]),
        );
  return !(
    stock &&
    fits(
      PRICE,
      rows.map((row) => row.price),
    )
  );
};

function PriceInput({
  onChange,
  value,
  ...props
}: Omit<ComponentProps<typeof Input>, "onChange" | "value"> & {
  onChange: (cents: number) => void;
  value: number;
}) {
  return (
    <Input
      autoComplete="off"
      className="text-right tabular-nums"
      inputMode="decimal"
      min={0}
      onChange={(e) => onChange(Math.round(e.target.valueAsNumber * 100))}
      placeholder="0.00"
      step={0.01}
      type="number"
      value={Number.isNaN(value) ? "" : value / 100}
      {...props}
    />
  );
}

function AttributePicker({
  attributes,
  invalid,
  name,
  onChange,
  path,
  taken,
  value,
}: {
  attributes: Product["category"]["attributes"];
  invalid: boolean;
  name: string;
  onChange: (ids: string[]) => void;
  path: string;
  taken: string[][];
  value: string[];
}) {
  const open = (attributeId: string, id: string) => {
    const picks = attributes.map((attribute) =>
      attribute.id === attributeId
        ? id
        : attribute.values.find((v) => value.includes(v.id))?.id,
    );
    const free = attributes.reduce(
      (n, { values }, i) => (picks[i] ? n : n * values.length),
      1,
    );
    const clashes = taken.filter((ids) =>
      picks.every((pick) => !pick || ids.includes(pick)),
    ).length;
    return clashes < free;
  };
  if (!attributes.length) {
    return null;
  }
  return (
    <div className="flex min-w-0 flex-wrap gap-1.5" id={path}>
      {attributes.map((attribute) => {
        const ids = new Set(attribute.values.map(({ id }) => id));
        const selected = attribute.values.find(({ id }) => value.includes(id));
        return (
          <DropdownMenu key={attribute.id}>
            <DropdownMenuTrigger
              render={
                <Button
                  aria-invalid={invalid && !selected}
                  aria-label={`${name} ${attribute.name}`}
                  className="min-w-0 font-normal"
                  size="sm"
                  type="button"
                  variant="outline"
                />
              }
            >
              <span className={selected ? "truncate" : "text-muted-foreground"}>
                {selected?.value ?? label(attribute.name)}
              </span>
              <ChevronDownIcon className="text-muted-foreground" />
            </DropdownMenuTrigger>
            <DropdownMenuContent className="max-h-80">
              <DropdownMenuGroup>
                <DropdownMenuLabel className={MENU_LABEL}>
                  {label(attribute.name)}
                </DropdownMenuLabel>
                <DropdownMenuRadioGroup
                  onValueChange={(id: string) =>
                    onChange([...value.filter((v) => !ids.has(v)), id])
                  }
                  value={selected?.id ?? ""}
                >
                  {attribute.values
                    .filter(
                      ({ id }) => id === selected?.id || open(attribute.id, id),
                    )
                    .map(({ id, value: text }) => (
                      <DropdownMenuRadioItem
                        className={MENU_ITEM}
                        key={id}
                        value={id}
                      >
                        {text}
                      </DropdownMenuRadioItem>
                    ))}
                </DropdownMenuRadioGroup>
              </DropdownMenuGroup>
            </DropdownMenuContent>
          </DropdownMenu>
        );
      })}
    </div>
  );
}

function StockCells({
  dimension,
  invalid,
  name,
  onChange,
  path,
  quantity,
  row,
  shared,
  unitKey,
}: {
  dimension: ProductModel.stockDimension;
  invalid: (n: number, schema?: TSchema) => boolean;
  name: string;
  onChange: (patch: Partial<Row>) => void;
  path: string;
  quantity: number;
  row: Row;
  shared: boolean;
  unitKey: string;
}) {
  if (row.deleted) {
    return (
      <>
        <span className="text-muted-foreground text-sm">—</span>
        <span className="text-muted-foreground text-sm">—</span>
      </>
    );
  }
  if (shared) {
    return (
      <>
        <StockInput
          aria-invalid={invalid(row.stockUsage, USAGE)}
          dimension={dimension}
          id={`${path}.stockUsage`}
          key={unitKey}
          label={`${name} per sale`}
          onChange={(stockUsage) => onChange({ stockUsage })}
          value={row.stockUsage}
        />
        <span className="text-muted-foreground text-right text-sm tabular-nums">
          {availableOf(quantity, row.stockUsage)}
        </span>
      </>
    );
  }
  return (["quantity", "lowStockAt"] as const).map((key) => (
    <StockInput
      aria-invalid={invalid(row[key])}
      dimension="COUNT"
      id={`${path}.${key}`}
      key={`${unitKey}:${key}`}
      label={`${name} ${key === "quantity" ? "in stock" : "low stock at"}`}
      onChange={(n) => onChange({ [key]: n })}
      value={row[key]}
    />
  ));
}

function VariantRow({
  attributes,
  cols,
  dimension,
  index,
  invalid,
  onChange,
  onToggle,
  pick,
  quantity,
  row,
  saved,
  shared,
  showErrors,
  taken,
  unitKey,
}: {
  attributes: Product["category"]["attributes"];
  cols: string;
  dimension: ProductModel.stockDimension;
  index: number;
  invalid: (n: number, schema?: TSchema) => boolean;
  onChange: (patch: Partial<Row>) => void;
  onToggle: () => void;
  pick: boolean;
  quantity: number;
  row: Row;
  saved?: Product["variants"][number];
  shared: boolean;
  showErrors: boolean;
  taken: string[][];
  unitKey: string;
}) {
  const name = saved ? variantName(saved) : `New variant ${index + 1}`;
  const path = `stock.variants[${index}]`;
  const { deleted } = row;
  return (
    <div
      className={`${cols} ${deleted ? "opacity-50" : ""} ${saved ? "" : "bg-muted/60 -mx-2 rounded-lg px-2 py-2"}`}
    >
      {pick ? (
        <div className="grid min-w-0 gap-1">
          <span className="text-muted-foreground truncate text-xs">
            {saved ? `Was ${name}` : "New variant"}
          </span>
          <AttributePicker
            attributes={attributes}
            invalid={showErrors}
            name={name}
            onChange={(attributeValueIds) => onChange({ attributeValueIds })}
            path={`${path}.attributeValueIds`}
            taken={taken}
            value={row.attributeValueIds}
          />
        </div>
      ) : (
        <span className="min-w-0 truncate text-sm">
          <span className={deleted ? "line-through" : undefined}>{name}</span>
          {deleted ? (
            <span className="text-destructive ml-2 text-xs">
              Deleted on save
            </span>
          ) : null}
        </span>
      )}
      <PriceInput
        aria-invalid={invalid(row.price, PRICE)}
        aria-label={`${name} price`}
        disabled={deleted}
        id={`${path}.price`}
        onChange={(price) => onChange({ price })}
        value={row.price}
      />
      <StockCells
        dimension={dimension}
        invalid={invalid}
        name={name}
        onChange={onChange}
        path={path}
        quantity={quantity}
        row={row}
        shared={shared}
        unitKey={unitKey}
      />
      <Button
        aria-label={deleted ? `Keep ${name}` : `Delete ${name}`}
        onClick={onToggle}
        size="icon-sm"
        title={deleted ? "Keep" : "Delete"}
        type="button"
        variant="ghost"
      >
        {deleted ? <Undo2Icon /> : <Trash2Icon />}
      </Button>
    </div>
  );
}

const attributesInUse = (category: Product["category"], product?: Product) => {
  const changed = product !== undefined && category.id !== product.categoryId;
  const used = new Set(
    changed
      ? []
      : product?.variants.flatMap(({ attributeValues }) =>
          attributeValues.map(({ attributeId }) => attributeId),
        ),
  );
  return {
    pickable: used.size
      ? category.attributes.filter(({ id }) => used.has(id))
      : category.attributes,
    repick: changed || (!used.size && category.attributes.length > 0),
  };
};

type Attribute = Product["category"]["attributes"][number];

const LIST = new Intl.ListFormat("en");

const names = (attributes: Attribute[]) =>
  LIST.format(attributes.map(({ name }) => name));

const hasValueOf = (row: Row) => (attribute: Attribute) =>
  attribute.values.some(({ id }) => row.attributeValueIds.includes(id));

const initialShape = (attributes: Attribute[], rows: Row[], bare: boolean) => {
  const picked = attributes.filter((attribute) =>
    rows.some((row) => hasValueOf(row)(attribute)),
  );
  return (picked.length || bare ? picked : attributes).map(({ id }) => id);
};

function VariantAttributes({
  attributes,
  onChange,
  relabels,
  shape,
}: {
  attributes: Attribute[];
  onChange: (ids: string[]) => void;
  relabels: boolean;
  shape: Attribute[];
}) {
  if (!attributes.length) {
    return null;
  }
  return (
    <Field>
      <FieldLabel id="variant-attributes">Vary By</FieldLabel>
      <ToggleGroup
        aria-labelledby="variant-attributes"
        className="flex-wrap"
        multiple
        onValueChange={onChange}
        size="sm"
        spacing={1.5}
        value={shape.map(({ id }) => id)}
        variant="outline"
      >
        {attributes.map(({ id, name }) => (
          <ToggleGroupItem
            className="data-pressed:border-primary data-pressed:bg-primary data-pressed:text-primary-foreground"
            key={id}
            value={id}
          >
            {label(name)}
          </ToggleGroupItem>
        ))}
      </ToggleGroup>
      <FieldDescription>
        {relabels
          ? "Saving renames the existing variants. Paid orders keep the name they were sold under; a variant in a pending checkout keeps its values until the order is paid or cancelled."
          : "Every variant takes one value for each attribute picked here, so customers choose them the same way."}
      </FieldDescription>
    </Field>
  );
}

const fullText = (
  category: Product["category"],
  shape: Attribute[],
  rows: number,
) => {
  if (!category.attributes.length) {
    return `${label(category.name)} has no attributes: its products have a single variant.`;
  }
  if (shape.length) {
    return `Every combination of ${names(shape)} has its variant.`;
  }
  return rows > 1 ? null : "Pick what the variants vary by to add more.";
};

function useVariantShape(
  category: Product["category"],
  onChange: (value: StockDraft) => void,
  value: StockDraft,
  product?: Product,
) {
  const { attributes } = category;
  const active = value.variants.filter((row) => !row.deleted);
  const { pickable, repick } = attributesInUse(category, product);
  const [chosen, setChosen] = useState(() =>
    initialShape(
      attributes,
      active,
      product !== undefined && category.id === product.categoryId,
    ),
  );
  const shape = attributes.filter(({ id }) => chosen.includes(id));
  const reshaped =
    repick ||
    shape.length !== pickable.length ||
    shape.some((attribute) => !pickable.includes(attribute)) ||
    active.some((row) => row.id && !shape.every(hasValueOf(row)));
  const varyBy = (ids: string[]) => {
    setChosen(ids);
    const saved = new Map(
      product?.variants.map(({ id, attributeValues }) => [
        id,
        attributeValues.map(({ id: valueId }) => valueId),
      ]),
    );
    onChange({
      ...value,
      variants: value.variants.map((row) =>
        row.deleted
          ? row
          : {
              ...row,
              attributeValueIds: attributes
                .filter(({ id }) => ids.includes(id))
                .flatMap(({ values }) => {
                  const own =
                    values.find(({ id }) =>
                      row.attributeValueIds.includes(id),
                    ) ??
                    values.find(({ id }) =>
                      saved.get(row.id ?? "")?.includes(id),
                    );
                  return own ? [own.id] : [];
                }),
            },
      ),
    });
  };
  const unpicked = active.filter(
    (row) => (!row.id || reshaped) && !shape.every(hasValueOf(row)),
  ).length;
  const duplicates =
    active.length -
    new Set(
      active.map(({ attributeValueIds }) =>
        attributeValueIds.toSorted().join(),
      ),
    ).size;
  return {
    duplicates,
    relabels: product !== undefined && reshaped,
    repick: reshaped,
    shape,
    unpicked,
    varyBy,
  };
}

const missingText = (
  count: number,
  duplicates: number,
  rows: number,
  shape: Attribute[],
) => {
  if (!shape.length) {
    return rows > 1
      ? "Pick what the variants vary by, or keep a single variant: without an attribute they cannot be told apart."
      : null;
  }
  if (count) {
    return `Pick ${names(shape)} for ${count === 1 ? "1 variant" : `${count} variants`}: every variant varies by the same attributes.`;
  }
  return duplicates
    ? `${duplicates === 1 ? "1 variant has" : `${duplicates} variants have`} the same values as another: change a value or delete one.`
    : null;
};

function MissingValues({
  count,
  duplicates,
  rows,
  shape,
  showErrors,
}: {
  count: number;
  duplicates: number;
  rows: number;
  shape: Attribute[];
  showErrors: boolean;
}) {
  const text = missingText(count, duplicates, rows, shape);
  return (
    <p
      aria-live="polite"
      className={`text-sm text-pretty empty:hidden ${showErrors ? "text-destructive" : "text-warning"}`}
    >
      {text || null}
    </p>
  );
}

export function StockModeToggle({
  onChange,
  product,
  value,
}: {
  onChange: (value: StockDraft) => void;
  product?: Product;
  value: StockDraft;
}) {
  return (
    <ToggleGroup
      aria-label="Stock tracking"
      className="bg-muted rounded-lg p-0.5"
      onValueChange={([next]) => {
        if (next === "VARIANT" || next === "SHARED") {
          onChange(switchMode(product, value, next));
        }
      }}
      size="sm"
      spacing={0}
      value={[value.mode]}
    >
      {(["VARIANT", "SHARED"] as const).map((mode) => (
        <ToggleGroupItem
          className="data-pressed:bg-background text-muted-foreground data-pressed:text-foreground rounded-md! px-3 data-pressed:shadow-sm"
          key={mode}
          value={mode}
        >
          {MODES[mode].title}
        </ToggleGroupItem>
      ))}
    </ToggleGroup>
  );
}

function SharedStock({
  invalid,
  onChange,
  product,
  value,
}: {
  product?: Product;
  invalid: (n: number) => boolean;
  onChange: (value: StockDraft) => void;
  value: StockDraft;
}) {
  const unitKey = `${value.mode}:${value.dimension}`;
  return (
    <div className="grid gap-4 sm:grid-cols-3">
      <Field>
        <FieldLabel htmlFor="stock.dimension">Counted By</FieldLabel>
        <DropdownMenu>
          <DropdownMenuTrigger
            render={
              <Button
                className="w-full justify-between font-normal"
                id="stock.dimension"
                type="button"
                variant="outline"
              />
            }
          >
            {label(value.dimension)}
            <ChevronDownIcon className="text-muted-foreground" />
          </DropdownMenuTrigger>
          <DropdownMenuContent>
            <DropdownMenuGroup>
              <DropdownMenuLabel className={MENU_LABEL}>
                Counted By
              </DropdownMenuLabel>
              <DropdownMenuRadioGroup
                onValueChange={(next: string) => {
                  const dimension = DIMENSIONS.find((d) => d === next);
                  if (dimension && dimension !== value.dimension) {
                    onChange(switchDimension(product, value, dimension));
                  }
                }}
                value={value.dimension}
              >
                {DIMENSIONS.map((dimension) => (
                  <DropdownMenuRadioItem
                    className={MENU_ITEM}
                    key={dimension}
                    value={dimension}
                  >
                    {label(dimension)}
                  </DropdownMenuRadioItem>
                ))}
              </DropdownMenuRadioGroup>
            </DropdownMenuGroup>
          </DropdownMenuContent>
        </DropdownMenu>
      </Field>
      <Field>
        <FieldLabel htmlFor="stock.quantity">In Stock</FieldLabel>
        <StockInput
          aria-invalid={invalid(value.quantity)}
          dimension={value.dimension}
          id="stock.quantity"
          key={unitKey}
          label="In stock"
          onChange={(quantity) => onChange({ ...value, quantity })}
          value={value.quantity}
        />
      </Field>
      <Field>
        <FieldLabel htmlFor="stock.lowStockAt">Low Stock At</FieldLabel>
        <StockInput
          aria-invalid={invalid(value.lowStockAt)}
          dimension={value.dimension}
          id="stock.lowStockAt"
          key={unitKey}
          label="Low stock at"
          onChange={(lowStockAt) => onChange({ ...value, lowStockAt })}
          value={value.lowStockAt}
        />
      </Field>
    </div>
  );
}

export function ProductVariants({
  category,
  onChange,
  product,
  showErrors,
  value,
}: {
  category: Product["category"];
  onChange: (value: StockDraft) => void;
  product?: Product;
  showErrors: boolean;
  value: StockDraft;
}) {
  const shared = value.mode === "SHARED";
  const replaced = replacesStock(product, value);
  const byId = new Map(
    product?.variants.map((variant) => [variant.id, variant]),
  );
  const { attributes } = category;
  const categoryChanged =
    product !== undefined && category.id !== product.categoryId;
  const unitKey = `${value.mode}:${value.dimension}`;
  const invalid = (n: number, schema: TSchema = AMOUNT) =>
    showErrors && !Value.Check(schema, n);
  const setRow = (index: number, patch: Partial<Row>) =>
    onChange({
      ...value,
      variants: value.variants.map((row, i) =>
        i === index ? { ...row, ...patch } : row,
      ),
    });
  const savedRows = new Map(
    stockDraftOf(product).variants.map((row) => [row.id, row]),
  );

  const toggleRow = (index: number) => {
    const row = value.variants[index];
    const was = row?.id ? savedRows.get(row.id) : undefined;
    if (!(row && was)) {
      onChange({
        ...value,
        variants: value.variants.filter((_, i) => i !== index),
      });
      return;
    }

    const { attributeValueIds } = row;
    setRow(
      index,
      row.deleted
        ? {
            ...(replaced ? needs(was, value.mode) : was),
            attributeValueIds,
            deleted: false,
          }
        : { ...was, attributeValueIds, deleted: true },
    );
  };
  const active = value.variants.filter((row) => !row.deleted);
  const { duplicates, relabels, repick, shape, unpicked, varyBy } =
    useVariantShape(category, onChange, value, product);

  const full =
    active.length >= shape.reduce((n, { values }) => n * values.length, 1);
  const cols =
    "grid grid-cols-[minmax(10rem,1fr)_7rem_9rem_9rem_2rem] items-center gap-x-4 gap-y-2";

  return (
    <FieldGroup>
      {product && replaced ? (
        <p
          aria-live="polite"
          className="bg-warning/10 text-warning rounded-lg px-3 py-2 text-sm text-pretty"
        >
          Saving replaces {savedStock(product)} with the amounts below. It is
          refused while pending orders reserve the current stock.
        </p>
      ) : null}

      {shared ? (
        <SharedStock
          invalid={invalid}
          onChange={onChange}
          product={product}
          value={value}
        />
      ) : null}

      <VariantAttributes
        attributes={attributes}
        onChange={varyBy}
        relabels={relabels}
        shape={shape}
      />

      <div className="-mx-1 overflow-x-auto px-1">
        <div
          aria-label="Variants"
          className="grid min-w-[40rem] gap-2"
          role="group"
        >
          <div className={`${cols} text-muted-foreground text-xs`}>
            <span>Variant</span>
            <span>Price (€)</span>
            <span>{shared ? "Per Sale" : "In Stock"}</span>
            <span className={shared ? "text-right" : undefined}>
              {shared ? "Available" : "Low Stock At"}
            </span>
            <span className="sr-only">Actions</span>
          </div>
          {value.variants.map((row, i) => (
            <VariantRow
              attributes={shape}
              cols={cols}
              dimension={value.dimension}
              index={i}
              invalid={invalid}
              key={row.id ?? row.key}
              onChange={(patch) => setRow(i, patch)}
              onToggle={() => toggleRow(i)}
              pick={!row.id || (repick && !row.deleted)}
              quantity={value.quantity}
              row={row}
              saved={row.id ? byId.get(row.id) : undefined}
              shared={shared}
              showErrors={showErrors}
              taken={active
                .filter((other) => other !== row)
                .map(({ attributeValueIds }) => attributeValueIds)}
              unitKey={unitKey}
            />
          ))}
        </div>
      </div>
      <MissingValues
        count={unpicked}
        duplicates={duplicates}
        rows={active.length}
        shape={shape}
        showErrors={showErrors}
      />
      {showErrors && incomplete(value) ? (
        <p className="text-destructive text-sm" role="alert">
          Fill in the highlighted fields to save: every variant needs a price
          and its stock{shared ? " per sale (at least 1)" : ""}, in whole base
          units (pieces, mg, ml, mm, mm²), none negative.
        </p>
      ) : null}
      <div className="flex flex-wrap items-center gap-3">
        {full ? (
          <span className="text-muted-foreground text-sm">
            {fullText(category, shape, active.length)}
          </span>
        ) : (
          <Button
            onClick={() =>
              onChange({
                ...value,
                variants: [
                  ...value.variants,
                  { ...newRow(value.mode), key: crypto.randomUUID() },
                ],
              })
            }
            size="sm"
            type="button"
            variant="outline"
          >
            <PlusIcon data-icon="inline-start" />
            Add Variant
          </Button>
        )}
        {categoryChanged ? (
          <span className="text-muted-foreground text-sm">
            Each variant needs a distinct combination of values from{" "}
            {category.name}.
          </span>
        ) : null}
      </div>
    </FieldGroup>
  );
}
