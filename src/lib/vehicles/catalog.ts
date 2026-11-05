import { createClient } from "@/lib/supabase/server";
import { and, asc, eq, ilike, or } from "drizzle-orm";
import { isDrizzleConfigured, withUserDatabase } from "@/lib/db/client";
import { vehicleMakes } from "@/lib/db/schema";
import type {
  CatalogMake,
  CatalogModel,
  CatalogModelYear,
  CatalogVariant,
  DriveType,
  FuelType,
  TransmissionType,
} from "@/types/vehicle";

export type { CatalogMake, CatalogModel, CatalogModelYear, CatalogVariant };

type CatalogError = { code: string; message: string };
type ServiceResult<T> = { data: T; error: null } | { data: null; error: CatalogError };

function mapDbError(error: { code?: string; message?: string }): CatalogError {
  const message = error.message ?? "Database error";
  if (error.code === "23505") {
    return { code: "duplicate", message: "A catalog record with this key already exists." };
  }
  return { code: error.code ?? "db_error", message };
}

function mapMake(row: {
  id: string;
  name: string;
  name_ar: string | null;
  slug: string;
  is_active: boolean;
  sort_order: number;
}): CatalogMake {
  return {
    id: row.id,
    name: row.name,
    nameAr: row.name_ar,
    slug: row.slug,
    isActive: row.is_active,
    sortOrder: row.sort_order,
  };
}

function mapModel(row: {
  id: string;
  make_id: string;
  name: string;
  name_ar: string | null;
  slug: string;
  vehicle_type: string | null;
  is_active: boolean;
  sort_order: number;
}): CatalogModel {
  return {
    id: row.id,
    makeId: row.make_id,
    name: row.name,
    nameAr: row.name_ar,
    slug: row.slug,
    vehicleType: row.vehicle_type,
    isActive: row.is_active,
    sortOrder: row.sort_order,
  };
}

function mapYear(row: {
  id: string;
  model_id: string;
  year: number;
  market: string;
  is_active: boolean;
}): CatalogModelYear {
  return {
    id: row.id,
    modelId: row.model_id,
    year: row.year,
    market: row.market,
    isActive: row.is_active,
  };
}

function mapVariant(row: {
  id: string;
  model_year_id: string;
  name: string;
  name_ar: string | null;
  slug: string;
  engine: string | null;
  engine_capacity: number | null;
  fuel_type: FuelType | null;
  transmission: TransmissionType | null;
  drivetrain: DriveType | null;
  body_type: string | null;
  seating_capacity: number | null;
  is_active: boolean;
  sort_order: number;
}): CatalogVariant {
  return {
    id: row.id,
    modelYearId: row.model_year_id,
    name: row.name,
    nameAr: row.name_ar,
    slug: row.slug,
    engine: row.engine,
    engineCapacity: row.engine_capacity == null ? null : Number(row.engine_capacity),
    fuelType: row.fuel_type,
    transmission: row.transmission,
    drivetrain: row.drivetrain,
    bodyType: row.body_type,
    seatingCapacity: row.seating_capacity,
    isActive: row.is_active,
    sortOrder: row.sort_order,
  };
}

export async function listCatalogMakes(options?: {
  includeInactive?: boolean;
  q?: string;
}): Promise<ServiceResult<CatalogMake[]>> {
  if (isDrizzleConfigured()) {
    try {
      const term = options?.q?.trim();
      const data = await withUserDatabase((tx) =>
        tx
          .select({
            id: vehicleMakes.id,
            name: vehicleMakes.name,
            nameAr: vehicleMakes.nameAr,
            slug: vehicleMakes.slug,
            isActive: vehicleMakes.isActive,
            sortOrder: vehicleMakes.sortOrder,
          })
          .from(vehicleMakes)
          .where(
            and(
              options?.includeInactive ? undefined : eq(vehicleMakes.isActive, true),
              term
                ? or(ilike(vehicleMakes.name, `%${term}%`), ilike(vehicleMakes.nameAr, `%${term}%`))
                : undefined,
            ),
          )
          .orderBy(asc(vehicleMakes.sortOrder), asc(vehicleMakes.name)),
      );
      return { data, error: null };
    } catch (error) {
      return { data: null, error: mapDbError(error instanceof Error ? error : {}) };
    }
  }
  const supabase = await createClient();
  let q = supabase
    .from("vehicle_makes")
    .select("id, name, name_ar, slug, is_active, sort_order")
    .order("sort_order")
    .order("name");

  if (!options?.includeInactive) q = q.eq("is_active", true);
  if (options?.q?.trim()) {
    const term = `%${options.q.trim()}%`;
    q = q.or(`name.ilike.${JSON.stringify(term)},name_ar.ilike.${JSON.stringify(term)}`);
  }

  const { data, error } = await q;
  if (error) return { data: null, error: mapDbError(error) };
  return {
    data: ((data ?? []) as Parameters<typeof mapMake>[0][]).map(mapMake),
    error: null,
  };
}

export async function listCatalogModels(
  makeId: string,
  options?: { includeInactive?: boolean; q?: string },
): Promise<ServiceResult<CatalogModel[]>> {
  if (!makeId) return { data: [], error: null };
  const supabase = await createClient();
  let q = supabase
    .from("vehicle_models")
    .select("id, make_id, name, name_ar, slug, vehicle_type, is_active, sort_order")
    .eq("make_id", makeId)
    .order("sort_order")
    .order("name");

  if (!options?.includeInactive) q = q.eq("is_active", true);
  if (options?.q?.trim()) {
    const term = `%${options.q.trim()}%`;
    q = q.or(`name.ilike.${JSON.stringify(term)},name_ar.ilike.${JSON.stringify(term)}`);
  }

  const { data, error } = await q;
  if (error) return { data: null, error: mapDbError(error) };
  return {
    data: ((data ?? []) as Parameters<typeof mapModel>[0][]).map(mapModel),
    error: null,
  };
}

export async function listCatalogYears(
  modelId: string,
  options?: { includeInactive?: boolean; market?: string },
): Promise<ServiceResult<CatalogModelYear[]>> {
  if (!modelId) return { data: [], error: null };
  const supabase = await createClient();
  let q = supabase
    .from("vehicle_model_years")
    .select("id, model_id, year, market, is_active")
    .eq("model_id", modelId)
    .eq("market", options?.market ?? "UAE")
    .order("year", { ascending: false });

  if (!options?.includeInactive) q = q.eq("is_active", true);

  const { data, error } = await q;
  if (error) return { data: null, error: mapDbError(error) };
  return {
    data: ((data ?? []) as Parameters<typeof mapYear>[0][]).map(mapYear),
    error: null,
  };
}

export async function listCatalogVariants(
  modelYearId: string,
  options?: { includeInactive?: boolean; q?: string },
): Promise<ServiceResult<CatalogVariant[]>> {
  if (!modelYearId) return { data: [], error: null };
  const supabase = await createClient();
  let q = supabase
    .from("vehicle_variants")
    .select(
      "id, model_year_id, name, name_ar, slug, engine, engine_capacity, fuel_type, transmission, drivetrain, body_type, seating_capacity, is_active, sort_order",
    )
    .eq("model_year_id", modelYearId)
    .order("sort_order")
    .order("name");

  if (!options?.includeInactive) q = q.eq("is_active", true);
  if (options?.q?.trim()) {
    const term = `%${options.q.trim()}%`;
    q = q.or(`name.ilike.${JSON.stringify(term)},name_ar.ilike.${JSON.stringify(term)}`);
  }

  const { data, error } = await q;
  if (error) return { data: null, error: mapDbError(error) };
  return {
    data: ((data ?? []) as Parameters<typeof mapVariant>[0][]).map(mapVariant),
    error: null,
  };
}

/** Validates catalog FK hierarchy before inventoring a vehicle. */
export async function assertCatalogSelection(input: {
  makeId: string | null;
  modelId: string | null;
  modelYearId: string | null;
  variantId: string | null;
  year: number;
}): Promise<ServiceResult<true>> {
  const supabase = await createClient();

  if (input.modelId) {
    const { data: model, error } = await supabase
      .from("vehicle_models")
      .select("id, make_id, is_active")
      .eq("id", input.modelId)
      .maybeSingle();
    if (error) return { data: null, error: mapDbError(error) };
    if (!model) {
      return { data: null, error: { code: "validation", message: "Invalid model selection." } };
    }
    if (input.makeId && input.makeId !== model.make_id) {
      return {
        data: null,
        error: { code: "validation", message: "Model does not belong to the selected brand." },
      };
    }
  }

  if (input.modelYearId) {
    const { data: yearRow, error } = await supabase
      .from("vehicle_model_years")
      .select("id, model_id, year, is_active")
      .eq("id", input.modelYearId)
      .maybeSingle();
    if (error) return { data: null, error: mapDbError(error) };
    if (!yearRow) {
      return {
        data: null,
        error: { code: "validation", message: "Invalid model year selection." },
      };
    }
    if (input.modelId && input.modelId !== yearRow.model_id) {
      return {
        data: null,
        error: { code: "validation", message: "Year does not belong to the selected model." },
      };
    }
    if (yearRow.year !== input.year) {
      return {
        data: null,
        error: { code: "validation", message: "Year does not match the selected catalog year." },
      };
    }
  }

  if (input.variantId) {
    const { data: variant, error } = await supabase
      .from("vehicle_variants")
      .select("id, model_year_id, is_active")
      .eq("id", input.variantId)
      .maybeSingle();
    if (error) return { data: null, error: mapDbError(error) };
    if (!variant) {
      return {
        data: null,
        error: { code: "validation", message: "Invalid variant selection." },
      };
    }
    if (input.modelYearId && input.modelYearId !== variant.model_year_id) {
      return {
        data: null,
        error: {
          code: "validation",
          message: "Variant does not belong to the selected model year.",
        },
      };
    }
  }

  return { data: true, error: null };
}

// ---------------------------------------------------------------------------
// Admin mutations (settings.manage)
// ---------------------------------------------------------------------------

export async function upsertCatalogMake(input: {
  id?: string;
  name: string;
  nameAr?: string | null;
  slug: string;
  country?: string | null;
  sortOrder?: number;
  isActive?: boolean;
}): Promise<ServiceResult<CatalogMake>> {
  const supabase = await createClient();
  const payload = {
    name: input.name.trim(),
    name_ar: input.nameAr?.trim() || null,
    slug: input.slug.trim(),
    country: input.country?.trim() || null,
    sort_order: input.sortOrder ?? 0,
    is_active: input.isActive ?? true,
  };

  const query = input.id
    ? supabase.from("vehicle_makes").update(payload).eq("id", input.id)
    : supabase.from("vehicle_makes").insert(payload);

  const { data, error } = await query
    .select("id, name, name_ar, slug, is_active, sort_order")
    .single();

  if (error) return { data: null, error: mapDbError(error) };
  return { data: mapMake(data as Parameters<typeof mapMake>[0]), error: null };
}

export async function upsertCatalogModel(input: {
  id?: string;
  makeId: string;
  name: string;
  nameAr?: string | null;
  slug: string;
  vehicleType?: string | null;
  sortOrder?: number;
  isActive?: boolean;
}): Promise<ServiceResult<CatalogModel>> {
  const supabase = await createClient();
  const payload = {
    make_id: input.makeId,
    name: input.name.trim(),
    name_ar: input.nameAr?.trim() || null,
    slug: input.slug.trim(),
    vehicle_type: input.vehicleType || null,
    sort_order: input.sortOrder ?? 0,
    is_active: input.isActive ?? true,
  };

  const query = input.id
    ? supabase.from("vehicle_models").update(payload).eq("id", input.id)
    : supabase.from("vehicle_models").insert(payload);

  const { data, error } = await query
    .select("id, make_id, name, name_ar, slug, vehicle_type, is_active, sort_order")
    .single();

  if (error) return { data: null, error: mapDbError(error) };
  return { data: mapModel(data as Parameters<typeof mapModel>[0]), error: null };
}

export async function upsertCatalogYear(input: {
  id?: string;
  modelId: string;
  year: number;
  market?: string;
  isActive?: boolean;
}): Promise<ServiceResult<CatalogModelYear>> {
  const supabase = await createClient();
  const payload = {
    model_id: input.modelId,
    year: input.year,
    market: input.market ?? "UAE",
    is_active: input.isActive ?? true,
  };

  const query = input.id
    ? supabase.from("vehicle_model_years").update(payload).eq("id", input.id)
    : supabase.from("vehicle_model_years").insert(payload);

  const { data, error } = await query.select("id, model_id, year, market, is_active").single();

  if (error) return { data: null, error: mapDbError(error) };
  return { data: mapYear(data as Parameters<typeof mapYear>[0]), error: null };
}

export async function upsertCatalogVariant(input: {
  id?: string;
  modelYearId: string;
  name: string;
  nameAr?: string | null;
  slug: string;
  engine?: string | null;
  engineCapacity?: number | null;
  fuelType?: FuelType | null;
  transmission?: TransmissionType | null;
  drivetrain?: DriveType | null;
  bodyType?: string | null;
  seatingCapacity?: number | null;
  sortOrder?: number;
  isActive?: boolean;
}): Promise<ServiceResult<CatalogVariant>> {
  const supabase = await createClient();
  const payload = {
    model_year_id: input.modelYearId,
    name: input.name.trim(),
    name_ar: input.nameAr?.trim() || null,
    slug: input.slug.trim(),
    engine: input.engine?.trim() || null,
    engine_capacity: input.engineCapacity ?? null,
    fuel_type: input.fuelType ?? null,
    transmission: input.transmission ?? null,
    drivetrain: input.drivetrain ?? null,
    body_type: input.bodyType?.trim() || null,
    seating_capacity: input.seatingCapacity ?? null,
    sort_order: input.sortOrder ?? 0,
    is_active: input.isActive ?? true,
  };

  const query = input.id
    ? supabase.from("vehicle_variants").update(payload).eq("id", input.id)
    : supabase.from("vehicle_variants").insert(payload);

  const { data, error } = await query
    .select(
      "id, model_year_id, name, name_ar, slug, engine, engine_capacity, fuel_type, transmission, drivetrain, body_type, seating_capacity, is_active, sort_order",
    )
    .single();

  if (error) return { data: null, error: mapDbError(error) };
  return { data: mapVariant(data as Parameters<typeof mapVariant>[0]), error: null };
}

export async function setCatalogActive(
  table: "vehicle_makes" | "vehicle_models" | "vehicle_model_years" | "vehicle_variants",
  id: string,
  isActive: boolean,
): Promise<ServiceResult<true>> {
  const supabase = await createClient();
  const { error } = await supabase.from(table).update({ is_active: isActive }).eq("id", id);
  if (error) return { data: null, error: mapDbError(error) };
  return { data: true, error: null };
}

export type CatalogTable =
  "vehicle_makes" | "vehicle_models" | "vehicle_model_years" | "vehicle_variants";

// Only renames (or changes the year); leaves active state, ordering and specs untouched.
export async function updateCatalogItem(
  table: CatalogTable,
  id: string,
  values: { name?: string; nameAr?: string | null; year?: number },
): Promise<ServiceResult<true>> {
  const supabase = await createClient();
  let patch: Record<string, unknown>;
  if (table === "vehicle_model_years") {
    if (!values.year)
      return { data: null, error: { code: "validation", message: "Year is required." } };
    patch = { year: values.year };
  } else {
    const name = values.name?.trim();
    if (!name) return { data: null, error: { code: "validation", message: "Name is required." } };
    patch = { name, slug: slugifyCatalogName(name) };
    if (table === "vehicle_makes" && values.nameAr !== undefined) {
      patch.name_ar = values.nameAr?.trim() || null;
    }
  }

  const { error } = await supabase.from(table).update(patch).eq("id", id);
  if (error) return { data: null, error: mapDbError(error) };
  return { data: true, error: null };
}

const childOf: Partial<
  Record<CatalogTable, { table: CatalogTable; column: string; label: string }>
> = {
  vehicle_makes: { table: "vehicle_models", column: "make_id", label: "model" },
  vehicle_models: { table: "vehicle_model_years", column: "model_id", label: "year" },
  vehicle_model_years: { table: "vehicle_variants", column: "model_year_id", label: "variant" },
};

export async function deleteCatalogItem(
  table: CatalogTable,
  id: string,
): Promise<ServiceResult<true>> {
  const supabase = await createClient();

  // Brands cascade-delete their models in the DB, so refuse while children exist.
  const child = childOf[table];
  if (child) {
    const { count, error } = await supabase
      .from(child.table)
      .select("id", { count: "exact", head: true })
      .eq(child.column, id);
    if (error) return { data: null, error: mapDbError(error) };
    if ((count ?? 0) > 0) {
      return {
        data: null,
        error: {
          code: "has_children",
          message: `This still has ${count} ${child.label}${count === 1 ? "" : "s"}. Delete ${count === 1 ? "it" : "those"} first, or deactivate this instead.`,
        },
      };
    }
  }

  const { error } = await supabase.from(table).delete().eq("id", id);
  if (error) {
    if (error.message?.includes("referenced by inventory") || error.code === "23503") {
      return {
        data: null,
        error: {
          code: "in_use",
          message: "This is used by vehicles in inventory. Deactivate it instead.",
        },
      };
    }
    return { data: null, error: mapDbError(error) };
  }
  return { data: true, error: null };
}

function slugifyCatalogName(value: string) {
  return value
    .trim()
    .toLowerCase()
    .replace(/&/g, "and")
    .replace(/\+/g, "-plus")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}
