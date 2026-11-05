"use client";

export type PushState = "unsupported" | "unconfigured" | "default" | "denied" | "subscribed";

const vapidPublicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY?.trim() ?? "";

function urlBase64ToUint8Array(base64: string) {
  const padded = (base64 + "=".repeat((4 - (base64.length % 4)) % 4))
    .replace(/-/g, "+")
    .replace(/_/g, "/");
  const raw = atob(padded);
  return Uint8Array.from(raw, (c) => c.charCodeAt(0));
}

function supported() {
  return (
    typeof window !== "undefined" &&
    "serviceWorker" in navigator &&
    "PushManager" in window &&
    "Notification" in window
  );
}

async function registration() {
  return (
    (await navigator.serviceWorker.getRegistration("/")) ??
    navigator.serviceWorker.register("/sw.js")
  );
}

async function saveSubscription(subscription: PushSubscription) {
  const json = subscription.toJSON();
  const res = await fetch("/api/push/subscription", {
    method: "POST",
    credentials: "same-origin",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ endpoint: json.endpoint, keys: json.keys }),
  });
  if (!res.ok) throw new Error("Could not save the push subscription.");
}

/**
 * Current push state for this browser. Re-saves the subscription so the server stays in
 * sync, and, when permission was already granted (e.g. after signing out and back in),
 * subscribes again without asking.
 */
export async function getPushState(): Promise<PushState> {
  if (!supported()) return "unsupported";
  if (!vapidPublicKey) return "unconfigured";
  if (Notification.permission === "denied") return "denied";
  if (Notification.permission !== "granted") return "default";
  try {
    return await subscribe();
  } catch {
    return "default";
  }
}

async function subscribe(): Promise<PushState> {
  const reg = await registration();
  await navigator.serviceWorker.ready;
  const subscription =
    (await reg.pushManager.getSubscription()) ??
    (await reg.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(vapidPublicKey),
    }));
  await saveSubscription(subscription);
  return "subscribed";
}

/** Asks for permission (must run from a user gesture) and subscribes this browser. */
export async function enablePush(): Promise<PushState> {
  if (!supported()) return "unsupported";
  if (!vapidPublicKey) return "unconfigured";
  const permission = await Notification.requestPermission();
  if (permission !== "granted") return permission === "denied" ? "denied" : "default";
  return subscribe();
}

/** Removes this browser's subscription for the signed-in user (called before sign-out). */
export async function disablePush() {
  if (!supported()) return;
  const reg = await navigator.serviceWorker.getRegistration("/");
  const subscription = await reg?.pushManager.getSubscription();
  if (!subscription) return;
  await fetch("/api/push/subscription", {
    method: "DELETE",
    credentials: "same-origin",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ endpoint: subscription.endpoint }),
  });
  await subscription.unsubscribe();
}
