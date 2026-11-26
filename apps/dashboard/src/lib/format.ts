// Prices are stored in cents.
const eur = new Intl.NumberFormat("fr-FR", {
  currency: "EUR",
  style: "currency",
});
export const formatPrice = (cents: number) => eur.format(cents / 100);
