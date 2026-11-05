import "server-only";

import webpush from "web-push";

import { platformClient } from "@/lib/server/privileged";

export type PushPayload = {
  title: string;
  body: string;
  /** App path opened when the notification is clicked. */
  url: string;
  /** Notifications with the same tag replace each other on the device. */
  tag?: string;
  /** Buttons on the notification; any of them opens `url`. Not every browser shows them. */
  actions?: { action: string; title: string }[];
};

let configured: boolean | null = null;

/** Web push needs a VAPID key pair; without one, pushes are skipped (in-app alerts still work). */
export function isPushConfigured() {
  if (configured !== null) return configured;
  const publicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY?.trim();
  const privateKey = process.env.VAPID_PRIVATE_KEY?.trim();
  if (!publicKey || !privateKey) return (configured = false);
  // Apple's push service (Safari, iOS) rejects subjects that aren't mailto: or https: URLs.
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL?.trim();
  const subject =
    process.env.VAPID_SUBJECT?.trim() ||
    (siteUrl?.startsWith("https://") ? siteUrl : "") ||
    "mailto:admin@example.com";
  webpush.setVapidDetails(subject, publicKey, privateKey);
  return (configured = true);
}

/** Origin of this deployment. Subscriptions made on other sites (e.g. localhost) are skipped. */
function siteOrigin() {
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL?.trim() || "http://localhost:3003";
  try {
    return new URL(siteUrl).origin;
  } catch {
    return siteUrl;
  }
}

/**
 * Sends a push to every browser the users subscribed from on this site. Dead subscriptions
 * are removed.
 * Returns false when a delivery failed for a reason worth retrying (e.g. network error).
 */
export async function sendPushToUsers(userIds: string[], payload: PushPayload) {
  if (userIds.length === 0 || !isPushConfigured()) return true;
  const admin = platformClient();
  const { data } = await admin
    .from("push_subscriptions")
    .select("id, endpoint, p256dh, auth")
    .in("user_id", userIds)
    .eq("origin", siteOrigin());
  const subscriptions = (data ?? []) as {
    id: string;
    endpoint: string;
    p256dh: string;
    auth: string;
  }[];

  const body = JSON.stringify(payload);
  const gone: string[] = [];
  let delivered = true;
  await Promise.all(
    subscriptions.map(async (sub) => {
      try {
        await webpush.sendNotification(
          { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
          body,
          // High urgency so phones on battery saver deliver it right away.
          { TTL: 60 * 60 * 24, urgency: "high" },
        );
      } catch (error) {
        const status = (error as { statusCode?: number }).statusCode;
        if (status === 404 || status === 410) gone.push(sub.id);
        else {
          delivered = false;
          console.error("[push] delivery failed", status ?? error);
        }
      }
    }),
  );
  if (gone.length > 0) await admin.from("push_subscriptions").delete().in("id", gone);
  return delivered;
}
