import { z } from "zod";

import { jsonError, jsonOk, readJsonBody, requireApiUser } from "@/lib/api/http";
import { currentTenantClient } from "@/lib/server/privileged";

const subscriptionSchema = z.object({
  endpoint: z.string().url().max(2000),
  keys: z.object({ p256dh: z.string().min(1).max(500), auth: z.string().min(1).max(500) }),
});

/** Saves this browser's push subscription for the signed-in user. */
export async function POST(request: Request) {
  const auth = await requireApiUser("notification.view");
  if ("response" in auth) return auth.response;

  const parsed = subscriptionSchema.safeParse(await readJsonBody(request));
  if (!parsed.success) return jsonError("validation", "Invalid subscription.", 400);

  // An endpoint belongs to one browser; whoever signed in there last receives its pushes.
  const { error } = await (await currentTenantClient())
    .from("push_subscriptions")
    .upsert(
      {
        user_id: auth.context.userId,
        endpoint: parsed.data.endpoint,
        p256dh: parsed.data.keys.p256dh,
        auth: parsed.data.keys.auth,
        user_agent: request.headers.get("user-agent")?.slice(0, 500) ?? null,
        // The site this browser subscribed on; pushes are only sent from the same site.
        origin: request.headers.get("origin") ?? new URL(request.url).origin,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "endpoint" },
    );
  if (error) return jsonError("db_error", error.message, 500);
  return jsonOk({ ok: true });
}

export async function DELETE(request: Request) {
  const auth = await requireApiUser();
  if ("response" in auth) return auth.response;

  const parsed = z.object({ endpoint: z.string().url() }).safeParse(await readJsonBody(request));
  if (!parsed.success) return jsonError("validation", "Invalid subscription.", 400);

  await (await currentTenantClient())
    .from("push_subscriptions")
    .delete()
    .eq("endpoint", parsed.data.endpoint)
    .eq("user_id", auth.context.userId);
  return jsonOk({ ok: true });
}
