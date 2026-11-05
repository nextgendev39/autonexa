// Vehicle pages are addressed by stock number (unique among active vehicles).
// UUID URLs still work: the page resolves them and redirects to the stock-number URL.
export function vehicleHref(stockNumber: string, suffix: "" | "/edit" = "", tab?: string) {
  const query = tab ? `?tab=${tab}` : "";
  return `/inventory/${encodeURIComponent(stockNumber)}${suffix}${query}`;
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function isUuid(value: string) {
  return UUID_RE.test(value);
}

export function decodeVehicleRef(ref: string) {
  try {
    return decodeURIComponent(ref);
  } catch {
    return ref;
  }
}
