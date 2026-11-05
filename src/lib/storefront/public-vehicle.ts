/**
 * Exactly what the public may know about a car. Nothing else leaves the server: the columns are named
 * one by one, and the result is rebuilt field by field, so a new column can't slip out by default.
 * Pure, so tests can check both lists.
 */
export const PUBLIC_VEHICLE_COLUMNS =
  "id, stock_number, year, make, model, variant, custom_variant, mileage, mileage_unit, market_type, condition, status, body_type, transmission, fuel_type, drive_type, engine_size, engine_cylinders, seats, doors, exterior_color, interior_color, origin_type, country_of_origin, quantity, current_selling_price, created_at, branches!vehicles_branch_id_fkey ( name, city, emirate, phone ), vehicle_pricing ( advertised_price, target_selling_price )";

/** Words that must never appear in what's read for the public, or in what's sent to it. */
export const NEVER_PUBLIC = [
  "minimum_selling_price",
  "minimumSellingPrice",
  "has_minimum_price",
  "total_acquisition_cost",
  "purchase_price",
  "profit",
  "cost",
  "notes",
  "vin",
  "chassis",
  "created_by",
  "updated_by",
  "maximum_discount",
];

export type PublicVehicleRow = {
  id: string;
  stock_number: string;
  year: number;
  make: string;
  model: string;
  variant: string | null;
  custom_variant: string | null;
  mileage: number | null;
  mileage_unit: "km" | "mi" | null;
  market_type: string | null;
  condition: string | null;
  status: string;
  body_type: string | null;
  transmission: string | null;
  fuel_type: string | null;
  drive_type: string | null;
  engine_size: string | null;
  engine_cylinders: number | null;
  seats: number | null;
  doors: number | null;
  exterior_color: string | null;
  interior_color: string | null;
  origin_type: string | null;
  country_of_origin: string | null;
  quantity: number | null;
  current_selling_price: number | string | null;
  created_at: string;
  branches: { name: string; city: string | null; emirate: string | null; phone: string | null } | null;
  vehicle_pricing:
    | { advertised_price: number | string | null; target_selling_price: number | string | null }
    | { advertised_price: number | string | null; target_selling_price: number | string | null }[]
    | null;
};

export type PublicVehicle = {
  stockNumber: string;
  title: string;
  year: number;
  make: string;
  model: string;
  variant: string | null;
  mileage: number | null;
  mileageUnit: "km" | "mi";
  marketType: "new" | "used";
  condition: string | null;
  available: boolean;
  bodyType: string | null;
  transmission: string | null;
  fuelType: string | null;
  driveType: string | null;
  engineSize: string | null;
  engineCylinders: number | null;
  seats: number | null;
  doors: number | null;
  exteriorColor: string | null;
  interiorColor: string | null;
  originType: string | null;
  countryOfOrigin: string | null;
  quantity: number;
  price: number | null;
  branch: { name: string; city: string | null; emirate: string | null; phone: string | null } | null;
  photos: { id: string; url: string }[];
};

/** Same order as public.vehicle_public_price(). Never the minimum. */
export function publicPrice(row: Pick<PublicVehicleRow, "current_selling_price" | "vehicle_pricing">) {
  const pricing = Array.isArray(row.vehicle_pricing) ? row.vehicle_pricing[0] : row.vehicle_pricing;
  return (
    [row.current_selling_price, pricing?.advertised_price, pricing?.target_selling_price]
      .map((value) => (value == null ? 0 : Number(value)))
      .find((value) => value > 0) ?? null
  );
}

export function toPublicVehicle(row: PublicVehicleRow, photos: { id: string; url: string }[] = []): PublicVehicle {
  const variant = row.variant ?? row.custom_variant;
  return {
    stockNumber: row.stock_number,
    title: [row.year, row.make, row.model, variant].filter(Boolean).join(" "),
    year: row.year,
    make: row.make,
    model: row.model,
    variant,
    mileage: row.mileage,
    mileageUnit: row.mileage_unit ?? "km",
    marketType: row.market_type === "new" ? "new" : "used",
    condition: row.condition,
    available: row.status === "ready_for_sale",
    bodyType: row.body_type,
    transmission: row.transmission,
    fuelType: row.fuel_type,
    driveType: row.drive_type,
    engineSize: row.engine_size,
    engineCylinders: row.engine_cylinders,
    seats: row.seats,
    doors: row.doors,
    exteriorColor: row.exterior_color,
    interiorColor: row.interior_color,
    originType: row.origin_type,
    countryOfOrigin: row.country_of_origin,
    quantity: row.quantity ?? 1,
    price: publicPrice(row),
    branch: row.branches
      ? { name: row.branches.name, city: row.branches.city, emirate: row.branches.emirate, phone: row.branches.phone }
      : null,
    photos,
  };
}

// ---------------------------------------------------------------------------
// Listing query, from the URL. Anything unexpected is dropped rather than passed along.
// ---------------------------------------------------------------------------

export const LISTING_SORTS = ["newest", "price_asc", "price_desc", "year_desc", "mileage_asc"] as const;
export type ListingSort = (typeof LISTING_SORTS)[number];
export const PAGE_SIZE = 12;

export type ListingQuery = {
  q: string;
  make: string | null;
  body: string | null;
  fuel: string | null;
  transmission: string | null;
  yearMin: number | null;
  yearMax: number | null;
  priceMin: number | null;
  priceMax: number | null;
  sort: ListingSort;
  page: number;
};

const first = (value: string | string[] | undefined) => (Array.isArray(value) ? value[0] : value);
const whole = (value: string | undefined, max: number) => {
  const n = Number(value);
  return value && Number.isInteger(n) && n >= 0 && n <= max ? n : null;
};
/** Letters, numbers, spaces and hyphens: nothing that means anything in a filter expression. */
export const cleanTerm = (value: string | undefined) =>
  (value ?? "").replace(/[^\p{L}\p{N} -]/gu, " ").replace(/\s+/g, " ").trim().slice(0, 60);

export function parseListingQuery(params: Record<string, string | string[] | undefined>): ListingQuery {
  const sort = first(params.sort) as ListingSort;
  return {
    q: cleanTerm(first(params.q)),
    make: cleanTerm(first(params.make)) || null,
    body: cleanTerm(first(params.body)) || null,
    fuel: cleanTerm(first(params.fuel)) || null,
    transmission: cleanTerm(first(params.transmission)) || null,
    yearMin: whole(first(params.yearMin), 2100),
    yearMax: whole(first(params.yearMax), 2100),
    priceMin: whole(first(params.priceMin), 1_000_000_000),
    priceMax: whole(first(params.priceMax), 1_000_000_000),
    sort: LISTING_SORTS.includes(sort) ? sort : "newest",
    page: Math.max(1, whole(first(params.page), 100_000) ?? 1),
  };
}
