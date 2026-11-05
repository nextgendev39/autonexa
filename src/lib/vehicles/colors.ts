/** Common vehicle paint / trim colours used in UAE dealership inventory. */
export type VehicleColorOption = {
  name: string;
  hex: string;
};

export const VEHICLE_COLORS: VehicleColorOption[] = [
  { name: "White", hex: "#F4F4F5" },
  { name: "Pearl White", hex: "#F8F5EE" },
  { name: "Ivory", hex: "#FFFFF0" },
  { name: "Beige", hex: "#D8C3A5" },
  { name: "Cream", hex: "#F5E6C8" },
  { name: "Silver", hex: "#C0C0C0" },
  { name: "Grey", hex: "#8A8A8A" },
  { name: "Dark Grey", hex: "#4A4A4A" },
  { name: "Black", hex: "#1A1A1A" },
  { name: "Blue", hex: "#2563EB" },
  { name: "Dark Blue", hex: "#1E3A5F" },
  { name: "Light Blue", hex: "#7DD3FC" },
  { name: "Red", hex: "#DC2626" },
  { name: "Maroon", hex: "#7F1D1D" },
  { name: "Burgundy", hex: "#6B1E3A" },
  { name: "Orange", hex: "#EA580C" },
  { name: "Yellow", hex: "#EAB308" },
  { name: "Gold", hex: "#C9A227" },
  { name: "Bronze", hex: "#A67C52" },
  { name: "Brown", hex: "#6B4423" },
  { name: "Green", hex: "#16A34A" },
  { name: "Dark Green", hex: "#14532D" },
  { name: "Purple", hex: "#7C3AED" },
  { name: "Pink", hex: "#EC4899" },
];

const byName = new Map(VEHICLE_COLORS.map((color) => [color.name.toLowerCase(), color]));

export function findVehicleColor(name: string | null | undefined): VehicleColorOption | undefined {
  if (!name?.trim()) return undefined;
  return byName.get(name.trim().toLowerCase());
}

/** Hex for known names; pass-through for `#rgb` / `#rrggbb`; otherwise null. */
export function resolveColorHex(value: string | null | undefined): string | null {
  if (!value?.trim()) return null;
  const trimmed = value.trim();
  const known = findVehicleColor(trimmed);
  if (known) return known.hex;
  if (/^#([0-9A-Fa-f]{3}|[0-9A-Fa-f]{6})$/.test(trimmed)) return trimmed;
  return null;
}
