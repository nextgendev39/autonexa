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

/** Desktop counterpart to the mobile nav's floating "+" button; lives at the top of the sidebar. */
export function CreateMenu({ collapsed = false }: { collapsed?: boolean }) {
  const t = useTranslations();
  const { can } = usePermission();
  const actions = useMemo(() => quickActions.filter((action) => can(action.permission)), [can]);

  if (actions.length === 0) return null;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <Button
            variant="brand"
            size={collapsed ? "icon" : "default"}
            className={collapsed ? "mx-auto" : "w-full justify-start"}
            aria-label={t("quick.title")}
          />
        }
      >
        <PlusIcon />
        {collapsed ? null : t("quick.title")}
      </DropdownMenuTrigger>
      <DropdownMenuContent
        align="start"
        side={collapsed ? "inline-end" : "bottom"}
        className="w-56"
      >
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
