import { z } from "zod";

import { jsonError, jsonOk, requireApiUser } from "@/lib/api/http";
import {
  listCatalogMakes,
  listCatalogModels,
  listCatalogVariants,
  listCatalogYears,
  deleteCatalogItem,
  setCatalogActive,
  updateCatalogItem,
  upsertCatalogMake,
  upsertCatalogModel,
  upsertCatalogVariant,
  upsertCatalogYear,
} from "@/lib/vehicles/catalog";

const makeSchema = z.object({
  action: z.literal("upsertMake"),
  id: z.string().uuid().optional(),
  name: z.string().trim().min(1),
  nameAr: z.string().trim().optional().nullable(),
  slug: z.string().trim().min(1),
  country: z.string().trim().optional().nullable(),
  sortOrder: z.number().int().optional(),
  isActive: z.boolean().optional(),
});

const modelSchema = z.object({
  action: z.literal("upsertModel"),
  id: z.string().uuid().optional(),
  makeId: z.string().uuid(),
  name: z.string().trim().min(1),
  nameAr: z.string().trim().optional().nullable(),
  slug: z.string().trim().min(1),
  vehicleType: z.string().trim().optional().nullable(),
  sortOrder: z.number().int().optional(),
  isActive: z.boolean().optional(),
});

const yearSchema = z.object({
  action: z.literal("upsertYear"),
  id: z.string().uuid().optional(),
  modelId: z.string().uuid(),
  year: z.number().int().min(1980).max(2100),
  market: z.string().trim().optional(),
  isActive: z.boolean().optional(),
});

const variantSchema = z.object({
  action: z.literal("upsertVariant"),
  id: z.string().uuid().optional(),
  modelYearId: z.string().uuid(),
  name: z.string().trim().min(1),
  nameAr: z.string().trim().optional().nullable(),
  slug: z.string().trim().min(1),
  engine: z.string().trim().optional().nullable(),
  engineCapacity: z.number().positive().optional().nullable(),
  fuelType: z.enum(["petrol", "diesel", "hybrid", "electric", "other"]).optional().nullable(),
  transmission: z.enum(["automatic", "manual", "cvt", "other"]).optional().nullable(),
  drivetrain: z.enum(["fwd", "rwd", "awd", "four_wd", "other"]).optional().nullable(),
  bodyType: z.string().trim().optional().nullable(),
  seatingCapacity: z.number().int().positive().optional().nullable(),
  sortOrder: z.number().int().optional(),
  isActive: z.boolean().optional(),
});

const activeSchema = z.object({
  action: z.literal("setActive"),
  table: z.enum([
    "vehicle_makes",
    "vehicle_models",
    "vehicle_model_years",
    "vehicle_variants",
  ]),
  id: z.string().uuid(),
  isActive: z.boolean(),
});

const catalogTable = z.enum([
  "vehicle_makes",
  "vehicle_models",
  "vehicle_model_years",
  "vehicle_variants",
]);

const updateSchema = z.object({
  action: z.literal("update"),
  table: catalogTable,
  id: z.string().uuid(),
  name: z.string().trim().min(1).optional(),
  nameAr: z.string().trim().optional().nullable(),
  year: z.number().int().min(1980).max(2100).optional(),
});

const deleteSchema = z.object({
  action: z.literal("delete"),
  table: catalogTable,
  id: z.string().uuid(),
});

const bodySchema = z.discriminatedUnion("action", [
  updateSchema,
  deleteSchema,
  makeSchema,
  modelSchema,
  yearSchema,
  variantSchema,
  activeSchema,
]);

export async function GET(request: Request) {
  const auth = await requireApiUser("settings.view");
  if ("response" in auth) return auth.response;

  const url = new URL(request.url);
  const makeId = url.searchParams.get("makeId") ?? undefined;
  const modelId = url.searchParams.get("modelId") ?? undefined;
  const modelYearId = url.searchParams.get("modelYearId") ?? undefined;

  const makes = await listCatalogMakes({ includeInactive: true });
  if (makes.error) return jsonError(makes.error.code, makes.error.message, 400);

  const models = makeId
    ? await listCatalogModels(makeId, { includeInactive: true })
    : { data: [] as Awaited<ReturnType<typeof listCatalogModels>>["data"], error: null };
  if (models.error) return jsonError(models.error.code, models.error.message, 400);

  const years = modelId
    ? await listCatalogYears(modelId, { includeInactive: true })
    : { data: [] as Awaited<ReturnType<typeof listCatalogYears>>["data"], error: null };
  if (years.error) return jsonError(years.error.code, years.error.message, 400);

  const variants = modelYearId
    ? await listCatalogVariants(modelYearId, { includeInactive: true })
    : { data: [] as Awaited<ReturnType<typeof listCatalogVariants>>["data"], error: null };
  if (variants.error) return jsonError(variants.error.code, variants.error.message, 400);

  return jsonOk({
    makes: makes.data,
    models: models.data,
    years: years.data,
    variants: variants.data,
  });
}

export async function POST(request: Request) {
  const auth = await requireApiUser("settings.manage");
  if ("response" in auth) return auth.response;

  let json: unknown;
  try {
    json = await request.json();
  } catch {
    return jsonError("validation", "Invalid JSON body.", 400);
  }

  const parsed = bodySchema.safeParse(json);
  if (!parsed.success) {
    return jsonError("validation", "Invalid catalog payload.", 400);
  }

  const body = parsed.data;

  if (body.action === "update" || body.action === "delete") {
    if (!auth.context.roles.includes("super_admin")) {
      return jsonError("forbidden", "Only Super Admins can edit or delete catalog items.", 403);
    }
    const result =
      body.action === "update"
        ? await updateCatalogItem(body.table, body.id, body)
        : await deleteCatalogItem(body.table, body.id);
    if (result.error) return jsonError(result.error.code, result.error.message, 400);
    return jsonOk({ ok: true });
  }

  if (body.action === "upsertMake") {
    const result = await upsertCatalogMake(body);
    if (result.error) return jsonError(result.error.code, result.error.message, 400);
    return jsonOk(result.data);
  }
  if (body.action === "upsertModel") {
    const result = await upsertCatalogModel(body);
    if (result.error) return jsonError(result.error.code, result.error.message, 400);
    return jsonOk(result.data);
  }
  if (body.action === "upsertYear") {
    const result = await upsertCatalogYear(body);
    if (result.error) return jsonError(result.error.code, result.error.message, 400);
    return jsonOk(result.data);
  }
  if (body.action === "upsertVariant") {
    const result = await upsertCatalogVariant(body);
    if (result.error) return jsonError(result.error.code, result.error.message, 400);
    return jsonOk(result.data);
  }

  const result = await setCatalogActive(body.table, body.id, body.isActive);
  if (result.error) return jsonError(result.error.code, result.error.message, 400);
  return jsonOk({ ok: true });
}
