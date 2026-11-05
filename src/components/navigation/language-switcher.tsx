"use client";

import { LanguagesIcon } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";

import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { appConfig, isAppLocale, type AppLocale } from "@/config/app";
import { usePathname, useRouter } from "@/lib/i18n/navigation";

export function LanguageSwitcher({ compact = false }: { compact?: boolean }) {
  const t = useTranslations();
  const localeValue = useLocale();
  const locale: AppLocale = isAppLocale(localeValue) ? localeValue : appConfig.defaultLocale;
  const pathname = usePathname();
  const router = useRouter();

  function select(next: AppLocale) {
    router.replace(pathname, { locale: next });
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <Button variant="ghost" size={compact ? "icon" : "sm"} aria-label={t("common.language")} />
        }
      >
        <LanguagesIcon />
        {compact ? null : <span className="hidden lg:inline">{appConfig.localeLabels[locale]}</span>}
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        {appConfig.supportedLocales.map((item) => (
          <DropdownMenuItem key={item} onClick={() => select(item)}>
            {appConfig.localeLabels[item]}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
