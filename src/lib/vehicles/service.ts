import { checkPlanLimit, planLimitFromError } from "@/lib/platform/limits";
import { currentTenantClient } from "@/lib/server/privileged";
import { createClient } from "@/lib/supabase/server";
import { decodeVehicleRef, isUuid } from "@/lib/vehicles/routes";
import { recordForUnits, undoVehicleSplit } from "@/lib/vehicles/units";
import { alertVehicleEvent } from "@/lib/vehicles/alerts";
import { maxDiscountPercentFrom } from "@/lib/validation/pricing";
import { getVehicleBooking } from "@/lib/bookings/service";
import { hasPermission } from "@/lib/permissions";
import { assertCatalogSelection } from "@/lib/vehicles/catalog";
import { isSoldStatus, isValidVehicleStatusTransition } from "@/lib/vehicles/status-transitions";
import { getPrimaryPhotoUrls } from "@/lib/vehicles/photos";
import { stockAgeFilter } from "@/lib/vehicles/stock-age";
import type { UserContext } from "@/types/auth";
import type {
  BranchOption,
  InventorySummary,
  LocationOption,
  MakeOption,
  ModelOption,
  VehicleActivityItem,
  VehicleDetail,
  VehicleListItem,
  VehicleListResult,
  VehicleMarketType,
  VehicleStatus,
  VehicleStatusHistoryItem,
} from "@/types/vehicle";
import type {
  ArchiveVehicleValues,
  ChangeVehicleStatusValues,
  CreateVehicleValues,
  MarkReadyForSaleValues,
  TransferVehicleValues,
  UpdateVehicleValues,
  VehicleListQuery,
} from "@/lib/validation/vehicle";
import type { ReadyForSaleEligibility } from "@/types/ready-for-sale";

export type VehicleServiceError = {
  code:
    | "not_found"
    | "forbidden"
    | "duplicate_vin"
    | "duplicate_chassis"
    | "invalid_transition"
    | "validation"
    | "conflict"
    | "not_eligible"
    | "unknown";
  message: string;
  existingVehicleId?: string;
  blockers?: unknown;
  fieldErrors?: Record<string, string>;
};

export type ServiceResult<T> =
  | { data: T; error: null }
  | { data: null; error: VehicleServiceError };

type VehicleRow = {
  id: string;
  stock_number: string;
  vin: string | null;
  chassis_number: string | null;
  make: string;
  model: string;
  variant: string | null;
  year: number;
  mileage: number;
  mileage_unit: "km" | "mi";
  exterior_color: string | null;
  interior_color: string | null;
  body_type: string | null;
  transmission: VehicleListItem["transmission"];
  fuel_type: VehicleListItem["fuelType"];
  engine_size: string | null;
  engine_cylinders: number | null;
  seats: number | null;
  doors: number | null;
  drive_type: VehicleDetail["driveType"];
  origin_type: VehicleListItem["originType"];
  country_of_origin: string | null;
  condition: string | null;
  market_type: VehicleMarketType | null;
  visible_to_staff: boolean | null;
  branch_id: string;
  location_id: string | null;
  source: string;
  status: VehicleStatus;
  purchase_date: string | null;
  registration_date: string | null;
  registration_expiry: string | null;
  description: string | null;
  current_selling_price: number | null;
  make_id: string | null;
  model_id: string | null;
  model_year_id: string | null;
  variant_id: string | null;
  custom_variant: string | null;
  quantity: number | null;
  port_location: string | null;
  has_minimum_price: boolean | null;
  split_from_id: string | null;
  archived_at: string | null;
  storefront_published?: boolean | null;
  created_by: string | null;
  updated_by: string | null;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
  branches?: { id: string; name: string } | { id: string; name: string }[] | null;
  branch_locations?: { id: string; name: string } | { id: string; name: string }[] | null;
};

function asRelation<T extends { id: string }>(
  value: T | T[] | null | undefined,
): T | null {
  if (!value) return null;
  return Array.isArray(value) ? (value[0] ?? null) : value;
}

function mapListItem(row: VehicleRow): VehicleListItem {
  const branch = asRelation(row.branches);
  const location = asRelation(row.branch_locations);
  return {
    id: row.id,
    stockNumber: row.stock_number,
    vin: row.vin,
    chassisNumber: row.chassis_number,
    make: row.make,
    model: row.model,
    variant: row.variant,
    year: row.year,
    mileage: row.mileage,
    mileageUnit: row.mileage_unit,
    marketType: row.market_type === "new" ? "new" : "used",
    visibleToStaff: row.visible_to_staff !== false,
    status: row.status,
    branchId: row.branch_id,
    branchName: branch?.name ?? null,
    locationId: row.location_id,
    locationName: location?.name ?? null,
    bodyType: row.body_type,
    transmission: row.transmission,
    fuelType: row.fuel_type,
    originType: row.origin_type,
    exteriorColor: row.exterior_color,
    purchaseDate: row.purchase_date,
    currentSellingPrice: row.current_selling_price,
    quantity: row.quantity ?? 1,
    portLocation: row.port_location,
    hasMinimumPrice: row.has_minimum_price === true,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function mapDbError(error: { code?: string; message?: string }): VehicleServiceError {
  const planLimit = planLimitFromError(error);
  if (planLimit) return { code: "forbidden", message: planLimit.message };
  const message = (error.message ?? "").toLowerCase();
  if (error.code === "23505" || message.includes("vehicles_vin_active_unique")) {
    return { code: "duplicate_vin", message: "A vehicle with this VIN already exists." };
  }
  if (message.includes("vehicles_chassis_active_unique")) {
    return { code: "duplicate_chassis", message: "A vehicle with this chassis number already exists." };
  }
  if (message.includes("invalid vehicle status transition")) {
    return { code: "invalid_transition", message: "That status change is not allowed." };
  }
  if (message.includes("override not authorized")) {
    return { code: "forbidden", message: "You do not have permission to override Ready for Sale checks." };
  }
  if (message.includes("not authorized for branch")) {
    return { code: "forbidden", message: "You do not have access to this vehicle branch." };
  }
  if (message.includes("not authorized") || message.includes("permission")) {
    return { code: "forbidden", message: "You do not have permission to perform this action." };
  }
  if (message.includes("location does not belong") || message.includes("invalid location")) {
    return { code: "validation", message: "Selected location is not valid for this branch." };
  }
  if (message.includes("cannot be transferred") || message.includes("cannot be archived")) {
    return { code: "conflict", message: error.message ?? "This action is not allowed for the vehicle." };
  }
  if (message.includes("reason required") || message.includes("override reason required")) {
    return { code: "validation", message: "A reason is required." };
  }
  if (message.includes("vehicle not found")) {
    return { code: "not_found", message: "Vehicle not found." };
  }
  if (message.includes("not eligible for ready_for_sale")) {
    return {
      code: "not_eligible",
      message: "Vehicle cannot be marked Ready for Sale.",
      blockers: extractReadyForSaleBlockers(error.message ?? ""),
    };
  }
  if (message.includes("already ready for sale")) {
    return { code: "conflict", message: "Vehicle is already Ready for Sale." };
  }
  if (message.includes("use mark_vehicle_ready_for_sale")) {
    return {
      code: "invalid_transition",
      message: "Use Mark Ready for Sale to move this vehicle to Ready for Sale.",
    };
  }
  return { code: "unknown", message: "Unable to complete the request. Please try again." };
}

function extractReadyForSaleBlockers(message: string): unknown {
  const marker = "vehicle not eligible for ready_for_sale: ";
  const index = message.toLowerCase().indexOf(marker);
  if (index < 0) return undefined;
  const raw = message.slice(index + marker.length).trim();
  try {
    return JSON.parse(raw) as unknown;
  } catch {
    return undefined;
  }
}

function formToInsert(values: CreateVehicleValues, userId: string) {
  return {
    vin: values.vin,
    chassis_number: values.chassisNumber,
    make: values.make,
    model: values.model,
    variant: values.variant,
    year: values.year,
    mileage: values.mileage,
    mileage_unit: values.mileageUnit,
    body_type: values.bodyType,
    transmission: values.transmission ?? null,
    fuel_type: values.fuelType ?? null,
    engine_size: values.engineSize,
    engine_cylinders: values.engineCylinders,
    drive_type: values.driveType ?? null,
    seats: values.seats,
    doors: values.doors,
    exterior_color: values.exteriorColor,
    interior_color: values.interiorColor,
    origin_type: values.originType ?? null,
    country_of_origin: values.countryOfOrigin,
    branch_id: values.branchId,
    location_id: values.locationId,
    purchase_date: values.purchaseDate,
    registration_date: values.registrationDate,
    description: values.description,
    make_id: values.makeId,
    model_id: values.modelId,
    model_year_id: values.modelYearId,
    variant_id: values.variantId,
    custom_variant: values.customVariant,
    market_type: values.marketType,
    visible_to_staff: values.visibleToStaff ?? true,
    quantity: values.quantity,
    port_location: values.initialStatus === "acquired" ? values.portLocation : null,
    status: values.initialStatus ?? ("ready_for_sale" as const),
    source: "other" as const,
    created_by: userId,
    updated_by: userId,
  };
}

const LIST_SELECT = `
  id, stock_number, vin, chassis_number, make, model, variant, year, mileage, mileage_unit,
  exterior_color, interior_color, body_type, transmission, fuel_type, engine_size, engine_cylinders,
  seats, doors, drive_type, origin_type, country_of_origin, condition, market_type, visible_to_staff, branch_id, location_id,
  source, status, purchase_date, registration_date, registration_expiry, description,
  current_selling_price, make_id, model_id, model_year_id, variant_id, custom_variant,
  quantity, port_location, has_minimum_price, split_from_id, archived_at, storefront_published, created_by, updated_by, created_at, updated_at, deleted_at,
  branches!vehicles_branch_id_fkey ( id, name ),
  branch_locations!vehicles_location_id_fkey ( id, name )
`;

/** The PostgREST filter methods used below (method syntax keeps the builder's generics assignable). */
type VehicleFilterBuilder = {
  eq(column: string, value: unknown): unknown;
  neq(column: string, value: unknown): unknown;
  ilike(column: string, pattern: string): unknown;
  gte(column: string, value: unknown): unknown;
  lte(column: string, value: unknown): unknown;
  or(filters: string): unknown;
};

function applyVehicleListFilters<T extends VehicleFilterBuilder>(
  builder: T,
  query: Partial<
    Pick<
      VehicleListQuery,
      | "includeArchived"
      | "status"
      | "marketType"
      | "branchId"
      | "locationId"
      | "make"
      | "model"
      | "bodyType"
      | "originType"
      | "fuelType"
      | "transmission"
      | "yearFrom"
      | "yearTo"
      | "mileageMin"
      | "mileageMax"
      | "purchaseDateFrom"
      | "purchaseDateTo"
      | "stockAge"
      | "q"
    >
  > & { hideInTransit?: boolean },
): T {
  let next = builder;

  if (!query.includeArchived) {
    next = next.neq("status", "archived") as T;
  }
  if (query.hideInTransit) {
    // Staff only see In transit cars that a Super Admin marked visible.
    next = next.or("status.neq.acquired,visible_to_staff.is.true") as T;
  }

  if (query.status) next = next.eq("status", query.status) as T;
  if (query.marketType) next = next.eq("market_type", query.marketType) as T;
  if (query.branchId) next = next.eq("branch_id", query.branchId) as T;
  if (query.locationId) next = next.eq("location_id", query.locationId) as T;
  if (query.make) next = next.ilike("make", `%${query.make}%`) as T;
  if (query.model) next = next.ilike("model", `%${query.model}%`) as T;
  if (query.bodyType) next = next.ilike("body_type", `%${query.bodyType}%`) as T;
  if (query.originType) next = next.eq("origin_type", query.originType) as T;
  if (query.fuelType) next = next.eq("fuel_type", query.fuelType) as T;
  if (query.transmission) next = next.eq("transmission", query.transmission) as T;
  if (query.yearFrom != null) next = next.gte("year", query.yearFrom) as T;
  if (query.yearTo != null) next = next.lte("year", query.yearTo) as T;
  if (query.mileageMin != null) next = next.gte("mileage", query.mileageMin) as T;
  if (query.mileageMax != null) next = next.lte("mileage", query.mileageMax) as T;
  if (query.purchaseDateFrom) next = next.gte("purchase_date", query.purchaseDateFrom) as T;
  if (query.purchaseDateTo) next = next.lte("purchase_date", query.purchaseDateTo) as T;
  if (query.stockAge) next = next.or(stockAgeFilter(query.stockAge)) as T;

  if (query.q) {
    const q = query.q.replace(/[%_,()"]/g, "").trim();
    if (q.length > 0) {
      const pattern = `"%${q}%"`;
      next = next.or(
        `stock_number.ilike.${pattern},vin.ilike.${pattern},chassis_number.ilike.${pattern},make.ilike.${pattern},model.ilike.${pattern},variant.ilike.${pattern}`,
      ) as T;
    }
  }

  return next;
}

/** Counts units, not records: a 5-unit record counts as 5. */
function buildInventorySummary(
  rows: { status: VehicleStatus; quantity: number | null }[],
): InventorySummary {
  const summary: InventorySummary = {
    total: 0,
    inTransit: 0,
    readyForSale: 0,
    reserved: 0,
    sold: 0,
  };

  for (const row of rows) {
    const units = row.quantity ?? 1;
    summary.total += units;
    if (row.status === "acquired") summary.inTransit += units;
    if (row.status === "ready_for_sale") summary.readyForSale += units;
    if (row.status === "reserved") summary.reserved += units;
    if (row.status === "sold" || row.status === "delivered") summary.sold += units;
  }

  return summary;
}

/** Who may see minimum selling prices: cost viewers (DB rule) and price editors. */
export function canViewMinimumPrice(context: UserContext) {
  return (
    hasPermission(context.permissions, "vehicle.cost.view", context.roles) ||
    canEditVehiclePrice(context)
  );
}

// minimum_selling_price is withheld from direct reads, so it's loaded with the service
// role, only for the current page and only for callers allowed to see it.
async function getMinimumPrices(vehicleIds: string[]) {
  const map = new Map<string, number | null>();
  if (vehicleIds.length === 0) return map;
  const { data } = await (await currentTenantClient())
    .from("vehicles")
    .select("id, minimum_selling_price")
    .in("id", vehicleIds);
  for (const row of (data ?? []) as { id: string; minimum_selling_price: number | string | null }[]) {
    map.set(row.id, toNumber(row.minimum_selling_price));
  }
  return map;
}

/**
 * Purchase details (purchase date included) follow acquisition access, like the
 * acquisition record itself; sales executives don't have it.
 */
function canViewPurchase(context: UserContext) {
  return hasPermission(context.permissions, "acquisition.view", context.roles);
}

export async function listVehicles(
  rawQuery: VehicleListQuery & { hideInTransit?: boolean },
  context: UserContext,
): Promise<ServiceResult<VehicleListResult>> {
  const supabase = await createClient();
  const purchaseVisible = canViewPurchase(context);
  // Filtering or sorting by purchase date would reveal it, so those are ignored too.
  const query = purchaseVisible
    ? rawQuery
    : {
        ...rawQuery,
        purchaseDateFrom: undefined,
        purchaseDateTo: undefined,
        sort: rawQuery.sort === "purchase_date" ? ("created_at" as const) : rawQuery.sort,
      };

  let builder = supabase
    .from("vehicles")
    .select(LIST_SELECT, { count: "exact" })
    .is("deleted_at", null);

  builder = applyVehicleListFilters(builder, query);

  const from = (query.page - 1) * query.pageSize;
  const to = from + query.pageSize - 1;

  const { data, error, count } = await builder
    .order(query.sort, { ascending: query.order === "asc" })
    .range(from, to);

  if (error) {
    return { data: null, error: mapDbError(error) };
  }

  const summary = await getInventorySummary(query);

  const items = ((data ?? []) as unknown as VehicleRow[]).map(mapListItem);
  const primaryUrls = await getPrimaryPhotoUrls(items.map((item) => item.id));
  const minimums = canViewMinimumPrice(context)
    ? await getMinimumPrices(items.map((item) => item.id))
    : null;

  const withMeta = items.map((item) => ({
    ...item,
    purchaseDate: purchaseVisible ? item.purchaseDate : null,
    primaryPhotoUrl: primaryUrls.get(item.id) ?? null,
    ...(minimums ? { minimumSellingPrice: minimums.get(item.id) ?? null } : {}),
  }));

  return {
    data: {
      items: withMeta,
      page: query.page,
      pageSize: query.pageSize,
      total: count ?? 0,
      summary: summary.data ?? { total: 0, inTransit: 0, readyForSale: 0, reserved: 0, sold: 0 },
    },
    error: null,
  };
}

export async function getInventorySummary(
  query: Partial<VehicleListQuery> & { hideInTransit?: boolean } = {},
): Promise<ServiceResult<InventorySummary>> {
  const supabase = await createClient();
  let builder = supabase
    .from("vehicles")
    .select("id, status, quantity")
    .is("deleted_at", null);

  builder = applyVehicleListFilters(builder, {
    includeArchived: query.includeArchived ?? false,
    hideInTransit: query.hideInTransit,
    status: query.status,
    marketType: query.marketType,
    branchId: query.branchId,
    locationId: query.locationId,
    make: query.make,
    model: query.model,
    bodyType: query.bodyType,
    originType: query.originType,
    fuelType: query.fuelType,
    transmission: query.transmission,
    yearFrom: query.yearFrom,
    yearTo: query.yearTo,
    mileageMin: query.mileageMin,
    mileageMax: query.mileageMax,
    purchaseDateFrom: query.purchaseDateFrom,
    purchaseDateTo: query.purchaseDateTo,
    q: query.q,
  });

  const { data, error } = await builder;
  if (error) return { data: null, error: mapDbError(error) };

  const rows = (data ?? []) as { id: string; status: VehicleStatus; quantity: number | null }[];
  return { data: buildInventorySummary(rows), error: null };
}

export async function findDuplicateVehicle(input: {
  vin?: string | null;
  chassisNumber?: string | null;
  excludeId?: string;
}): Promise<ServiceResult<{ id: string; stockNumber: string } | null>> {
  const supabase = await createClient();

  if (input.vin) {
    let q = supabase
      .from("vehicles")
      .select("id, stock_number")
      .eq("vin", input.vin)
      .is("deleted_at", null)
      .limit(1);
    if (input.excludeId) q = q.neq("id", input.excludeId);
    const { data, error } = await q.maybeSingle();
    if (error) return { data: null, error: mapDbError(error) };
    if (data) {
      const row = data as { id: string; stock_number: string };
      return { data: { id: row.id, stockNumber: row.stock_number }, error: null };
    }
  }

  if (input.chassisNumber) {
    let q = supabase
      .from("vehicles")
      .select("id, stock_number")
      .eq("chassis_number", input.chassisNumber)
      .is("deleted_at", null)
      .limit(1);
    if (input.excludeId) q = q.neq("id", input.excludeId);
    const { data, error } = await q.maybeSingle();
    if (error) return { data: null, error: mapDbError(error) };
    if (data) {
      const row = data as { id: string; stock_number: string };
      return { data: { id: row.id, stockNumber: row.stock_number }, error: null };
    }
  }

  return { data: null, error: null };
}

/** Resolves a vehicle page ref (stock number or legacy UUID) to its id and stock number. */
export async function resolveVehicleRef(
  ref: string,
): Promise<{ id: string; stockNumber: string; status: VehicleStatus } | null> {
  const value = decodeVehicleRef(ref).trim();
  if (!value) return null;

  const supabase = await createClient();
  const { data } = await supabase
    .from("vehicles")
    .select("id, stock_number, status")
    .eq(isUuid(value) ? "id" : "stock_number", value)
    .is("deleted_at", null)
    .maybeSingle();

  const row = data as { id: string; stock_number: string; status: VehicleStatus } | null;
  return row ? { id: row.id, stockNumber: row.stock_number, status: row.status } : null;
}

export async function getVehicle(
  id: string,
  context: UserContext,
): Promise<ServiceResult<VehicleDetail>> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("vehicles")
    .select(LIST_SELECT)
    .eq("id", id)
    .is("deleted_at", null)
    .maybeSingle();

  if (error) return { data: null, error: mapDbError(error) };
  if (!data) return { data: null, error: { code: "not_found", message: "Vehicle not found." } };

  const row = data as unknown as VehicleRow;
  if (row.status === "acquired" && row.visible_to_staff === false && !context.roles.includes("super_admin")) {
    return { data: null, error: { code: "not_found", message: "Vehicle not found." } };
  }
  const base = mapListItem(row);
  if (!canViewPurchase(context)) base.purchaseDate = null;

  let createdByName: string | null = null;
  let updatedByName: string | null = null;
  const profileIds = [row.created_by, row.updated_by].filter(Boolean) as string[];
  if (profileIds.length > 0) {
    const { data: profiles } = await supabase
      .from("profiles")
      .select("id, display_name")
      .in("id", profileIds);
    const map = new Map(
      ((profiles ?? []) as { id: string; display_name: string }[]).map((p) => [
        p.id,
        p.display_name,
      ]),
    );
    createdByName = row.created_by ? (map.get(row.created_by) ?? null) : null;
    updatedByName = row.updated_by ? (map.get(row.updated_by) ?? null) : null;
  }

  const primaryPhotoUrl = (await getPrimaryPhotoUrls([row.id])).get(row.id) ?? null;

  const detail: VehicleDetail = {
    ...base,
    primaryPhotoUrl,
    engineSize: row.engine_size,
    engineCylinders: row.engine_cylinders,
    seats: row.seats,
    doors: row.doors,
    driveType: row.drive_type,
    interiorColor: row.interior_color,
    countryOfOrigin: row.country_of_origin,
    registrationDate: row.registration_date,
    registrationExpiry: row.registration_expiry,
    description: row.description,
    source: row.source,
    condition: row.condition,
    makeId: row.make_id,
    modelId: row.model_id,
    modelYearId: row.model_year_id,
    variantId: row.variant_id,
    customVariant: row.custom_variant,
    archivedAt: row.archived_at,
    storefrontPublished: row.storefront_published === true,
    createdBy: row.created_by,
    updatedBy: row.updated_by,
    createdByName,
    updatedByName,
  };

  if (hasPermission(context.permissions, "vehicle.cost.view", context.roles)) {
    const { data: costs } = await supabase.rpc("read_vehicle_costs", {
      p_vehicle_id: id,
    });
    const costRow = Array.isArray(costs) ? costs[0] : costs;
    if (costRow && typeof costRow === "object") {
      const record = costRow as {
        total_acquisition_cost?: number;
        minimum_selling_price?: number | null;
      };
      detail.totalAcquisitionCost = Number(record.total_acquisition_cost ?? 0);
      detail.minimumSellingPrice =
        record.minimum_selling_price == null ? null : Number(record.minimum_selling_price);
    }
  }

  if (row.split_from_id) {
    const { data: origin } = await supabase
      .from("vehicles")
      .select("id, stock_number")
      .eq("id", row.split_from_id)
      .maybeSingle();
    const originRow = origin as { id: string; stock_number: string } | null;
    detail.splitFrom = originRow ? { id: originRow.id, stockNumber: originRow.stock_number } : null;
  }

  if (row.status === "reserved" || row.status === "sold" || row.status === "delivered") {
    detail.booking = await getVehicleBooking(id, context);
  }

  // Price editors need the minimum (even without cost access) and the target price to
  // prefill the edit form.
  if (canEditVehiclePrice(context)) {
    const { data: pricing } = await supabase
      .from("vehicle_pricing")
      .select("minimum_selling_price, target_selling_price")
      .eq("vehicle_id", id)
      .maybeSingle();
    const pricingRow = pricing as {
      minimum_selling_price: number | string | null;
      target_selling_price: number | string | null;
    } | null;
    if (detail.minimumSellingPrice === undefined) {
      detail.minimumSellingPrice = toNumber(pricingRow?.minimum_selling_price);
    }
    detail.targetSellingPrice = toNumber(pricingRow?.target_selling_price);
  }

  if (hasPermission(context.permissions, "acquisition.view", context.roles)) {
    // Prefer an active acquisition, else the latest one.
    const findAcquisition = async (vehicleId: string) => {
      const select = "id, acquisition_number, status, source_type, purchase_date, purchase_price, currency";
      const { data: active } = await supabase
        .from("acquisitions")
        .select(select)
        .eq("vehicle_id", vehicleId)
        .not("status", "in", '("cancelled","rejected")')
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (active) return active;
      const { data: latest } = await supabase
        .from("acquisitions")
        .select(select)
        .eq("vehicle_id", vehicleId)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      return latest;
    };

    let acq = await findAcquisition(id);
    // Split records share the purchase of the record they came from.
    if (!acq && row.split_from_id) {
      const rootId = await getRootVehicleId(id, row.split_from_id);
      acq = await findAcquisition(rootId);
      if (acq) {
        const { data: root } = await supabase
          .from("vehicles")
          .select("id, stock_number, quantity")
          .eq("id", rootId)
          .maybeSingle();
        const rootRow = root as { id: string; stock_number: string; quantity: number | null } | null;
        if (rootRow) {
          detail.acquisitionSharedFrom = { id: rootRow.id, stockNumber: rootRow.stock_number };
        }
      }
    }

    if (acq) {
      const row = acq as {
        id: string;
        acquisition_number: string;
        status: string;
        source_type: string | null;
        purchase_date: string | null;
        purchase_price: number | null;
        currency: string;
      };
      detail.acquisition = {
        id: row.id,
        acquisitionNumber: row.acquisition_number,
        status: row.status,
        sourceType: row.source_type,
        purchaseDate: row.purchase_date,
        purchasePrice:
          row.purchase_price == null ? null : Number(row.purchase_price),
        currency: row.currency,
      };

      if (hasPermission(context.permissions, "acquisition.cost.view", context.roles) ||
          hasPermission(context.permissions, "vehicle.cost.view", context.roles)) {
        const { data: costs } = await supabase.rpc("read_acquisition_costs", {
          p_acquisition_id: row.id,
        });
        const costRow = Array.isArray(costs) ? costs[0] : costs;
        if (costRow && typeof costRow === "object") {
          const record = costRow as { total_acquisition_cost?: number };
          if (record.total_acquisition_cost != null) {
            detail.acquisition.totalAcquisitionCost = Number(record.total_acquisition_cost);
          }
        }
      }
    } else {
      detail.acquisition = null;
    }
  }

  return { data: detail, error: null };
}

/** The original record a split record came from (the record itself when not split). */
export async function getRootVehicleId(vehicleId: string, splitFromId?: string | null) {
  if (!splitFromId) return vehicleId;
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("vehicle_root_id" as never, { p_vehicle_id: vehicleId } as never);
  // Before migration 00052 is applied, fall back to the direct parent.
  return !error && data ? (data as unknown as string) : splitFromId;
}

export async function createVehicle(
  values: CreateVehicleValues,
  context: UserContext,
): Promise<ServiceResult<VehicleDetail>> {
  if (!hasPermission(context.permissions, "vehicle.create", context.roles)) {
    return { data: null, error: { code: "forbidden", message: "You do not have permission to create vehicles." } };
  }

  const overLimit = await checkPlanLimit("vehicles", values.quantity ?? 1);
  if (overLimit) return { data: null, error: { code: "forbidden", message: overLimit.message } };

  const duplicate = await findDuplicateVehicle({
    vin: values.vin,
    chassisNumber: values.chassisNumber,
  });
  if (duplicate.error) return { data: null, error: duplicate.error };
  if (duplicate.data) {
    return {
      data: null,
      error: {
        code: values.vin ? "duplicate_vin" : "duplicate_chassis",
        message: values.vin
          ? "A vehicle with this VIN already exists."
          : "A vehicle with this chassis number already exists.",
        existingVehicleId: duplicate.data.id,
      },
    };
  }

  const catalogCheck = await assertCatalogSelection({
    makeId: values.makeId,
    modelId: values.modelId,
    modelYearId: values.modelYearId,
    variantId: values.variantId,
    year: values.year,
  });
  if (catalogCheck.error) {
    return {
      data: null,
      error: { code: "validation", message: catalogCheck.error.message },
    };
  }

  const supabase = await createClient();
  const insert = formToInsert(values, context.userId);
  // stock_number assigned by DB trigger
  const { data, error } = await supabase
    .from("vehicles")
    .insert({ ...insert, stock_number: "" } as never)
    .select("id")
    .single();

  if (error) return { data: null, error: mapDbError(error) };
  const id = (data as { id: string }).id;

  // The vehicle exists at this point; a pricing failure is reported as a warning
  // so the client does not retry the create and duplicate the vehicle.
  const pricing = await saveVehiclePricing(id, values, context);
  if ((values.initialStatus ?? "ready_for_sale") === "ready_for_sale") {
    alertVehicleEvent("ready_for_sale", id, context.userId);
  }
  const result = await getVehicle(id, context);
  if (result.data && pricing.error) result.data.pricingWarning = pricing.error.message;
  return result;
}

export async function updateVehicle(
  id: string,
  values: UpdateVehicleValues,
  context: UserContext,
): Promise<ServiceResult<VehicleDetail>> {
  if (!hasPermission(context.permissions, "vehicle.edit", context.roles)) {
    return { data: null, error: { code: "forbidden", message: "You do not have permission to edit vehicles." } };
  }

  const supabase = await createClient();
  const { data: currentRow } = await supabase
    .from("vehicles")
    .select("status")
    .eq("id", id)
    .is("deleted_at", null)
    .maybeSingle();
  const current = currentRow as { status: VehicleStatus } | null;
  if (!current) return { data: null, error: { code: "not_found", message: "Vehicle not found." } };
  if (isSoldStatus(current.status)) {
    return { data: null, error: { code: "conflict", message: "A sold vehicle can no longer be edited." } };
  }

  const duplicate = await findDuplicateVehicle({
    vin: values.vin,
    chassisNumber: values.chassisNumber,
    excludeId: id,
  });
  if (duplicate.error) return { data: null, error: duplicate.error };
  if (duplicate.data) {
    return {
      data: null,
      error: {
        code: values.vin ? "duplicate_vin" : "duplicate_chassis",
        message: values.vin
          ? "A vehicle with this VIN already exists."
          : "A vehicle with this chassis number already exists.",
        existingVehicleId: duplicate.data.id,
      },
    };
  }

  const catalogCheck = await assertCatalogSelection({
    makeId: values.makeId,
    modelId: values.modelId,
    modelYearId: values.modelYearId,
    variantId: values.variantId,
    year: values.year,
  });
  if (catalogCheck.error) {
    return {
      data: null,
      error: { code: "validation", message: catalogCheck.error.message },
    };
  }

  const payload = {
    ...formToInsert(values, context.userId),
    status: undefined,
    source: undefined,
    created_by: undefined,
  };
  delete (payload as { status?: unknown }).status;
  delete (payload as { source?: unknown }).source;
  delete (payload as { created_by?: unknown }).created_by;

  // Branch moves go through transferVehicle. Location may change within the same branch.
  const { error } = await supabase
    .from("vehicles")
    .update({
      vin: values.vin,
      chassis_number: values.chassisNumber,
      make: values.make,
      model: values.model,
      variant: values.variant,
      year: values.year,
      mileage: values.mileage,
      mileage_unit: values.mileageUnit,
      body_type: values.bodyType,
      transmission: values.transmission ?? null,
      fuel_type: values.fuelType ?? null,
      engine_size: values.engineSize,
      engine_cylinders: values.engineCylinders,
      drive_type: values.driveType ?? null,
      seats: values.seats,
      doors: values.doors,
      exterior_color: values.exteriorColor,
      interior_color: values.interiorColor,
      origin_type: values.originType ?? null,
      country_of_origin: values.countryOfOrigin,
      location_id: values.locationId,
      purchase_date: values.purchaseDate,
      registration_date: values.registrationDate,
      description: values.description,
      make_id: values.makeId,
      model_id: values.modelId,
      model_year_id: values.modelYearId,
      variant_id: values.variantId,
      custom_variant: values.customVariant,
      market_type: values.marketType,
      quantity: values.quantity,
      // Port location only applies (and is only shown) while In transit.
      ...(current.status === "acquired" ? { port_location: values.portLocation } : {}),
      ...(values.visibleToStaff !== undefined ? { visible_to_staff: values.visibleToStaff } : {}),
      updated_by: context.userId,
    } as never)
    .eq("id", id)
    .is("deleted_at", null);

  if (error) return { data: null, error: mapDbError(error) };

  const pricing = await saveVehiclePricing(id, values, context);
  if (pricing.error) return { data: null, error: pricing.error };
  return getVehicle(id, context);
}

export function canEditVehiclePrice(context: UserContext) {
  return hasPermission(context.permissions, "vehicle.price.edit", context.roles);
}

/** Saved status, used to apply status-dependent form rules (e.g. port location) on edit. */
export async function getVehicleStatus(id: string): Promise<VehicleStatus | null> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("vehicles")
    .select("status")
    .eq("id", id)
    .is("deleted_at", null)
    .maybeSingle();
  return (data as { status: VehicleStatus } | null)?.status ?? null;
}

type PricingRow = {
  minimum_selling_price: number | string | null;
  target_selling_price: number | string | null;
  advertised_price: number | string | null;
  current_selling_price: number | string | null;
  maximum_discount_amount: number | string | null;
  maximum_discount_percent: number | string | null;
  pricing_notes: string | null;
};

const toNumber = (value: number | string | null | undefined) =>
  value == null ? null : Number(value);

/**
 * Saves the form's Selling Price section through upsert_vehicle_pricing, which keeps
 * vehicle_pricing, vehicles.minimum/current_selling_price and pricing history in sync.
 * Other pricing fields (target, advertised, discounts) are carried over unchanged.
 */
async function saveVehiclePricing(
  vehicleId: string,
  values: { minimumSellingPrice?: number | null; targetSellingPrice?: number | null },
  context: UserContext,
): Promise<{ error: VehicleServiceError | null }> {
  if (!canEditVehiclePrice(context) || values.minimumSellingPrice == null) return { error: null };

  const supabase = await createClient();
  const { data } = await supabase
    .from("vehicle_pricing")
    .select(
      "minimum_selling_price, target_selling_price, advertised_price, current_selling_price, maximum_discount_amount, maximum_discount_percent, pricing_notes",
    )
    .eq("vehicle_id", vehicleId)
    .maybeSingle();
  const existing = data as PricingRow | null;

  const minimum = values.minimumSellingPrice;
  const target = values.targetSellingPrice ?? null;
  if (
    existing &&
    toNumber(existing.minimum_selling_price) === minimum &&
    toNumber(existing.target_selling_price) === target &&
    toNumber(existing.current_selling_price) === target
  ) {
    return { error: null };
  }

  const discount = toNumber(existing?.maximum_discount_amount);
  const { error } = await supabase.rpc("upsert_vehicle_pricing", {
    p_vehicle_id: vehicleId,
    p_minimum_selling_price: minimum,
    p_target_selling_price: target,
    // Advertised price is no longer used; clearing it avoids a hidden
    // "current cannot exceed advertised" conflict.
    p_advertised_price: null,
    // Target is the car's selling price; current is kept equal for the list, bookings
    // and profitability, which read it.
    p_current_selling_price: target,
    p_maximum_discount_amount: discount,
    p_maximum_discount_percent: maxDiscountPercentFrom(discount, target),
    p_pricing_notes: existing?.pricing_notes ?? null,
    p_change_reason: existing ? "other" : "initial_pricing",
  });
  if (!error) return { error: null };

  const message = error.message.toLowerCase();
  if (message.includes("cannot exceed target")) {
    return {
      error: {
        code: "validation",
        message: "Target selling price cannot be lower than the minimum selling price.",
        fieldErrors: { targetSellingPrice: "validation.sellingBelowMinimum" },
      },
    };
  }
  return { error: mapDbError(error) };
}

export async function changeVehicleStatus(
  id: string,
  values: ChangeVehicleStatusValues,
  context: UserContext,
): Promise<ServiceResult<VehicleDetail>> {
  const canChange =
    hasPermission(context.permissions, "vehicle.status.change", context.roles) ||
    hasPermission(context.permissions, "vehicle.edit", context.roles);
  if (!canChange) {
    return { data: null, error: { code: "forbidden", message: "You do not have permission to change status." } };
  }

  const current = await getVehicle(id, context);
  if (current.error || !current.data) return current;

  if (!isValidVehicleStatusTransition(current.data.status, values.status)) {
    return {
      data: null,
      error: { code: "invalid_transition", message: "That status change is not allowed." },
    };
  }

  const target = await recordForUnits(current.data, values.quantity, context.userId);
  if (target.error !== null) return { data: null, error: { code: "validation", message: target.error } };

  const supabase = await createClient();
  const { error } = await supabase.rpc("change_vehicle_status", {
    p_vehicle_id: target.id,
    p_new_status: values.status,
    // change_vehicle_status requires a reason for the audit trail.
    p_reason: values.reason || `Status changed to ${values.status}`,
  } as never);

  if (error) {
    if (target.split) await undoVehicleSplit(target.id);
    return { data: null, error: mapDbError(error) };
  }
  if (
    current.data.status !== values.status &&
    (values.status === "ready_for_sale" || values.status === "sold")
  ) {
    alertVehicleEvent(values.status, target.id, context.userId);
  }
  // When only some units moved, this is the new record holding them.
  return getVehicle(target.id, context);
}

export async function transferVehicle(
  id: string,
  values: TransferVehicleValues,
  context: UserContext,
): Promise<ServiceResult<VehicleDetail>> {
  const canTransfer =
    hasPermission(context.permissions, "vehicle.branch.transfer", context.roles) ||
    hasPermission(context.permissions, "vehicle.edit", context.roles);
  if (!canTransfer) {
    return { data: null, error: { code: "forbidden", message: "You do not have permission to transfer vehicles." } };
  }

  const supabase = await createClient();
  const { error } = await supabase.rpc("transfer_vehicle", {
    p_vehicle_id: id,
    p_branch_id: values.branchId,
    p_location_id: values.locationId,
    p_reason: values.reason,
  } as never);

  if (error) return { data: null, error: mapDbError(error) };
  return getVehicle(id, context);
}

export async function archiveVehicle(
  id: string,
  values: ArchiveVehicleValues,
  context: UserContext,
): Promise<ServiceResult<VehicleDetail>> {
  const canArchive =
    hasPermission(context.permissions, "vehicle.archive", context.roles) ||
    hasPermission(context.permissions, "vehicle.delete", context.roles);
  if (!canArchive) {
    return { data: null, error: { code: "forbidden", message: "You do not have permission to archive vehicles." } };
  }

  const supabase = await createClient();
  const { error } = await supabase.rpc("archive_vehicle", {
    p_vehicle_id: id,
    p_reason: values.reason,
  } as never);

  if (error) return { data: null, error: mapDbError(error) };
  return getVehicle(id, context);
}

// Checks and blockers the app shows (the DB function reports only these since 00063).
const READY_FOR_SALE_CHECKS = new Set(["documents", "status"]);
const READY_FOR_SALE_BLOCKERS = new Set(["document_missing", "invalid_status", "branch_denied"]);

function mapReadyForSaleEligibility(raw: Record<string, unknown>): ReadyForSaleEligibility {
  const checksRaw = Array.isArray(raw.checks) ? raw.checks : [];
  const blockersRaw = Array.isArray(raw.blockers) ? raw.blockers : [];

  const checks = checksRaw
    .map((item) => {
      const row = item as Record<string, unknown>;
      return { key: String(row.key ?? ""), ok: Boolean(row.ok), label: String(row.label ?? "") };
    })
    .filter((check) => READY_FOR_SALE_CHECKS.has(check.key));

  const blockers = blockersRaw
    .map((item) => {
      const row = item as Record<string, unknown>;
      return {
        code: String(row.code ?? ""),
        message: String(row.message ?? ""),
        action: row.action === "view_documents" ? ("view_documents" as const) : null,
      };
    })
    .filter((blocker) => READY_FOR_SALE_BLOCKERS.has(blocker.code));

  return {
    eligible: Boolean(raw.eligible) || (checks.every((check) => check.ok) && blockers.length === 0),
    canOverride: Boolean(raw.canOverride),
    vehicleId: String(raw.vehicleId ?? ""),
    stockNumber: String(raw.stockNumber ?? ""),
    make: String(raw.make ?? ""),
    model: String(raw.model ?? ""),
    year: Number(raw.year ?? 0),
    currentStatus: raw.currentStatus as VehicleStatus,
    checks,
    blockers,
    error: raw.error ? String(raw.error) : undefined,
  };
}

export async function getVehicleReadyForSaleEligibility(
  id: string,
  context: UserContext,
): Promise<ServiceResult<ReadyForSaleEligibility>> {
  const canView =
    hasPermission(context.permissions, "vehicle.ready_for_sale", context.roles) ||
    hasPermission(context.permissions, "vehicle.view", context.roles);
  if (!canView) {
    return {
      data: null,
      error: { code: "forbidden", message: "You do not have permission to view Ready for Sale eligibility." },
    };
  }

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("evaluate_vehicle_ready_for_sale", {
    p_vehicle_id: id,
  });

  if (error) return { data: null, error: mapDbError(error) };
  return {
    data: mapReadyForSaleEligibility((data ?? {}) as Record<string, unknown>),
    error: null,
  };
}

export async function markVehicleReadyForSale(
  id: string,
  values: MarkReadyForSaleValues,
  context: UserContext,
): Promise<ServiceResult<VehicleDetail>> {
  if (!hasPermission(context.permissions, "vehicle.ready_for_sale", context.roles)) {
    return {
      data: null,
      error: { code: "forbidden", message: "You do not have permission to mark vehicles Ready for Sale." },
    };
  }

  if (
    values.override &&
    !hasPermission(context.permissions, "vehicle.ready_for_sale.override", context.roles)
  ) {
    return {
      data: null,
      error: {
        code: "forbidden",
        message: "You do not have permission to override Ready for Sale checks.",
      },
    };
  }

  const current = await getVehicle(id, context);
  if (current.error || !current.data) return current;

  const target = await recordForUnits(current.data, values.quantity, context.userId);
  if (target.error !== null) return { data: null, error: { code: "validation", message: target.error } };

  const supabase = await createClient();
  const { error } = await supabase.rpc("mark_vehicle_ready_for_sale", {
    p_vehicle_id: target.id,
    p_reason: values.reason,
    p_override: values.override ?? false,
    p_override_reason: values.overrideReason,
  });

  if (error) {
    if (target.split) await undoVehicleSplit(target.id);
    return { data: null, error: mapDbError(error) };
  }
  alertVehicleEvent("ready_for_sale", target.id, context.userId);
  // When only some units moved, this is the new record holding them.
  return getVehicle(target.id, context);
}

export async function getVehicleStatusHistory(
  vehicleId: string,
): Promise<ServiceResult<VehicleStatusHistoryItem[]>> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("vehicle_status_history")
    .select("id, vehicle_id, old_status, new_status, reason, changed_by, created_at")
    .eq("vehicle_id", vehicleId)
    .order("created_at", { ascending: false });

  if (error) return { data: null, error: mapDbError(error) };

  const rows = (data ?? []) as {
    id: string;
    vehicle_id: string;
    old_status: VehicleStatus | null;
    new_status: VehicleStatus;
    reason: string | null;
    changed_by: string | null;
    created_at: string;
  }[];

  const userIds = Array.from(new Set(rows.map((r) => r.changed_by).filter(Boolean))) as string[];
  const nameMap = new Map<string, string>();
  if (userIds.length > 0) {
    const { data: profiles } = await supabase
      .from("profiles")
      .select("id, display_name")
      .in("id", userIds);
    for (const profile of (profiles ?? []) as { id: string; display_name: string }[]) {
      nameMap.set(profile.id, profile.display_name);
    }
  }

  return {
    data: rows.map((row) => ({
      id: row.id,
      vehicleId: row.vehicle_id,
      oldStatus: row.old_status,
      newStatus: row.new_status,
      reason: row.reason,
      changedBy: row.changed_by,
      changedByName: row.changed_by ? (nameMap.get(row.changed_by) ?? null) : null,
      createdAt: row.created_at,
    })),
    error: null,
  };
}

export async function getVehicleActivity(
  vehicleId: string,
): Promise<ServiceResult<VehicleActivityItem[]>> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("audit_logs")
    .select("id, action, entity_type, old_values, new_values, metadata, created_at, user_id")
    .eq("entity_type", "vehicles")
    .eq("entity_id", vehicleId)
    .order("created_at", { ascending: false })
    .limit(50);

  if (error) return { data: null, error: mapDbError(error) };

  const rows = (data ?? []) as {
    id: string;
    action: string;
    entity_type: string;
    old_values: Record<string, unknown> | null;
    new_values: Record<string, unknown> | null;
    metadata: Record<string, unknown> | null;
    created_at: string;
    user_id: string | null;
  }[];

  const userIds = Array.from(new Set(rows.map((r) => r.user_id).filter(Boolean))) as string[];
  const nameMap = new Map<string, string>();
  if (userIds.length > 0) {
    const { data: profiles } = await supabase
      .from("profiles")
      .select("id, display_name")
      .in("id", userIds);
    for (const profile of (profiles ?? []) as { id: string; display_name: string }[]) {
      nameMap.set(profile.id, profile.display_name);
    }
  }

  return {
    data: rows.map((row) => ({
      id: row.id,
      action: row.action,
      entityType: row.entity_type,
      oldValues: row.old_values,
      newValues: row.new_values,
      metadata: row.metadata,
      createdAt: row.created_at,
      userId: row.user_id,
      userName: row.user_id ? (nameMap.get(row.user_id) ?? null) : null,
    })),
    error: null,
  };
}

export async function listBranches(): Promise<ServiceResult<BranchOption[]>> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("branches")
    .select("id, name, code")
    .eq("is_active", true)
    .order("name");

  if (error) return { data: null, error: mapDbError(error) };
  return {
    data: ((data ?? []) as { id: string; name: string; code: string }[]).map((row) => ({
      id: row.id,
      name: row.name,
      code: row.code,
    })),
    error: null,
  };
}

export async function listLocations(
  branchId?: string,
): Promise<ServiceResult<LocationOption[]>> {
  const supabase = await createClient();
  let q = supabase
    .from("branch_locations")
    .select("id, branch_id, name, location_type")
    .eq("is_active", true)
    .order("name");
  if (branchId) q = q.eq("branch_id", branchId);

  const { data, error } = await q;
  if (error) return { data: null, error: mapDbError(error) };
  return {
    data: ((data ?? []) as {
      id: string;
      branch_id: string;
      name: string;
      location_type: string;
    }[]).map((row) => ({
      id: row.id,
      branchId: row.branch_id,
      name: row.name,
      locationType: row.location_type,
    })),
    error: null,
  };
}

export async function listMakes(): Promise<ServiceResult<MakeOption[]>> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("vehicle_makes")
    .select("id, name, name_ar, slug")
    .eq("is_active", true)
    .order("sort_order")
    .order("name");

  if (error) return { data: null, error: mapDbError(error) };
  return {
    data: ((data ?? []) as { id: string; name: string; name_ar: string | null; slug: string }[]).map(
      (row) => ({
        id: row.id,
        name: row.name,
        nameAr: row.name_ar,
        slug: row.slug,
      }),
    ),
    error: null,
  };
}

export async function listModels(makeId?: string): Promise<ServiceResult<ModelOption[]>> {
  const supabase = await createClient();
  let q = supabase
    .from("vehicle_models")
    .select("id, make_id, name, name_ar, slug")
    .eq("is_active", true)
    .order("sort_order")
    .order("name");
  if (makeId) q = q.eq("make_id", makeId);

  const { data, error } = await q;
  if (error) return { data: null, error: mapDbError(error) };
  return {
    data: (
      (data ?? []) as {
        id: string;
        make_id: string;
        name: string;
        name_ar: string | null;
        slug: string;
      }[]
    ).map((row) => ({
      id: row.id,
      makeId: row.make_id,
      name: row.name,
      nameAr: row.name_ar,
      slug: row.slug,
    })),
    error: null,
  };
}
