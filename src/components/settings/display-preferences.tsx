"use client";

import { useSyncExternalStore } from "react";
import { MonitorIcon, MoonIcon, SunIcon } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { useTheme } from "next-themes";

import { appConfig, isAppLocale, type AppLocale } from "@/config/app";
import { usePathname, useRouter } from "@/lib/i18n/navigation";
import { cn } from "@/lib/utils";

type Option<T extends string> = { value: T; label: string; icon?: React.ComponentType<{ className?: string }> };

/** A row of choices with the current one highlighted. */
function Segmented<T extends string>({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: T | null;
  options: Option<T>[];
  onChange: (value: T) => void;
}) {
  return (
    <div role="radiogroup" aria-label={label} className="bg-muted inline-flex w-full rounded-lg p-1 sm:w-auto">
      {options.map((option) => {
        const Icon = option.icon;
        const selected = option.value === value;
        return (
          <button
            key={option.value}
            type="button"
            role="radio"
            aria-checked={selected}
            onClick={() => onChange(option.value)}
            className={cn(
              "focus-visible:ring-ring/50 flex h-8 flex-1 items-center justify-center gap-1.5 rounded-md px-3 text-sm font-medium transition-colors outline-none focus-visible:ring-3 sm:flex-none",
              selected
                ? "bg-background text-foreground shadow-xs"
                : "text-muted-foreground hover:text-foreground",
            )}
          >
            {Icon ? <Icon className="size-4" /> : null}
            {option.label}
          </button>
        );
      })}
    </div>
  );
}

const subscribeNoop = () => () => {};

/** Theme and language for this user, as visible choices. */
export function DisplayPreferences() {
  const t = useTranslations();
  const { theme, setTheme } = useTheme();
  // The stored theme is only known in the browser; render no selection on the server.
  const mounted = useSyncExternalStore(subscribeNoop, () => true, () => false);

  const localeValue = useLocale();
  const locale: AppLocale = isAppLocale(localeValue) ? localeValue : appConfig.defaultLocale;
  const pathname = usePathname();
  const router = useRouter();

  return (
    <div className="divide-y">
      <PreferenceRow title={t("settings.appearance")} hint={t("settings.appearanceHint")}>
        <Segmented
          label={t("settings.appearance")}
          value={mounted ? ((theme ?? "system") as "light" | "dark" | "system") : null}
          onChange={setTheme}
          options={[
            { value: "light", label: t("common.themeLight"), icon: SunIcon },
            { value: "dark", label: t("common.themeDark"), icon: MoonIcon },
            { value: "system", label: t("common.themeSystem"), icon: MonitorIcon },
          ]}
        />
      </PreferenceRow>
      <PreferenceRow title={t("settings.language")} hint={t("settings.languageHint")}>
        <Segmented
          label={t("settings.language")}
          value={locale}
          onChange={(next) => {
            if (next !== locale) router.replace(pathname, { locale: next });
          }}
          options={appConfig.supportedLocales.map((item) => ({
            value: item,
            label: appConfig.localeLabels[item],
          }))}
        />
      </PreferenceRow>
    </div>
  );
}

function PreferenceRow({ title, hint, children }: { title: string; hint: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-3 py-4 first:pt-0 last:pb-0 sm:flex-row sm:items-center sm:justify-between sm:gap-6">
      <div className="grid gap-0.5">
        <p className="text-sm font-medium">{title}</p>
        <p className="text-muted-foreground text-sm">{hint}</p>
      </div>
      {children}
    </div>
  );
}
