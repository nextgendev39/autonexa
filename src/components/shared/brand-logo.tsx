import { cn } from "@/lib/utils";

/** Brands with a logo in public/brand-logos/<slug>.png (others get a lettered tile). */
const LOGOS = new Set([
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

/** "Mercedes-Benz" -> "mercedes-benz", "Land Rover" -> "land-rover". */
export function brandSlug(name: string) {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

/**
 * A brand's logo on a small white tile (the logos are dark artwork, so the tile keeps
 * them readable in dark mode). Brands without a logo show their initials instead.
 */
export function BrandLogo({ name, className }: { name: string; className?: string }) {
  const slug = brandSlug(name);
  const tile = "flex h-5 w-7 shrink-0 items-center justify-center overflow-hidden rounded-[5px]";
  if (LOGOS.has(slug)) {
    return (
      <span className={cn(tile, "bg-white p-0.5 ring-1 ring-black/10", className)} aria-hidden>
        {/* eslint-disable-next-line @next/next/no-img-element -- tiny static asset */}
        <img
          src={`/brand-logos/${slug}.png`}
          alt=""
          width={24}
          height={16}
          loading="lazy"
          decoding="async"
          className="max-h-full max-w-full object-contain"
        />
      </span>
    );
  }
  const initials = name
    .split(/[\s-]+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join("");
  return (
    <span
      className={cn(tile, "bg-muted text-foreground/70 text-[9px] font-bold tracking-wide", className)}
      aria-hidden
    >
      {initials || "?"}
    </span>
  );
}
