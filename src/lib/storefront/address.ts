/** Set by the host's edge, so usable for limits. Spoofable off-platform, which overall caps cover. */
export function clientAddress(store: { get(name: string): string | null }) {
  return store.get("x-forwarded-for")?.split(",")[0]?.trim() || store.get("x-real-ip")?.trim() || "unknown";
}
