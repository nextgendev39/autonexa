// Purchase and selling prices are stored per unit; totals multiply by the record's quantity.
export function quantityTotal(unitPrice: number | null | undefined, quantity: number | null | undefined) {
  if (unitPrice == null || !Number.isFinite(unitPrice)) return null;
  const units = quantity != null && Number.isInteger(quantity) && quantity > 0 ? quantity : 1;
  return Math.round(unitPrice * units * 100) / 100;
}

/** Number input values arrive as numbers, NaN, or strings (unregistered as numbers). */
export function toPrice(value: unknown): number | null {
  if (value == null || value === "") return null;
  const number = typeof value === "number" ? value : Number(value);
  return Number.isFinite(number) ? number : null;
}
