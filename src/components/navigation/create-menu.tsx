"use client";

import { PlusIcon } from "lucide-react";
import { useMemo } from "react";
import { useTranslations } from "next-intl";

import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { quickActions } from "@/config/routes";
import { usePermission } from "@/hooks/use-permission";
import { Link } from "@/lib/i18n/navigation";

/** Desktop counterpart to the mobile nav's floating "+" button. */
export function CreateMenu() {
  const t = useTranslations();
  const { can } = usePermission();
  const actions = useMemo(() => quickActions.filter((action) => can(action.permission)), [can]);

  if (actions.length === 0) return null;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger render={<Button variant="brand" className="hidden md:inline-flex" />}>
        <PlusIcon />
        {t("quick.title")}
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-56">
        <DropdownMenuGroup>
          <DropdownMenuLabel>{t("quick.description")}</DropdownMenuLabel>
          {actions.map((action) => (
            <DropdownMenuItem
              key={action.href}
              nativeButton={false}
              render={<Link href={action.href} />}
            >
              <action.icon />
              {t(action.labelKey)}
            </DropdownMenuItem>
          ))}
        </DropdownMenuGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
