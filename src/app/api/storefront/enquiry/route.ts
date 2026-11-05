import { headers } from "next/headers";

import { jsonError, jsonOk, readJsonBody } from "@/lib/api/http";
import { deliverPendingPushes } from "@/lib/notifications/service";
import { submitEnquiry } from "@/lib/server/privileged/storefront";
import { normalizeHost } from "@/lib/storefront/host";
import { siteClient, siteFromRequest, siteVisitorHash, withinEnquiryLimits } from "@/lib/storefront/site";
import { getPublicVehicle } from "@/lib/storefront/vehicles";
import { firstFieldErrors } from "@/lib/validation";
import { enquirySchema } from "@/lib/validation/storefront";
import { after } from "next/server";

/**
 * Enquiries and booking requests from a dealership's website. The dealership comes from the host and
 * nothing in the body can change it. The answer is the same whether or not the phone number is
 * already a customer, so this can't be used to find out who buys where.
 */
export async function POST(request: Request) {
  const site = await siteFromRequest(request);
  if (!site) return jsonError("not_found", "Not found.", 404);

  // A form on another site can't post here using a visitor's browser.
  const origin = request.headers.get("origin");
  try {
    if (!origin || normalizeHost(new URL(origin).host) !== normalizeHost(request.headers.get("host"))) {
      return jsonError("forbidden", "Forbidden.", 403);
    }
  } catch {
    return jsonError("forbidden", "Forbidden.", 403);
  }

  const parsed = enquirySchema.safeParse(await readJsonBody(request));
  if (!parsed.success) {
    return jsonError("validation", "Please correct the highlighted fields.", 400, {
      fieldErrors: firstFieldErrors(parsed.error),
    });
  }
  const values = parsed.data;

  // Looks like success, so a bot learns nothing and doesn't adapt.
  if (values.website) return jsonOk({ ok: true });

  const store = await headers();
  if (!(await withinEnquiryLimits(site, store))) return jsonError("rate_limited", "Too many requests. Please try again later.", 429);

  if (values.kind === "booking_request" && !site.bookingEnabled) {
    return jsonError("not_available", "This car can't be requested online.", 409);
  }

  let vehicleId: string | null = null;
  if (values.stockNumber) {
    const found = await getPublicVehicle(siteClient(site), values.stockNumber);
    if (!found) return jsonError("not_available", "This car is no longer available.", 409);
    vehicleId = found.id;
  }

  const { error } = await submitEnquiry({
    site,
    vehicleId,
    kind: values.kind,
    firstName: values.firstName,
    lastName: values.lastName,
    phone: values.phone,
    email: values.email || null,
    message: values.message || null,
    locale: values.locale,
    visitorHash: siteVisitorHash(site, store),
  });
  if (error) {
    // The same answer for every reason, so visitors can't learn about minimum prices.
    if (/booking_not_eligible|vehicle_not_available/.test(error.message ?? "")) {
      return jsonError("not_available", "This car can't be requested online right now.", 409);
    }
    return jsonError("enquiry_failed", error.message ?? "Could not save the enquiry.", 500);
  }

  after(async () => {
    try {
      await deliverPendingPushes();
    } catch (cause) {
      console.error("[storefront] could not deliver pushes", cause);
    }
  });
  return jsonOk({ ok: true });
}
