/** Human labels for stored values. Anything the dictionary doesn't know is shown as typed. */
type Translator = {
  (key: string): string;
  has: (key: string) => boolean;
};

export type ValueKind =
  | "fuel"
  | "transmission"
  | "drive"
  | "condition"
  | "body"
  | "availability"
  | "grade"
  | "originType";

export const valueKey = (value: string) =>
  value
    .trim()
    .toLowerCase()
    .replace(/[\s-]+/g, "_");

export function valueLabel(t: Translator, kind: ValueKind, value: string | null | undefined) {
  if (!value) return null;
  const key = `values.${kind}.${valueKey(value)}`;
  if (t.has(key)) return t(key);
  return value.charAt(0).toUpperCase() + value.slice(1).replace(/_/g, " ");
}

/** "Land Rover" → "land-rover", matching the files in /public/brand-logos. */
export const brandSlug = (make: string) =>
  make
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");

export const KNOWN_BRAND_LOGOS = new Set([
  "aston-martin",
  "audi",
  "bentley",
  "bestune",
  "bmw",
  "byd",
  "cadillac",
  "changan",
  "chery",
  "chevrolet",
  "chrysler",
  "dodge",
  "exeed",
  "ferrari",
  "ford",
  "geely",
  "genesis",
  "gmc",
  "haval",
  "honda",
  "hongqi",
  "hyundai",
  "infiniti",
  "isuzu",
  "jac",
  "jaguar",
  "jeep",
  "jetour",
  "kia",
  "lamborghini",
  "land-rover",
  "lexus",
  "lincoln",
  "lotus",
  "lucid",
  "maserati",
  "mazda",
  "mclaren",
  "mercedes-benz",
  "mg",
  "mini",
  "mitsubishi",
  "nissan",
  "omoda",
  "polestar",
  "porsche",
  "ram",
  "rolls-royce",
  "subaru",
  "suzuki",
  "tesla",
  "toyota",
  "volkswagen",
  "volvo",
  "zeekr",
]);

export const brandLogo = (make: string) => {
  const slug = brandSlug(make);
  return KNOWN_BRAND_LOGOS.has(slug) ? `/brand-logos/${slug}.png` : null;
};

export const whatsappLink = (number: string, text?: string) => {
  const digits = number.replace(/[^\d]/g, "");
  return `https://wa.me/${digits}${text ? `?text=${encodeURIComponent(text)}` : ""}`;
};

export const telLink = (number: string) => `tel:${number.replace(/[^\d+]/g, "")}`;

/**
 * For GET search forms: leaves empty fields out of the address, so a search reads
 * "?make=Nissan" rather than "?make=Nissan&model=&body=&…". Runs on submit, so it also
 * covers requestSubmit().
 */
export function dropEmptyFields(event: { currentTarget: HTMLFormElement }) {
  const form = event.currentTarget;
  const emptied: (HTMLInputElement | HTMLSelectElement)[] = [];
  for (const element of Array.from(form.elements)) {
    if (
      (element instanceof HTMLInputElement || element instanceof HTMLSelectElement) &&
      element.name &&
      !element.value &&
      !element.disabled
    ) {
      element.disabled = true;
      emptied.push(element);
    }
  }
  // Put them back once the browser has read the form.
  setTimeout(() => emptied.forEach((element) => (element.disabled = false)));
}
