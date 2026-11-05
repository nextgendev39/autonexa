import { appConfig, type AppLocale } from "@/config/app";

function intlLocale(locale: AppLocale) {
  return locale === "ar" ? "ar-AE" : "en-AE";
}

const presets = {
  short: { day: "numeric", month: "short", year: "numeric" },
  medium: { day: "numeric", month: "long", year: "numeric" },
  dateTime: {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  },
  /** Date and time with the zone, e.g. "13 Oct 2026, 1:12 pm GMT+5:30". */
  dateTimeZone: {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
    timeZoneName: "short",
  },
} as const satisfies Record<string, Intl.DateTimeFormatOptions>;

export type DatePreset = keyof typeof presets;

function toDate(value: Date | string) {
  return value instanceof Date ? value : new Date(value);
}

export function formatDate(
  value: Date | string,
  locale: AppLocale = appConfig.defaultLocale,
  preset: DatePreset = "medium",
  /** Defaults to the dealership's zone; pass useViewerTimeZone() to show the viewer's own. */
  timeZone: string = appConfig.timezone,
) {
  return new Intl.DateTimeFormat(intlLocale(locale), {
    timeZone,
    ...presets[preset],
  }).format(toDate(value));
}

export function formatDateRange(
  start: Date | string,
  end: Date | string,
  locale: AppLocale = appConfig.defaultLocale,
) {
  return new Intl.DateTimeFormat(intlLocale(locale), {
    timeZone: appConfig.timezone,
    day: "numeric",
    month: "short",
    year: "numeric",
  }).formatRange(toDate(start), toDate(end));
}

export function formatRelativeTime(
  value: Date | string,
  locale: AppLocale = appConfig.defaultLocale,
  now = new Date(),
) {
  const date = toDate(value);
  const diffMs = date.getTime() - now.getTime();
  const abs = Math.abs(diffMs);
  const formatter = new Intl.RelativeTimeFormat(locale === "ar" ? "ar" : "en", {
    numeric: "auto",
  });

  if (abs < 60_000) return formatter.format(Math.round(diffMs / 1000), "second");
  if (abs < 3_600_000) return formatter.format(Math.round(diffMs / 60_000), "minute");
  if (abs < 86_400_000) return formatter.format(Math.round(diffMs / 3_600_000), "hour");
  if (abs < 86_400_000 * 30) return formatter.format(Math.round(diffMs / 86_400_000), "day");
  return formatDate(date, locale, "short");
}
