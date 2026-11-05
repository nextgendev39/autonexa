export const appConfig = {
  name: "AutoNexa",
  shortName: "AutoNexa",
  description: "Used car dealership management for the UAE.",
  currency: "AED",
  defaultLocale: "en",
  supportedLocales: ["en", "ar"],
  localeLabels: {
    en: "English",
    ar: "العربية",
  },
  timezone: "Asia/Dubai",
  phone: {
    countryCode: "971",
    dialCode: "+971",
  },
  direction: {
    en: "ltr",
    ar: "rtl",
  },
} as const;

export type AppLocale = (typeof appConfig.supportedLocales)[number];

export function isAppLocale(value: string): value is AppLocale {
  return appConfig.supportedLocales.some((locale) => locale === value);
}

export function directionFor(locale: AppLocale) {
  return appConfig.direction[locale];
}
