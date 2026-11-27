import type * as ProductModel from "@spice-world/server/modules/products/model";
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

import { formatCount, formatStock } from "../../../../lib/format";
import { variantName } from "./product-quick-edit";
import { label } from "./products-query";
import type { StockDraft } from "./stock";
import {
  DIMENSIONS,
  needs,
  newRow,
  stockDraftOf,
  StockInput,
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

const SELECT =
  "border-input bg-background text-foreground focus-visible:border-ring focus-visible:ring-ring/50 aria-invalid:border-destructive h-8 min-w-0 rounded-lg border px-2 text-sm outline-none focus-visible:ring-3";

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

const incomplete = (draft: StockDraft) => {
  const shared = draft.mode === "SHARED";
  const rows = draft.variants.filter((row) => !row.deleted);
  const amounts = [
    ...(shared ? [draft.quantity, draft.lowStockAt] : []),
    ...rows.flatMap((row) =>
      shared
        ? [row.price, row.stockUsage]
        : [row.price, row.quantity, row.lowStockAt],
    ),
  ];
  return amounts.some((n) => !Number.isInteger(n));
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
    return <span className="text-muted-foreground text-sm">New variant</span>;
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
  invalid: (n: number) => boolean;
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
        aria-invalid={invalid(row.price)}
        aria-label={`${name} price`}
        disabled={deleted}
        id={`${path}.price`}
        onChange={(price) => onChange({ price })}
        value={row.price}
      />
      {deleted ? (
        <>
          <span className="text-muted-foreground text-sm">—</span>
          <span className="text-muted-foreground text-sm">—</span>
        </>
      ) : null}
      {!deleted && shared ? (
        <>
          <StockInput
            aria-invalid={invalid(row.stockUsage)}
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
      ) : null}
      {deleted || shared
        ? null
        : (["quantity", "lowStockAt"] as const).map((key) => (
            <StockInput
              aria-invalid={invalid(row[key])}
              dimension="COUNT"
              id={`${path}.${key}`}
              key={`${unitKey}:${key}`}
              label={`${name} ${key === "quantity" ? "in stock" : "low stock at"}`}
              onChange={(n) => onChange({ [key]: n })}
              value={row[key]}
            />
          ))}
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

export function StockModeToggle({
  onChange,
  product,
  value,
}: {
  onChange: (value: StockDraft) => void;
  product: Product;
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

export function ProductVariants({
  category,
  onChange,
  product,
  showErrors,
  value,
}: {
  category: Product["category"];
  onChange: (value: StockDraft) => void;
  product: Product;
  showErrors: boolean;
  value: StockDraft;
}) {
  const shared = value.mode === "SHARED";
  const modeChanged = value.mode !== product.stockMode;
  const byId = new Map(
    product.variants.map((variant) => [variant.id, variant]),
  );
  const { attributes } = category;
  const categoryChanged = category.id !== product.categoryId;
  const unitKey = `${value.mode}:${value.dimension}`;
  const invalid = (n: number) => showErrors && !Number.isInteger(n);
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
            ...(modeChanged ? needs(was, value.mode) : was),
            attributeValueIds,
            deleted: false,
          }
        : { ...was, attributeValueIds, deleted: true },
    );
  };
  const active = value.variants.filter((row) => !row.deleted);
  const complete = active.filter(({ attributeValueIds: ids }) =>
    attributes.every(({ values }) => values.some(({ id }) => ids.includes(id))),
  );

  const full =
    active.length >= attributes.reduce((n, { values }) => n * values.length, 1);
  const cols =
    "grid grid-cols-[minmax(10rem,1fr)_7rem_9rem_9rem_2rem] items-center gap-x-4 gap-y-2";

  return (
    <FieldGroup>
      {modeChanged ? (
        <p
          aria-live="polite"
          className="bg-warning/10 text-warning rounded-lg px-3 py-2 text-sm text-pretty"
        >
          Saving replaces {savedStock(product)} with the amounts below. It is
          refused while pending orders reserve the current stock.
        </p>
      ) : null}

      {shared ? (
        <div className="grid gap-4 sm:grid-cols-3">
          <Field>
            <FieldLabel htmlFor="stock.dimension">Counted By</FieldLabel>
            {modeChanged ? (
              <select
                className={SELECT}
                defaultValue={value.dimension}
                id="stock.dimension"
                key={value.dimension}
                onChange={(e) => {
                  const dimension = DIMENSIONS.find(
                    (d) => d === e.target.value,
                  );
                  if (dimension) {
                    onChange({
                      ...value,
                      dimension,
                      quantity: Number.NaN,
                      lowStockAt: 0,
                      variants: value.variants.map((row) =>
                        row.deleted ? row : { ...row, stockUsage: Number.NaN },
                      ),
                    });
                  }
                }}
              >
                {DIMENSIONS.map((dimension) => (
                  <option key={dimension} value={dimension}>
                    {label(dimension)}
                  </option>
                ))}
              </select>
            ) : (
              <p className="text-sm leading-8" id="stock.dimension">
                {label(value.dimension)}
              </p>
            )}
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
      ) : null}

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
              attributes={attributes}
              cols={cols}
              dimension={value.dimension}
              index={i}
              invalid={invalid}
              key={row.id ?? row.key}
              onChange={(patch) => setRow(i, patch)}
              onToggle={() => toggleRow(i)}
              pick={!row.id || (categoryChanged && !row.deleted)}
              quantity={value.quantity}
              row={row}
              saved={row.id ? byId.get(row.id) : undefined}
              shared={shared}
              showErrors={showErrors}
              taken={complete
                .filter((other) => other !== row)
                .map(({ attributeValueIds }) => attributeValueIds)}
              unitKey={unitKey}
            />
          ))}
        </div>
      </div>
      {showErrors && incomplete(value) ? (
        <p className="text-destructive text-sm" role="alert">
          Fill in the highlighted fields to save: every variant needs a price
          and its stock{shared ? " per sale" : ""}, in whole base units (pieces,
          mg, ml, mm, mm²).
        </p>
      ) : null}
      <div className="flex flex-wrap items-center gap-3">
        {full ? (
          <span className="text-muted-foreground text-sm">
            {attributes.length
              ? `Every combination of ${category.name} values has its variant.`
              : `${label(category.name)} has no attributes: its products have a single variant.`}
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
