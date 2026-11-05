import { defineRouting } from "next-intl/routing";

import { appConfig } from "@/config/app";

export const routing = defineRouting({
  locales: [...appConfig.supportedLocales],
  defaultLocale: appConfig.defaultLocale,
  localePrefix: "never",
});
