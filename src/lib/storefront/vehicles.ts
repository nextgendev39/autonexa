import "server-only";

import { vehiclePopularity } from "@/lib/server/privileged/storefront";
import {
  LISTING_DETAIL_COLUMNS,
  PAGE_SIZE,
  PUBLIC_VEHICLE_COLUMNS,
  toPublicVehicle,
  type ListingQuery,
  type PublicVehicle,
  type PublicVehicleRow,
} from "@/lib/storefront/public-vehicle";
import type { TenantClient } from "@/lib/server/privileged";

const PHOTO_TTL_SECONDS = 60 * 60;
/** Sold, delivered, archived and every stage before "ready" never reach the website. */
const LISTED_STATUSES = ["ready_for_sale", "reserved"];
const MAX_SCAN = 2000;

/* The query builders are generated per table and these filters work on any of them. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Builder = any;

/** Only cars this dealership listed, that exist, and aren't gone. Every public read starts here. */
const listed = (
  client: TenantClient,
  columns = PUBLIC_VEHICLE_COLUMNS,
  options?: { count?: "exact" },
): Builder =>
  client
    .from("vehicles")
    .select(columns, options)
    .eq("storefront_published" as never, true as never)
    .in("status", LISTED_STATUSES as never)
    .is("deleted_at", null);

async function photosFor(client: TenantClient, vehicleIds: string[], onlyPrimary: boolean) {
  const byVehicle = new Map<string, { id: string; url: string }[]>();
  if (vehicleIds.length === 0) return byVehicle;
  const { data } = await client
    .from("vehicle_photos")
    .select("id, vehicle_id, storage_path, is_primary, sort_order")
    .in("vehicle_id", vehicleIds)
    .order("is_primary", { ascending: false })
    .order("sort_order", { ascending: true });
  let rows = (data ?? []) as unknown as { id: string; vehicle_id: string; storage_path: string }[];
  if (onlyPrimary) {
    const seen = new Set<string>();
    rows = rows.filter((row) => !seen.has(row.vehicle_id) && Boolean(seen.add(row.vehicle_id)));
  }
  if (rows.length === 0) return byVehicle;
  // Paths come from rows read through this client, and 00075 stops rows naming another's file.
  const { data: signed } = await client.storage.from("vehicle-photos").createSignedUrls(
    rows.map((row) => row.storage_path),
    PHOTO_TTL_SECONDS,
  );
  rows.forEach((row, index) => {
    const url = signed?.[index]?.signedUrl;
    if (url)
      byVehicle.set(row.vehicle_id, [
        ...(byVehicle.get(row.vehicle_id) ?? []),
        { id: row.id, url },
      ]);
  });
  return byVehicle;
}

type ListingDetails = Pick<PublicVehicleRow, "storefront_description" | "storefront_features">;

/** Listing text for these cars. Empty, not an error, until migration 00085 is applied. */
async function detailsFor(client: TenantClient, vehicleIds: string[]) {
  const byVehicle = new Map<string, ListingDetails>();
  if (vehicleIds.length === 0) return byVehicle;
  const { data, error } = await listed(client, LISTING_DETAIL_COLUMNS).in("id", vehicleIds);
  if (error) return byVehicle;
  for (const row of (data ?? []) as (ListingDetails & { id: string })[]) byVehicle.set(row.id, row);
  return byVehicle;
}

async function withPhotos(client: TenantClient, rows: PublicVehicleRow[], onlyPrimary = true) {
  const ids = rows.map((row) => row.id);
  const [photos, details] = await Promise.all([
    photosFor(client, ids, onlyPrimary),
    detailsFor(client, ids),
  ]);
  return rows.map((row) =>
    toPublicVehicle({ ...row, ...details.get(row.id) }, photos.get(row.id) ?? []),
  );
}

/** Branches in a city, read through the dealership's own scope. */
async function branchIdsIn(client: TenantClient, city: string) {
  const { data } = await client.from("branches").select("id").ilike("city", city);
  return ((data ?? []) as unknown as { id: string }[]).map((row) => row.id);
}

/**
 * Returns the builder inside an object on purpose. A query builder is "thenable", so returning it
 * straight from an async function would run the query and hand back its rows instead.
 */
async function applyFilters(
  client: TenantClient,
  request: Builder,
  query: ListingQuery,
): Promise<{ request: Builder } | null> {
  // cleanTerm has removed everything that means anything in a filter expression.
  if (query.q) {
    const like = `%${query.q}%`;
    request = request.or(
      `make.ilike.${like},model.ilike.${like},variant.ilike.${like},custom_variant.ilike.${like},body_type.ilike.${like}`,
    );
  }
  if (query.make) request = request.ilike("make", query.make);
  if (query.model) request = request.ilike("model", query.model);
  if (query.body) request = request.eq("body_type", query.body);
  if (query.fuel) request = request.eq("fuel_type", query.fuel);
  if (query.transmission) request = request.eq("transmission", query.transmission);
  if (query.engine) request = request.eq("engine_size", query.engine);
  if (query.condition) request = request.eq("market_type", query.condition);
  if (query.availability) {
    request = request.eq(
      "status",
      query.availability === "available" ? "ready_for_sale" : "reserved",
    );
  }
  if (query.yearMin !== null) request = request.gte("year", query.yearMin);
  if (query.yearMax !== null) request = request.lte("year", query.yearMax);
  if (query.priceMin !== null) request = request.gte("current_selling_price", query.priceMin);
  if (query.priceMax !== null) request = request.lte("current_selling_price", query.priceMax);
  if (query.mileageMax !== null) request = request.lte("mileage", query.mileageMax);
  if (query.city) {
    const branches = await branchIdsIn(client, query.city);
    if (branches.length === 0) return null;
    request = request.in("branch_id", branches);
  }
  return { request };
}

const ordered = (request: Builder, sort: ListingQuery["sort"]): Builder =>
  sort === "price_asc"
    ? request.order("current_selling_price", { ascending: true, nullsFirst: false })
    : sort === "price_desc"
      ? request.order("current_selling_price", { ascending: false, nullsFirst: false })
      : sort === "year_desc"
        ? request.order("year", { ascending: false })
        : sort === "mileage_asc"
          ? request.order("mileage", { ascending: true })
          : request.order("created_at", { ascending: false });

const empty = { vehicles: [] as PublicVehicle[], total: 0, pages: 1 };

/** "Most popular" needs view counts the table doesn't hold, so it sorts the matching IDs here. */
async function listByPopularity(client: TenantClient, tenantId: string, query: ListingQuery) {
  const filtered = await applyFilters(client, listed(client, "id, created_at"), query);
  if (!filtered) return empty;
  const [{ data }, views] = await Promise.all([
    filtered.request.order("created_at", { ascending: false }).limit(MAX_SCAN),
    vehiclePopularity(tenantId),
  ]);
  const ids = ((data ?? []) as { id: string; created_at: string }[])
    .map((row, position) => ({ id: row.id, views: views.get(row.id) ?? 0, position }))
    .sort((a, b) => b.views - a.views || a.position - b.position)
    .map((row) => row.id);
  const from = (query.page - 1) * PAGE_SIZE;
  const pageIds = ids.slice(from, from + PAGE_SIZE);
  if (pageIds.length === 0)
    return { ...empty, total: ids.length, pages: Math.max(1, Math.ceil(ids.length / PAGE_SIZE)) };
  const { data: rows } = await listed(client).in("id", pageIds);
  const byId = new Map(((rows ?? []) as PublicVehicleRow[]).map((row) => [row.id, row]));
  const page = pageIds.flatMap((id) => byId.get(id) ?? []);
  return {
    vehicles: await withPhotos(client, page),
    total: ids.length,
    pages: Math.max(1, Math.ceil(ids.length / PAGE_SIZE)),
  };
}

export async function listPublicVehicles(
  client: TenantClient,
  query: ListingQuery,
  tenantId?: string,
) {
  if (query.sort === "popular" && tenantId) return listByPopularity(client, tenantId, query);
  const filtered = await applyFilters(
    client,
    listed(client, PUBLIC_VEHICLE_COLUMNS, { count: "exact" }),
    query,
  );
  if (!filtered) return empty;
  const from = (query.page - 1) * PAGE_SIZE;
  const { data, count, error } = await ordered(filtered.request, query.sort)
    .order("id")
    .range(from, from + PAGE_SIZE - 1);
  if (error) console.error("[storefront] listing failed", error.message);
  const rows = (data ?? []) as unknown as PublicVehicleRow[];
  return {
    vehicles: await withPhotos(client, rows),
    total: count ?? 0,
    pages: Math.max(1, Math.ceil((count ?? 0) / PAGE_SIZE)),
  };
}

export type Facet = { value: string; count: number };
export type ListingFacets = {
  makes: Facet[];
  /** Models under each make, for the model picker. */
  models: Record<string, Facet[]>;
  bodies: Facet[];
  fuels: Facet[];
  transmissions: Facet[];
  engines: Facet[];
  cities: Facet[];
  conditions: Facet[];
  total: number;
  priceRange: { min: number; max: number } | null;
  yearRange: { min: number; max: number } | null;
};

const counted = (values: (string | null | undefined)[]): Facet[] => {
  const counts = new Map<string, number>();
  for (const value of values) if (value) counts.set(value, (counts.get(value) ?? 0) + 1);
  return [...counts]
    .map(([value, count]) => ({ value, count }))
    .sort((a, b) => a.value.localeCompare(b.value));
};

/** Choices for the filters and the home page, with counts, from what's actually listed. */
export async function listingFacets(client: TenantClient): Promise<ListingFacets> {
  const { data } = await listed(
    client,
    "make, model, body_type, fuel_type, transmission, engine_size, market_type, year, current_selling_price, branches!vehicles_branch_id_fkey ( city )",
  ).limit(MAX_SCAN);
  const rows = (data ?? []) as {
    make: string;
    model: string;
    body_type: string | null;
    fuel_type: string | null;
    transmission: string | null;
    engine_size: string | null;
    market_type: string | null;
    year: number;
    current_selling_price: number | string | null;
    branches: { city: string | null } | null;
  }[];
  const models: Record<string, Facet[]> = {};
  for (const make of new Set(rows.map((row) => row.make))) {
    models[make] = counted(rows.filter((row) => row.make === make).map((row) => row.model));
  }
  const prices = rows.map((row) => Number(row.current_selling_price)).filter((n) => n > 0);
  const years = rows.map((row) => row.year);
  return {
    makes: counted(rows.map((row) => row.make)),
    models,
    bodies: counted(rows.map((row) => row.body_type)),
    fuels: counted(rows.map((row) => row.fuel_type)),
    transmissions: counted(rows.map((row) => row.transmission)),
    engines: counted(rows.map((row) => row.engine_size)),
    cities: counted(rows.map((row) => row.branches?.city)),
    conditions: counted(rows.map((row) => (row.market_type === "new" ? "new" : "used"))),
    total: rows.length,
    priceRange: prices.length ? { min: Math.min(...prices), max: Math.max(...prices) } : null,
    yearRange: years.length ? { min: Math.min(...years), max: Math.max(...years) } : null,
  };
}

/** One car by its stock number, with its internal ID kept apart: that stays on the server. */
export async function getPublicVehicle(
  client: TenantClient,
  stockNumber: string,
): Promise<{ id: string; vehicle: PublicVehicle } | null> {
  const { data } = await listed(client).eq("stock_number", stockNumber).maybeSingle();
  const row = data as unknown as PublicVehicleRow | null;
  if (!row) return null;
  const [vehicle] = await withPhotos(client, [row], false);
  return { id: row.id, vehicle };
}

/** Listed cars by stock number, in the order asked: featured cars, saved and recently viewed. */
export async function vehiclesByStockNumbers(client: TenantClient, stockNumbers: string[]) {
  const wanted = [...new Set(stockNumbers)].slice(0, 24);
  if (wanted.length === 0) return [];
  const { data } = await listed(client).in("stock_number", wanted);
  const vehicles = await withPhotos(client, (data ?? []) as PublicVehicleRow[]);
  const byStock = new Map(vehicles.map((vehicle) => [vehicle.stockNumber, vehicle]));
  return wanted.flatMap((stock) => byStock.get(stock) ?? []);
}

export const featuredVehicles = vehiclesByStockNumbers;

export async function latestVehicles(client: TenantClient, limit = 8, condition?: "new" | "used") {
  let request = listed(client);
  if (condition) request = request.eq("market_type", condition);
  const { data } = await request.order("created_at", { ascending: false }).limit(limit);
  return withPhotos(client, (data ?? []) as PublicVehicleRow[]);
}

/** Same make first, then same body type, nearest in price. Never the car itself. */
export async function similarVehicles(client: TenantClient, vehicle: PublicVehicle, limit = 4) {
  // Two plain equality reads rather than one "or" string, so no stored value is ever parsed as a filter.
  const [sameMake, sameBody] = await Promise.all([
    listed(client).eq("make", vehicle.make).neq("stock_number", vehicle.stockNumber).limit(24),
    vehicle.bodyType
      ? listed(client)
          .eq("body_type", vehicle.bodyType)
          .neq("stock_number", vehicle.stockNumber)
          .limit(24)
      : Promise.resolve({ data: [] }),
  ]);
  const rows = [
    ...new Map(
      [
        ...((sameMake.data ?? []) as PublicVehicleRow[]),
        ...((sameBody.data ?? []) as PublicVehicleRow[]),
      ].map((row) => [row.id, row]),
    ).values(),
  ];
  const price = vehicle.price ?? 0;
  const score = (row: PublicVehicleRow) => {
    const candidate = toPublicVehicle(row);
    const sameMakeScore = candidate.make === vehicle.make ? 0 : 1;
    const sameModel = candidate.model === vehicle.model ? 0 : 1;
    const gap =
      price && candidate.price ? Math.min(1, Math.abs(candidate.price - price) / price) : 1;
    return sameModel + sameMakeScore * 2 + gap;
  };
  const picked = rows.sort((a, b) => score(a) - score(b)).slice(0, limit);
  return withPhotos(client, picked);
}

export type Suggestion = {
  kind: "make" | "model" | "vehicle";
  label: string;
  make?: string;
  model?: string;
  stockNumber?: string;
};

/** As-you-type suggestions from listed cars only: makes, models, then individual cars. */
export async function searchSuggestions(client: TenantClient, term: string): Promise<Suggestion[]> {
  if (term.length < 1) return [];
  const like = `%${term}%`;
  const { data } = await listed(client, "stock_number, year, make, model, variant, custom_variant")
    .or(`make.ilike.${like},model.ilike.${like},variant.ilike.${like},custom_variant.ilike.${like}`)
    .order("created_at", { ascending: false })
    .limit(60);
  const rows = (data ?? []) as {
    stock_number: string;
    year: number;
    make: string;
    model: string;
    variant: string | null;
    custom_variant: string | null;
  }[];
  const needle = term.toLowerCase();
  const makes = [
    ...new Set(rows.map((row) => row.make).filter((make) => make.toLowerCase().includes(needle))),
  ];
  const models = [
    ...new Map(
      rows
        .filter((row) => row.model.toLowerCase().includes(needle))
        .map((row) => [`${row.make}|${row.model}`, row]),
    ).values(),
  ];
  return [
    ...makes.slice(0, 3).map((make) => ({ kind: "make" as const, label: make, make })),
    ...models.slice(0, 4).map((row) => ({
      kind: "model" as const,
      label: `${row.make} ${row.model}`,
      make: row.make,
      model: row.model,
    })),
    ...rows.slice(0, 4).map((row) => ({
      kind: "vehicle" as const,
      label: [row.year, row.make, row.model, row.variant ?? row.custom_variant]
        .filter(Boolean)
        .join(" "),
      stockNumber: row.stock_number,
    })),
  ];
}

export async function allListedStockNumbers(client: TenantClient) {
  const { data } = await listed(client, "stock_number, updated_at").limit(5000);
  return (data ?? []) as unknown as { stock_number: string; updated_at: string }[];
}
