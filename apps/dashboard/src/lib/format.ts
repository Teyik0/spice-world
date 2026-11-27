import { STOCK_UNITS } from "@spice-world/server/modules/products/model";

const eur = new Intl.NumberFormat("fr-FR", {
  currency: "EUR",
  style: "currency",
});
export const formatPrice = (cents: number) => eur.format(cents / 100);

const relative = new Intl.RelativeTimeFormat("en", {
  numeric: "auto",
  style: "short",
});
const UNITS = [
  ["year", 31_536_000],
  ["month", 2_592_000],
  ["day", 86_400],
  ["hour", 3600],
] as const;

export const formatAgo = (date: Date | string) => {
  const seconds = (new Date(date).getTime() - Date.now()) / 1000;
  const [unit, size] = UNITS.find(([, s]) => Math.abs(seconds) >= s) ?? [
    "minute",
    60,
  ];
  return relative.format(Math.round(seconds / size), unit);
};

const count = new Intl.NumberFormat("en-US");
export const formatCount = (n: number) => count.format(n);

const amount = new Intl.NumberFormat("en-US", { maximumFractionDigits: 3 });
type Dimension = keyof typeof STOCK_UNITS;

export const unitsOf = (dimension: Dimension) =>
  Object.entries(STOCK_UNITS[dimension]) as [string, number][];

export const formatStock = (quantity: number, dimension: Dimension) => {
  const units = unitsOf(dimension);
  const [unit, ratio] = units.findLast(([, r]) => quantity >= r) ??
    units[0] ?? ["", 1];
  return dimension === "COUNT"
    ? count.format(quantity)
    : `${amount.format(quantity / ratio)} ${unit}`;
};
