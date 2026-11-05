import { z } from "zod";

/**
 * A dealership's website settings. Parsed again on every read, not only on save: staff can write the
 * stored JSON directly through the API, so what's stored is never trusted.
 */
const text = (max: number) => z.string().trim().max(max);
const localized = (max: number) => z.object({ en: text(max).optional(), ar: text(max).optional() });
const hex = z.string().regex(/^#[0-9a-fA-F]{6}$/);
const https = z.string().trim().max(300).regex(/^https:\/\/[^\s"'<>]+$/);
const assetPath = z.string().max(200).regex(/^[0-9a-f-]{36}\/[a-zA-Z0-9._-]+$/);

export const SECTION_KEYS = ["hero", "featured", "inventory", "about", "contact"] as const;
export type SectionKey = (typeof SECTION_KEYS)[number];

export const SOCIAL_KEYS = ["instagram", "facebook", "x", "tiktok", "youtube", "linkedin"] as const;

export const storefrontConfigSchema = z.object({
  logoPath: assetPath.nullable().default(null),
  bannerPath: assetPath.nullable().default(null),
  primaryColor: hex.default("#111827"),
  accentColor: hex.default("#b8860b"),
  headline: localized(120).default({}),
  tagline: localized(240).default({}),
  about: localized(2000).default({}),
  sections: z
    .array(z.object({ key: z.enum(SECTION_KEYS), enabled: z.boolean() }))
    .max(SECTION_KEYS.length)
    .default(SECTION_KEYS.map((key) => ({ key, enabled: true }))),
  featuredStockNumbers: z.array(text(60)).max(12).default([]),
  contact: z
    .object({
      phone: text(30).optional(),
      whatsapp: text(30).optional(),
      email: z.email().max(200).optional().or(z.literal("")),
      address: localized(300).optional(),
      hours: localized(200).optional(),
    })
    .default({}),
  social: z.object(Object.fromEntries(SOCIAL_KEYS.map((key) => [key, https.optional().or(z.literal(""))]))).default({}),
  seo: z
    .object({
      title: localized(70).optional(),
      description: localized(170).optional(),
    })
    .default({}),
});

export type StorefrontConfig = z.infer<typeof storefrontConfigSchema>;

export const defaultStorefrontConfig = (): StorefrontConfig => storefrontConfigSchema.parse({});

/** What's stored, made safe to render. Files must be this dealership's own. */
export function parseStorefrontConfig(raw: unknown, ownerId: string): StorefrontConfig {
  const parsed = storefrontConfigSchema.safeParse(raw ?? {});
  const config = parsed.success ? parsed.data : defaultStorefrontConfig();
  const own = (path: string | null) => (path?.startsWith(`${ownerId}/`) ? path : null);
  return { ...config, logoPath: own(config.logoPath), bannerPath: own(config.bannerPath) };
}

export function pick(value: { en?: string; ar?: string } | undefined, locale: string) {
  if (!value) return "";
  return (locale === "ar" ? value.ar || value.en : value.en || value.ar) ?? "";
}

/** Enabled sections in the chosen order. A section left out is off. */
export function visibleSections(config: Pick<StorefrontConfig, "sections">): SectionKey[] {
  const seen = new Set<SectionKey>();
  return config.sections
    .filter((section) => {
      if (!section.enabled || seen.has(section.key)) return false;
      seen.add(section.key);
      return true;
    })
    .map((section) => section.key);
}

/** Black or white, whichever reads better on a brand colour. */
export function readableOn(color: string) {
  const channel = (start: number) => {
    const value = parseInt(color.slice(start, start + 2), 16) / 255;
    return value <= 0.03928 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
  };
  const luminance = 0.2126 * channel(1) + 0.7152 * channel(3) + 0.0722 * channel(5);
  return luminance > 0.4 ? "#000000" : "#ffffff";
}

export function assetUrl(path: string | null | undefined, supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL) {
  if (!path || !supabaseUrl) return null;
  return `${supabaseUrl.replace(/\/$/, "")}/storage/v1/object/public/storefront-assets/${path}`;
}
