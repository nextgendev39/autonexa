import { randomBytes } from "node:crypto";
import { cache } from "react";

import { hasPermission } from "@/lib/permissions";
import { platformClient, tenantClient } from "@/lib/server/privileged";
import { createClient } from "@/lib/supabase/server";
import type { UserContext } from "@/types/auth";
import type { VehicleStatus } from "@/types/vehicle";

/** Cars that have left the business. Their links show "no longer available". */
const UNAVAILABLE = new Set<VehicleStatus>(["sold", "delivered", "returned", "archived"]);

const PHOTO_URL_TTL = 60 * 60; // 1 hour; the public page is rendered per request.

const TOKEN_PATTERN = /^[A-Za-z0-9_-]{16,64}$/;

export type ShareError = {
  code: "forbidden" | "not_found" | "unavailable" | "unknown";
  message: string;
};

/** People who can see selling prices can share a car, since the public page shows its price. */
export function canShareVehicle(context: UserContext) {
  return hasPermission(context.permissions, "vehicle.price.view", context.roles);
}

/**
 * Returns the caller's public link token for a car, creating it on first share. The car is
 * read through the caller's session first, so RLS decides whether they may see it.
 */
export async function createVehicleShareLink(
  vehicleId: string,
  context: UserContext,
): Promise<{ data: { token: string } | null; error: ShareError | null }> {
  if (!canShareVehicle(context)) {
    return { data: null, error: { code: "forbidden", message: "You can't share this vehicle." } };
  }

  const supabase = await createClient();
  const { data: vehicle } = await supabase
    .from("vehicles")
    .select("id, status, visible_to_staff")
    .eq("id", vehicleId)
    .is("deleted_at", null)
    .maybeSingle();
  const row = vehicle as {
    id: string;
    status: VehicleStatus;
    visible_to_staff: boolean | null;
  } | null;
  const hidden =
    row?.status === "acquired" &&
    row.visible_to_staff === false &&
    !context.roles.includes("super_admin");
  if (!row || hidden) {
    return { data: null, error: { code: "not_found", message: "Vehicle not found." } };
  }
  if (UNAVAILABLE.has(row.status)) {
    return {
      data: null,
      error: { code: "unavailable", message: "Sold or archived vehicles can't be shared." },
    };
  }

  const admin = tenantClient(context);
  const { data: existing } = await admin
    .from("vehicle_share_links")
    .select("token")
    .eq("vehicle_id", vehicleId)
    .eq("created_by", context.userId)
    .is("revoked_at", null)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (existing) return { data: { token: (existing as { token: string }).token }, error: null };

  const token = randomBytes(18).toString("base64url");
  const { error } = await admin
    .from("vehicle_share_links")
    .insert({ token, vehicle_id: vehicleId, created_by: context.userId });
  if (error) return { data: null, error: { code: "unknown", message: error.message } };
  return { data: { token }, error: null };
}

export type SharedVehicle = {
  stockNumber: string;
  vin: string | null;
  chassisNumber: string | null;
  make: string;
  model: string;
  variant: string | null;
  /** Arabic trim name from the catalog, when there is one. */
  variantAr: string | null;
  year: number;
  mileage: number;
  mileageUnit: "km" | "mi";
  marketType: "new" | "used";
  condition: string | null;
  status: VehicleStatus;
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
  registrationDate: string | null;
  registrationExpiry: string | null;
  /** Arrival port while the car is in transit. */
  portLocation: string | null;
  sellingPrice: number | null;
  quantity: number;
  branch: {
    name: string;
    city: string | null;
    emirate: string | null;
    address: string | null;
    phone: string | null;
    location: string | null;
  } | null;
  contact: { name: string; phone: string | null } | null;
  photos: { id: string; url: string; category: string }[];
};

type SharedVehicleRow = {
  stock_number: string;
  vin: string | null;
  chassis_number: string | null;
  make: string;
  model: string;
  variant: string | null;
  custom_variant: string | null;
  variant_id: string | null;
  vehicle_models: { vehicle_type: string | null } | null;
  year: number;
  mileage: number;
  mileage_unit: "km" | "mi";
  market_type: string | null;
  condition: string | null;
  status: VehicleStatus;
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
  registration_date: string | null;
  registration_expiry: string | null;
  port_location: string | null;
  current_selling_price: number | string | null;
  quantity: number | null;
  branches: {
    name: string;
    city: string | null;
    emirate: string | null;
    address_line_1: string | null;
    phone: string | null;
  } | null;
  branch_locations: { name: string } | null;
};

type CatalogVariantRow = {
  name: string;
  name_ar: string | null;
  engine: string | null;
  engine_capacity: number | string | null;
  fuel_type: string | null;
  transmission: string | null;
  drivetrain: string | null;
  body_type: string | null;
  seating_capacity: number | null;
};

/**
 * The customer-facing view of a shared car, read with the service role because the viewer
 * has no session. Everything about the car itself is included; business data (costs,
 * purchase details, minimum price, internal notes, bookings) never leaves the server.
 * Cached per request so metadata and the page share one read.
 */
export const getSharedVehicle = cache(
  async (
    token: string,
  ): Promise<
    | { status: "ok"; linkId: string; vehicle: SharedVehicle }
    | { status: "unavailable" }
    | { status: "not_found" }
  > => {
    if (!TOKEN_PATTERN.test(token)) return { status: "not_found" };

    const admin = platformClient();
    const { data: link } = await admin
      .from("vehicle_share_links")
      .select("id, vehicle_id, created_by")
      .eq("token", token)
      .is("revoked_at", null)
      .maybeSingle();
    if (!link) return { status: "not_found" };
    const {
      id: linkId,
      vehicle_id,
      created_by,
    } = link as {
      id: string;
      vehicle_id: string;
      created_by: string;
    };

    const { data } = await admin
      .from("vehicles")
      .select(
        `stock_number, vin, chassis_number, make, model, variant, custom_variant, variant_id,
        vehicle_models:model_id ( vehicle_type ),
        year, mileage, mileage_unit, market_type, condition, status,
        body_type, transmission, fuel_type, drive_type, engine_size, engine_cylinders, seats, doors,
        exterior_color, interior_color, origin_type, country_of_origin,
        registration_date, registration_expiry, port_location, current_selling_price, quantity,
        branches:branch_id ( name, city, emirate, address_line_1, phone ),
        branch_locations:location_id ( name )`,
      )
      .eq("id", vehicle_id)
      .is("deleted_at", null)
      .maybeSingle();
    const row = data as unknown as SharedVehicleRow | null;
    if (!row || UNAVAILABLE.has(row.status)) return { status: "unavailable" };

    const [{ data: photoRows }, { data: profile }, { data: pricing }, { data: catalog }] =
      await Promise.all([
        admin
          .from("vehicle_photos")
          .select("id, storage_path, category")
          .eq("vehicle_id", vehicle_id)
          .order("is_primary", { ascending: false })
          .order("sort_order", { ascending: true }),
        admin
          .from("profiles")
          .select("display_name, phone, status")
          .eq("id", created_by)
          .is("deleted_at", null)
          .maybeSingle(),
        admin
          .from("vehicle_pricing")
          .select("advertised_price, target_selling_price")
          .eq("vehicle_id", vehicle_id)
          .maybeSingle(),
        row.variant_id
          ? admin
              .from("vehicle_variants")
              .select(
                "name, name_ar, engine, engine_capacity, fuel_type, transmission, drivetrain, body_type, seating_capacity",
              )
              .eq("id", row.variant_id)
              .maybeSingle()
          : Promise.resolve({ data: null }),
      ]);

    const photoList = (photoRows ?? []) as { id: string; storage_path: string; category: string }[];
    const photos: SharedVehicle["photos"] = [];
    if (photoList.length > 0) {
      const { data: signed } = await admin.storage.from("vehicle-photos").createSignedUrls(
        photoList.map((photo) => photo.storage_path),
        PHOTO_URL_TTL,
      );
      photoList.forEach((photo, index) => {
        const url = signed?.[index]?.signedUrl;
        if (url) photos.push({ id: photo.id, url, category: photo.category });
      });
    }

    // Staff who have left are not offered as a contact; the branch phone still is.
    const sharer = profile as { display_name: string; phone: string | null; status: string } | null;
    // The selling price, else the price set on the Pricing tab. Never the minimum price:
    // that is the lowest the dealership will accept, not something to show customers.
    const prices = pricing as {
      advertised_price: number | string | null;
      target_selling_price: number | string | null;
    } | null;
    const price =
      [row.current_selling_price, prices?.advertised_price, prices?.target_selling_price]
        .map((value) => (value == null ? 0 : Number(value)))
        .find((value) => value > 0) ?? null;

    // The catalog trim, then the catalog model, fill specs the record itself leaves blank.
    const trim = catalog as CatalogVariantRow | null;
    const engineFromCatalog =
      trim?.engine ?? (trim?.engine_capacity != null ? `${Number(trim.engine_capacity)}L` : null);

    return {
      status: "ok",
      linkId,
      vehicle: {
        stockNumber: row.stock_number,
        vin: row.vin,
        chassisNumber: row.chassis_number,
        make: row.make,
        model: row.model,
        variant: row.variant ?? row.custom_variant ?? trim?.name ?? null,
        variantAr: trim?.name_ar ?? null,
        year: row.year,
        mileage: row.mileage,
        mileageUnit: row.mileage_unit,
        marketType: row.market_type === "new" ? "new" : "used",
        condition: row.condition,
        status: row.status,
        bodyType: row.body_type ?? trim?.body_type ?? row.vehicle_models?.vehicle_type ?? null,
        transmission: row.transmission ?? trim?.transmission ?? null,
        fuelType: row.fuel_type ?? trim?.fuel_type ?? null,
        driveType: row.drive_type ?? trim?.drivetrain ?? null,
        engineSize: row.engine_size ?? engineFromCatalog,
        engineCylinders: row.engine_cylinders,
        seats: row.seats ?? trim?.seating_capacity ?? null,
        doors: row.doors,
        exteriorColor: row.exterior_color,
        interiorColor: row.interior_color,
        originType: row.origin_type,
        countryOfOrigin: row.country_of_origin,
        registrationDate: row.registration_date,
        registrationExpiry: row.registration_expiry,
        portLocation: row.status === "acquired" ? row.port_location : null,
        sellingPrice: price,
        quantity: row.quantity ?? 1,
        branch: row.branches
          ? {
              name: row.branches.name,
              city: row.branches.city,
              emirate: row.branches.emirate,
              address: row.branches.address_line_1,
              phone: row.branches.phone,
              location: row.branch_locations?.name ?? null,
            }
          : null,
        contact:
          sharer && sharer.status === "active"
            ? { name: sharer.display_name, phone: sharer.phone }
            : null,
        photos,
      },
    };
  },
);

/** What a customer won't see on the shared page, so staff can fill it in before sending. */
export function missingShareDetails(vehicle: SharedVehicle) {
  const missing: ("photos" | "price" | "specs")[] = [];
  if (vehicle.photos.length === 0) missing.push("photos");
  if (vehicle.sellingPrice == null) missing.push("price");
  const specs = [
    vehicle.bodyType,
    vehicle.transmission,
    vehicle.fuelType,
    vehicle.engineSize,
    vehicle.exteriorColor,
  ];
  if (specs.every((value) => !value)) missing.push("specs");
  return missing;
}

/** Best-effort view counter so staff can later see whether a customer opened the link. */
export async function recordShareView(linkId: string) {
  try {
    const admin = platformClient();
    const { data } = await admin
      .from("vehicle_share_links")
      .select("view_count")
      .eq("id", linkId)
      .maybeSingle();
    const count = (data as { view_count: number } | null)?.view_count ?? 0;
    await admin
      .from("vehicle_share_links")
      .update({ view_count: count + 1, last_viewed_at: new Date().toISOString() })
      .eq("id", linkId);
  } catch {
    /* best-effort */
  }
}
