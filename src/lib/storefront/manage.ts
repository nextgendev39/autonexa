import "server-only";

import { createBooking } from "@/lib/bookings/service";
import { listSalesExecutives, SALESPERSON_ROLES } from "@/lib/bookings/service";
import { planLimitFromError } from "@/lib/platform/limit-errors";
import { tenantClient } from "@/lib/server/privileged";
import { parseStorefrontConfig, storefrontConfigSchema, type StorefrontConfig } from "@/lib/storefront/config";
import { hostSettingsFromEnv, isReservedDomain } from "@/lib/storefront/host";
import { verifyDomain } from "@/lib/storefront/domains";
import { sniffImage } from "@/lib/storefront/image";
import { publicPrice, type PublicVehicleRow } from "@/lib/storefront/public-vehicle";
import { createClient } from "@/lib/supabase/server";
import { createBookingSchema } from "@/lib/validation/booking";
import type { UserContext } from "@/types/auth";

/**
 * What a dealership's staff do with their website. Reads and writes go through their own session,
 * so RLS applies. The dealership always comes from their session, never from the request.
 */
export type Failure = { code: string; message: string; status: number };
const fail = (code: string, message: string, status = 400): Failure => ({ code, message, status });

const fromDb = (error: { code?: string; message?: string }): Failure => {
  const planLimit = planLimitFromError(error);
  if (planLimit) return fail(planLimit.code, planLimit.message, 403);
  if (error.code === "42501") return fail("forbidden", "You do not have permission to do this.", 403);
  if (error.code === "23505") return fail("duplicate", "You've already added this.", 409);
  if (error.message === "storefront_disabled") {
    return fail("storefront_disabled", "AutoNexa has taken this website offline. Contact support.", 403);
  }
  return fail("db_error", error.message ?? "Database error", 500);
};

export type ManagedVehicle = {
  id: string;
  stockNumber: string;
  title: string;
  status: string;
  price: number | null;
  published: boolean;
};
export type ManagedDomain = {
  id: string;
  domain: string;
  is_primary: boolean;
  verification_status: "pending" | "verified" | "failed";
  ssl_status: "pending" | "active" | "failed";
  verification_token: string;
  last_checked_at: string | null;
  last_error: string | null;
};
export type ManagedEnquiry = {
  id: string;
  kind: "enquiry" | "booking_request";
  status: "new" | "contacted" | "converted" | "closed";
  first_name: string;
  last_name: string;
  phone: string;
  email: string | null;
  message: string | null;
  quoted_price: number | null;
  customer_id: string | null;
  vehicle_id: string | null;
  reservation_id: string | null;
  created_at: string;
  vehicles: { stock_number: string; year: number; make: string; model: string } | null;
};
export type Analytics = {
  visitors: number;
  pageViews: number;
  vehicleViews: number;
  enquiries: number;
  bookingRequests: number;
  conversions: number;
  topVehicles: { stockNumber: string; title: string; views: number }[];
};

export async function getStorefront(context: UserContext) {
  const supabase = await createClient();
  const { data } = await supabase
    .from("storefronts" as never)
    .select("status, draft_config, published_at, platform_disabled, platform_disabled_reason")
    .maybeSingle();
  const row = data as unknown as {
    status: "draft" | "published" | "unpublished";
    draft_config: unknown;
    published_at: string | null;
    platform_disabled: boolean;
    platform_disabled_reason: string | null;
  } | null;
  return {
    status: row?.status ?? ("draft" as const),
    publishedAt: row?.published_at ?? null,
    platformDisabled: row?.platform_disabled ?? false,
    platformDisabledReason: row?.platform_disabled_reason ?? null,
    draft: parseStorefrontConfig(row?.draft_config, context.tenantId ?? ""),
  };
}

export async function saveDraft(context: UserContext, body: unknown) {
  const parsed = storefrontConfigSchema.safeParse(body);
  if (!parsed.success) return { error: fail("validation", "Please correct the highlighted fields.") };
  // Files must be this dealership's own, or a design could point at another's.
  const owner = `${context.tenantId}/`;
  for (const path of [parsed.data.logoPath, parsed.data.bannerPath]) {
    if (path && !path.startsWith(owner)) return { error: fail("forbidden", "That file isn't yours.", 403) };
  }
  const supabase = await createClient();
  const { error } = await supabase
    .from("storefronts" as never)
    .upsert({ tenant_id: context.tenantId, draft_config: parsed.data, updated_by: context.userId } as never, {
      onConflict: "tenant_id",
    });
  return { error: error ? fromDb(error) : null };
}

export async function setPublished(action: "publish" | "unpublish") {
  const supabase = await createClient();
  const { error } = await supabase.rpc((action === "publish" ? "storefront_publish" : "storefront_unpublish") as never);
  if (error?.code === "P0002") return { error: fail("nothing_to_publish", "Save your design first.", 409) };
  return { error: error ? fromDb(error) : null };
}

const MAX_ASSET_BYTES = 5 * 1024 * 1024;

export async function uploadAsset(context: UserContext, file: File, kind: "logo" | "banner") {
  if (file.size > MAX_ASSET_BYTES) return { path: null, error: fail("too_large", "Images can be up to 5 MB.") };
  const bytes = new Uint8Array(await file.arrayBuffer());
  const image = sniffImage(bytes);
  if (!image) return { path: null, error: fail("invalid_file", "Use a JPEG, PNG or WebP image.") };
  // The server chooses the path, so a dealership can only ever write under its own folder.
  const path = `${context.tenantId}/${kind}-${crypto.randomUUID()}.${image.extension}`;
  const { error } = await tenantClient(context)
    .storage.from("storefront-assets")
    .upload(path, bytes, { contentType: image.type, upsert: false });
  if (error) return { path: null, error: fail("upload_failed", error.message, 500) };
  return { path, error: null };
}

export async function listManagedVehicles() {
  const supabase = await createClient();
  const { data } = await supabase
    .from("vehicles")
    .select(
      "id, stock_number, year, make, model, status, current_selling_price, storefront_published, vehicle_pricing ( advertised_price, target_selling_price )",
    )
    .in("status", ["ready_for_sale", "reserved"])
    .is("deleted_at", null)
    .order("created_at", { ascending: false })
    .limit(500);
  return ((data ?? []) as unknown as (Pick<PublicVehicleRow, "current_selling_price" | "vehicle_pricing"> & {
    id: string;
    stock_number: string;
    year: number;
    make: string;
    model: string;
    status: string;
    storefront_published: boolean;
  })[]).map(
    (row): ManagedVehicle => ({
      id: row.id,
      stockNumber: row.stock_number,
      title: [row.year, row.make, row.model].filter(Boolean).join(" "),
      status: row.status,
      price: publicPrice(row),
      published: row.storefront_published,
    }),
  );
}

export async function setVehicleListing(vehicleId: string, published: boolean) {
  const supabase = await createClient();
  const { error } = await supabase.rpc(
    "storefront_set_vehicle_published" as never,
    { p_vehicle_id: vehicleId, p_published: published } as never,
  );
  return { error: error ? fromDb(error) : null };
}

const DOMAIN_COLUMNS =
  "id, domain, is_primary, verification_status, ssl_status, verification_token, last_checked_at, last_error";

export async function listManagedDomains() {
  const supabase = await createClient();
  const { data } = await supabase.from("tenant_domains" as never).select(DOMAIN_COLUMNS).order("domain");
  return (data ?? []) as unknown as ManagedDomain[];
}

export async function addDomain(context: UserContext, domain: string) {
  if (isReservedDomain(domain, hostSettingsFromEnv())) {
    return { error: fail("reserved", "That domain can't be used.") };
  }
  const supabase = await createClient();
  const { error } = await supabase
    .from("tenant_domains" as never)
    .insert({ tenant_id: context.tenantId, domain } as never);
  return { error: error ? fromDb(error) : null };
}

export async function removeDomain(id: string) {
  const supabase = await createClient();
  const { error, data } = await supabase.from("tenant_domains" as never).delete().eq("id", id).select("id");
  if (error) return { error: fromDb(error) };
  return { error: data?.length ? null : fail("not_found", "Not found.", 404) };
}

/** The row comes through the session, so another dealership's domain simply isn't found. */
export async function checkDomain(id: string) {
  const supabase = await createClient();
  const { data } = await supabase
    .from("tenant_domains" as never)
    .select("id, domain, verification_token")
    .eq("id", id)
    .maybeSingle();
  const row = data as unknown as { id: string; domain: string; verification_token: string } | null;
  if (!row) return { result: null, error: fail("not_found", "Not found.", 404) };
  return { result: await verifyDomain(row), error: null };
}

export async function listEnquiries() {
  const supabase = await createClient();
  const { data } = await supabase
    .from("storefront_enquiries" as never)
    .select(
      "id, kind, status, first_name, last_name, phone, email, message, quoted_price, customer_id, vehicle_id, reservation_id, created_at, vehicles(stock_number, year, make, model)",
    )
    .order("created_at", { ascending: false })
    .limit(200);
  return (data ?? []) as unknown as ManagedEnquiry[];
}

export async function setEnquiryStatus(id: string, status: string, context: UserContext) {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("storefront_enquiries" as never)
    .update({ status, handled_by: context.userId } as never)
    .eq("id", id)
    .select("id");
  if (error) return { error: fromDb(error) };
  return { error: data?.length ? null : fail("not_found", "Not found.", 404) };
}

/**
 * Turns a website request into a real booking through the existing flow, which re-checks everything:
 * the car's status, its minimum price, an existing booking, and this person's permissions.
 */
export async function confirmBookingRequest(
  id: string,
  values: { sellingPrice: number; deposit: number; salespersonId?: string },
  context: UserContext,
) {
  const supabase = await createClient();
  const { data } = await supabase
    .from("storefront_enquiries" as never)
    .select("id, kind, status, customer_id, vehicle_id")
    .eq("id", id)
    .maybeSingle();
  const enquiry = data as unknown as {
    id: string;
    kind: string;
    status: string;
    customer_id: string | null;
    vehicle_id: string | null;
  } | null;
  if (!enquiry) return { error: fail("not_found", "Not found.", 404) };
  if (enquiry.status === "converted") return { error: fail("already_converted", "This is already a booking.", 409) };
  if (!enquiry.customer_id || !enquiry.vehicle_id) {
    return { error: fail("not_available", "The car or customer on this request no longer exists.", 409) };
  }

  const parsed = createBookingSchema.safeParse({
    vehicleId: enquiry.vehicle_id,
    customerMode: "existing",
    customerId: enquiry.customer_id,
    salespersonId: values.salespersonId,
    sellingPrice: values.sellingPrice,
    deposit: values.deposit,
    quantity: 1,
  });
  if (!parsed.success) return { error: fail("validation", "Please correct the highlighted fields.") };

  const result = await createBooking(parsed.data, context);
  if (result.error) {
    return {
      error: {
        code: result.error.code,
        message: result.error.message,
        status: result.error.code === "forbidden" ? 403 : 409,
        fieldErrors: (result.error as { fieldErrors?: Record<string, string> }).fieldErrors,
      },
    };
  }

  const { error: linkError } = await supabase
    .from("storefront_enquiries" as never)
    .update({ status: "converted", reservation_id: result.data.id, handled_by: context.userId } as never)
    .eq("id", id);
  if (linkError) console.error("[storefront] booking made, enquiry not linked", linkError.message);
  // A conversion is real business, so a failed count mustn't undo the booking.
  const { error: eventError } = await tenantClient(context)
    .from("storefront_events" as never)
    .insert({ kind: "conversion", vehicle_id: enquiry.vehicle_id } as never);
  if (eventError) console.error("[storefront] could not count conversion", eventError.message);
  return { error: null };
}

export async function getAnalytics(days = 30) {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("storefront_analytics" as never, { p_days: days } as never);
  return error ? null : ((data as unknown as Analytics | null) ?? null);
}

export const listBookingSalespeople = () => listSalesExecutives(SALESPERSON_ROLES);

export type { StorefrontConfig };
