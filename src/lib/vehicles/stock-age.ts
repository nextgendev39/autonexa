/**
 * Stock age: whole days since the car was purchased (or added, without a purchase date).
 * The bands match the "Days in stock" card on the vehicle page.
 */
export const STOCK_AGE_BANDS = [
  { key: "fresh", min: 0, max: 30 },
  { key: "mid", min: 31, max: 60 },
  { key: "aging", min: 61, max: 90 },
  { key: "old", min: 91, max: null },
] as const;

export type StockAgeBand = (typeof STOCK_AGE_BANDS)[number]["key"];

export const STOCK_AGE_KEYS = STOCK_AGE_BANDS.map((band) => band.key) as [
  StockAgeBand,
  ...StockAgeBand[],
];

const DAY = 86_400_000;

/**
 * PostgREST `or` filter for one band. Age is floor((now - since) / day), with `since` the
 * purchase date (midnight UTC) or, when there is none, the created timestamp.
 */
export function stockAgeFilter(key: StockAgeBand, now = Date.now()) {
  const band = STOCK_AGE_BANDS.find((b) => b.key === key)!;
  const latest = new Date(now - band.min * DAY);
  const earliest = band.max == null ? null : new Date(now - (band.max + 1) * DAY);
  const date = (value: Date) => value.toISOString().slice(0, 10);

  const purchased = [`purchase_date.lte.${date(latest)}`];
  const added = ["purchase_date.is.null", `created_at.lte."${latest.toISOString()}"`];
  if (earliest) {
    purchased.push(`purchase_date.gt.${date(earliest)}`);
    added.push(`created_at.gt."${earliest.toISOString()}"`);
  }
  return `and(${purchased.join(",")}),and(${added.join(",")})`;
}
