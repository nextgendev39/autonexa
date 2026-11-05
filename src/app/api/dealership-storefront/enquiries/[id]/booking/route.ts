import { jsonError, jsonOk, planFeatureGate, readJsonBody, requireApiUser } from "@/lib/api/http";
import { confirmBookingRequest } from "@/lib/storefront/manage";
import { confirmBookingSchema } from "@/lib/validation/storefront";

type RouteContext = { params: Promise<{ id: string }> };

/** Staff turn a website request into a real booking, under every existing booking rule. */
export async function POST(request: Request, { params }: RouteContext) {
  const auth = await requireApiUser("reservation.create");
  if ("response" in auth) return auth.response;
  const offPlan = planFeatureGate(auth.context, "bookings");
  if (offPlan) return offPlan;
  const parsed = confirmBookingSchema.safeParse(await readJsonBody(request));
  if (!parsed.success) return jsonError("validation", "Please correct the highlighted fields.", 400);
  const { id } = await params;
  const { error } = await confirmBookingRequest(id, parsed.data, auth.context);
  if (error) return jsonError(error.code, error.message, error.status);
  return jsonOk({ ok: true });
}
