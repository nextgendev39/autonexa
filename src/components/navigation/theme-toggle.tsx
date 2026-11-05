"use client";

import { MonitorIcon, MoonIcon, SunIcon } from "lucide-react";
import { useTranslations } from "next-intl";
import { useTheme } from "next-themes";

import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

const themes = [
  { id: "light", labelKey: "common.themeLight", icon: SunIcon },
  { id: "dark", labelKey: "common.themeDark", icon: MoonIcon },
  { id: "system", labelKey: "common.themeSystem", icon: MonitorIcon },
] as const;

export function ThemeToggle() {
  const t = useTranslations();
  const { setTheme } = useTheme();

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={<Button variant="ghost" size="icon" aria-label={t("common.theme")} />}
      >
        <SunIcon className="dark:hidden" />
        <MoonIcon className="hidden dark:block" />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        {themes.map((item) => {
          const Icon = item.icon;
          return (
            <DropdownMenuItem key={item.id} onClick={() => setTheme(item.id)}>
              <Icon />
              {t(item.labelKey)}
            </DropdownMenuItem>
          );
        })}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
