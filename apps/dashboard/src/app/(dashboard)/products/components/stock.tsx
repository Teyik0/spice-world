import * as ProductModel from "@spice-world/server/modules/products/model";
import { Button } from "@spice-world/ui/components/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
  MENU_ITEM,
} from "@spice-world/ui/components/dropdown-menu";
import { Input } from "@spice-world/ui/components/input";
import type { UnwrapSchema } from "elysia";
import { t } from "elysia";
import { ChevronDownIcon } from "lucide-react";
import type { ComponentProps } from "react";
import { useState } from "react";

import { unitsOf } from "../../../../lib/format";

type Product = ProductModel.productResult;
type Update = NonNullable<ProductModel.variantOperations["update"]>[number];
type Mode = ProductModel.stockMode;

export const DIMENSIONS = ProductModel.stockDimension.anyOf.map((d) => d.const);

export const stockDraft = t.Object({
  mode: ProductModel.stockMode,
  dimension: ProductModel.stockDimension,
  quantity: ProductModel.stockAmount,
  lowStockAt: ProductModel.stockAmount,
  variants: t.Array(
    t.Object({
      id: t.Optional(t.String()),
      key: t.Optional(t.String()),
      deleted: t.Boolean(),
      attributeValueIds: t.Array(t.String()),
      price: ProductModel.variantCreate.properties.price,
      stockUsage: ProductModel.stockUsage,
      quantity: ProductModel.stockAmount,
      lowStockAt: ProductModel.stockAmount,
    }),
  ),
});
export type StockDraft = UnwrapSchema<typeof stockDraft>;
type Row = StockDraft["variants"][number];

export const stockDraftOf = (product: Product): StockDraft => {
  const pool = product.variants[0]?.inventory;
  const shared = product.stockMode === "SHARED" && pool;
  return {
    mode: product.stockMode,
    dimension: shared ? pool.dimension : "COUNT",
    quantity: shared ? pool.quantity : 0,
    lowStockAt: shared ? pool.lowStockAt : 0,
    variants: product.variants.map(
      ({ id, price, stockUsage, inventory, attributeValues }) => ({
        id,
        deleted: false,
        attributeValueIds: attributeValues.map((value) => value.id),
        price,
        stockUsage,
        quantity: inventory.quantity,
        lowStockAt: inventory.lowStockAt,
      }),
    ),
  };
};

export const needs = (row: Row, mode: Mode): Row =>
  mode === "SHARED"
    ? { ...row, stockUsage: Number.NaN }
    : { ...row, stockUsage: 1, quantity: Number.NaN, lowStockAt: 0 };

export const newRow = (mode: Mode): Row =>
  needs(
    {
      deleted: false,
      attributeValueIds: [],
      price: Number.NaN,
      stockUsage: 1,
      quantity: 0,
      lowStockAt: 0,
    },
    mode,
  );

export const switchMode = (
  product: Product,
  draft: StockDraft,
  mode: Mode,
): StockDraft => {
  const saved = stockDraftOf(product);
  const savedRows = new Map(saved.variants.map((row) => [row.id, row]));
  const back = mode === product.stockMode;
  return {
    ...draft,
    ...(back
      ? {
          dimension: saved.dimension,
          quantity: saved.quantity,
          lowStockAt: saved.lowStockAt,
        }
      : { quantity: mode === "SHARED" ? Number.NaN : 0, lowStockAt: 0 }),
    mode,
    variants: draft.variants.map((row) => {
      const was = row.id ? savedRows.get(row.id) : undefined;
      return back && was
        ? {
            ...row,
            stockUsage: was.stockUsage,
            quantity: was.quantity,
            lowStockAt: was.lowStockAt,
          }
        : needs(row, mode);
    }),
  };
};

const edit = (
  was: { lowStockAt: number; quantity: number },
  now: { lowStockAt: number; quantity: number },
) => {
  const adjust = now.quantity - was.quantity;
  const lowStockAt =
    now.lowStockAt === was.lowStockAt ? undefined : now.lowStockAt;
  return adjust || lowStockAt !== undefined
    ? {
        ...(adjust && { adjust }),
        ...(lowStockAt !== undefined && { lowStockAt }),
      }
    : undefined;
};

function stockUpdate(row: Row, was: Row, shared: boolean, changed: boolean) {
  if (shared) {
    return changed || row.stockUsage !== was.stockUsage
      ? { stockUsage: row.stockUsage }
      : {};
  }
  const inventory = changed
    ? { quantity: row.quantity, lowStockAt: row.lowStockAt }
    : edit(was, row);
  return inventory ? { inventory } : {};
}

export function variantOperations(product: Product, draft: StockDraft) {
  const saved = new Map(
    stockDraftOf(product).variants.map((row) => [row.id, row]),
  );
  const changed = draft.mode !== product.stockMode;
  const shared = draft.mode === "SHARED";
  const { dimension, quantity, lowStockAt } = draft;
  const inventory =
    shared &&
    (changed
      ? { dimension, quantity, lowStockAt }
      : edit(stockDraftOf(product), draft));
  const kept = draft.variants.filter((row) => row.id && !row.deleted);
  const update = kept.flatMap(({ id, ...row }): Update[] => {
    const was = saved.get(id) ?? { id, ...row };
    const fields = {
      ...(row.price === was.price ? {} : { price: row.price }),
      ...(row.attributeValueIds.toSorted().join() ===
      was.attributeValueIds.toSorted().join()
        ? {}
        : { attributeValueIds: row.attributeValueIds }),
      ...stockUpdate({ id, ...row }, was, shared, changed),
    };
    return id && Object.keys(fields).length ? [{ id, ...fields }] : [];
  });
  const create = draft.variants
    .filter((row) => !row.id)
    .map(({ attributeValueIds, price, stockUsage, ...row }) => ({
      attributeValueIds,
      price,
      ...(shared
        ? { stockUsage }
        : {
            inventory: { quantity: row.quantity, lowStockAt: row.lowStockAt },
          }),
    }));
  const remove = draft.variants.flatMap(({ id, deleted }) =>
    id && deleted ? [id] : [],
  );
  return {
    ...(changed && { stockMode: draft.mode }),
    ...(inventory && { inventory }),
    update,
    ...(create.length && { create }),
    ...(remove.length && { delete: remove }),
  };
}

export const mergeUpdates = (...lists: Update[][]) => {
  const byId = new Map<string, Update>();
  for (const update of lists.flat()) {
    byId.set(update.id, { ...byId.get(update.id), ...update });
  }
  return [...byId.values()];
};

const unitFor = (value: number, dimension: ProductModel.stockDimension) => {
  const units = unitsOf(dimension);
  const best =
    units.findLast(([, ratio]) => value >= ratio && value % ratio === 0) ??
    units[1] ??
    units[0];
  return best?.[0] ?? "";
};

const toBase = (value: number, ratio: number) => {
  const base = value * ratio;
  return Math.abs(base - Math.round(base)) < 1e-6 ? Math.round(base) : base;
};

export function StockInput({
  dimension,
  label,
  onChange,
  value,
  ...props
}: Omit<ComponentProps<typeof Input>, "onChange" | "value"> & {
  dimension: ProductModel.stockDimension;
  label: string;
  onChange: (value: number) => void;
  value: number;
}) {
  const units = unitsOf(dimension);
  const [unit, setUnit] = useState(() => unitFor(value, dimension));
  const ratio = units.find(([name]) => name === unit)?.[1] ?? 1;
  return (
    <div className="flex min-w-0">
      <Input
        aria-label={label}
        autoComplete="off"
        className={`text-right tabular-nums ${units.length > 1 ? "rounded-r-none" : ""}`}
        inputMode="decimal"
        min={0}
        onChange={(e) => onChange(toBase(e.target.valueAsNumber, ratio))}
        placeholder="0"
        step="any"
        type="number"
        value={Number.isNaN(value) ? "" : value / ratio}
        {...props}
      />
      {units.length > 1 ? (
        <DropdownMenu>
          <DropdownMenuTrigger
            render={
              <Button
                aria-label={`${label} unit`}
                className="text-muted-foreground min-w-12 shrink-0 justify-center gap-0.5 rounded-l-none border-l-0 px-1.5 text-sm font-normal"
                type="button"
                variant="outline"
              />
            }
          >
            {unit}
            <ChevronDownIcon className="size-3" />
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="min-w-20">
            <DropdownMenuRadioGroup
              onValueChange={(next: string) => setUnit(next)}
              value={unit}
            >
              {units.map(([name]) => (
                <DropdownMenuRadioItem
                  className={MENU_ITEM}
                  key={name}
                  value={name}
                >
                  {name}
                </DropdownMenuRadioItem>
              ))}
            </DropdownMenuRadioGroup>
          </DropdownMenuContent>
        </DropdownMenu>
      ) : null}
    </div>
  );
}
