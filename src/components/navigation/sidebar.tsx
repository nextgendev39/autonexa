"use client";

import { PanelLeftCloseIcon, PanelLeftOpenIcon } from "lucide-react";
import { useMemo } from "react";
import { useTranslations } from "next-intl";

import { BrandMark } from "@/components/shared/brand-mark";
import { CreateMenu } from "@/components/navigation/create-menu";
import { NavLink } from "@/components/navigation/nav-link";
import { UserMenu } from "@/components/navigation/user-menu";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { filterNavigation, navigation } from "@/config/navigation";
import { usePermission, useUserContext } from "@/hooks/use-permission";
import { cn } from "@/lib/utils";

/**
 * AutoNexa rail: sits on the shell frame beside the inset canvas. Brand and the create
 * action at the top, eyebrow-labelled groups, and the account block at the foot.
 */
export function Sidebar({ collapsed, onToggle }: { collapsed: boolean; onToggle: () => void }) {
  const t = useTranslations();
  const { can } = usePermission();
  const user = useUserContext();
  const items = useMemo(
    () =>
      filterNavigation(navigation, can, user.roles, user.canManageCatalog, user.disabledFeatures),
    [can, user.roles, user.canManageCatalog, user.disabledFeatures],
  );
  const ToggleIcon = collapsed ? PanelLeftOpenIcon : PanelLeftCloseIcon;
  const toggleLabel = collapsed ? t("nav.expand") : t("nav.collapse");

  return (
    <aside
      className={cn(
        "bg-sidebar text-sidebar-foreground relative hidden h-full shrink-0 flex-col transition-[width] duration-200 ease-(--ease-standard) lg:flex",
        collapsed ? "w-[4.25rem]" : "w-[15.5rem]",
      )}
    >
      <div
        className={cn(
          "flex h-16 shrink-0 items-center gap-2 ps-4 pe-2",
          collapsed && "flex-col justify-center px-0",
        )}
      >
        {collapsed ? null : <BrandMark showName className="[&_img]:h-8" />}
        <Tooltip>
          <TooltipTrigger
            render={
              <Button
                type="button"
                variant="ghost"
                size="icon-sm"
                className={cn(
                  "text-sidebar-foreground/55 hover:bg-sidebar-accent hover:text-sidebar-foreground",
                  !collapsed && "ms-auto",
                )}
                onClick={onToggle}
                aria-pressed={collapsed}
                aria-label={toggleLabel}
              />
            }
          >
            <ToggleIcon className="rtl:-scale-x-100" />
          </TooltipTrigger>
          <TooltipContent side="inline-end">{toggleLabel}</TooltipContent>
        </Tooltip>
      </div>

      <div className={cn("px-3 pb-3", collapsed && "px-2")}>
        <CreateMenu collapsed={collapsed} />
      </div>

      <nav
        aria-label={t("app.name")}
        className={cn("flex-1 space-y-5 overflow-y-auto px-3 pt-2 pb-4", collapsed && "px-2")}
      >
        {items.map((group) => (
          <div key={group.id} className="space-y-px">
            {group.labelKey ? (
              collapsed ? (
                <div className="bg-sidebar-border mx-auto mb-2 h-px w-5" aria-hidden />
              ) : (
                <p className="eyebrow text-sidebar-foreground/45 px-2.5 pb-1.5 text-[0.625rem]">
                  {t(group.labelKey as Parameters<typeof t>[0])}
                </p>
              )
            ) : null}
            {group.items.map((item) => (
              <NavLink key={item.href} item={item} collapsed={collapsed} />
            ))}
          </div>
        ))}
      </nav>

      <div className={cn("border-sidebar-border border-t p-2.5", collapsed && "px-2")}>
        <UserMenu user={user} variant="sidebar" collapsed={collapsed} />
      </div>
    </aside>
  );
}
