import { hasLocale } from "next-intl";
import { getRequestConfig } from "next-intl/server";

import { appConfig } from "@/config/app";
import { routing } from "@/lib/i18n/routing";

export default getRequestConfig(async ({ requestLocale }) => {
  const requested = await requestLocale;
  const locale = hasLocale(routing.locales, requested) ? requested : routing.defaultLocale;

  return {
    locale,
    timeZone: appConfig.timezone,
    messages: (await import(`../../../messages/${locale}.json`)).default,
  };
});
