import { appConfig, type AppLocale } from "@/config/app";

function intlLocale(locale: AppLocale) {
  return locale === "ar" ? "ar-AE" : "en-AE";
}

export function formatCurrency(
  amount: number,
  locale: AppLocale = appConfig.defaultLocale,
  currency: string = appConfig.currency,
) {
  return new Intl.NumberFormat(intlLocale(locale), {
    style: "currency",
    currency,
    currencyDisplay: "code",
    maximumFractionDigits: Number.isInteger(amount) ? 0 : 2,
  }).format(amount);
}

export function formatNumber(value: number, locale: AppLocale = appConfig.defaultLocale) {
  return new Intl.NumberFormat(intlLocale(locale)).format(value);
}

/** Formats a ratio (0.236 → "23.6%"). `signed` prefixes positive values with "+". */
export function formatPercent(
  ratio: number,
  locale: AppLocale = appConfig.defaultLocale,
  { signed = false }: { signed?: boolean } = {},
) {
  return new Intl.NumberFormat(intlLocale(locale), {
    style: "percent",
    maximumFractionDigits: 1,
    signDisplay: signed ? "exceptZero" : "auto",
  }).format(ratio);
}

export function parseCurrencyInput(value: string) {
  const normalized = value.replace(/[^\d.]/g, "");
  if (!normalized) return null;
  const amount = Number(normalized);
  if (!Number.isFinite(amount)) return null;
  return amount;
}
