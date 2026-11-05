"use client";

import { PanelLeftCloseIcon, PanelLeftOpenIcon } from "lucide-react";
import { useMemo } from "react";
import { useTranslations } from "next-intl";

import { BrandMark } from "@/components/shared/brand-mark";
import { NavLink } from "@/components/navigation/nav-link";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { filterNavigation, navigation } from "@/config/navigation";
import { usePermission, useUserContext } from "@/hooks/use-permission";
import { cn } from "@/lib/utils";

export function Sidebar({ collapsed, onToggle }: { collapsed: boolean; onToggle: () => void }) {
  const t = useTranslations();
  const { can } = usePermission();
  const user = useUserContext();
  const items = useMemo(() => filterNavigation(navigation, can, user.roles), [can, user.roles]);
  const name = user.displayName || user.email || t("common.account");
  const ToggleIcon = collapsed ? PanelLeftOpenIcon : PanelLeftCloseIcon;
  const toggleLabel = collapsed ? t("nav.expand") : t("nav.collapse");
  const avatar = (
    <Avatar className="ring-sidebar-border size-9 ring-1">
      {user.avatarUrl ? <AvatarImage src={user.avatarUrl} alt="" /> : null}
      <AvatarFallback className="bg-sidebar-accent text-sidebar-primary text-sm font-semibold">
        {name.slice(0, 1).toUpperCase()}
      </AvatarFallback>
    </Avatar>
  );

  return (
    <aside
      className={cn(
        "border-sidebar-border bg-carbon text-sidebar-foreground relative isolate hidden h-full shrink-0 flex-col border-e transition-[width] duration-300 ease-(--ease-out-expo) lg:flex",
        collapsed ? "w-[4.5rem]" : "w-64",
      )}
    >
      {/* Gold glow behind the logo, like showroom spotlights on the badge. */}
      <div
        className="bg-sidebar-primary/20 pointer-events-none absolute -top-16 start-1/2 -z-10 size-48 -translate-x-1/2 rounded-full blur-3xl rtl:translate-x-1/2"
        aria-hidden
      />
      <div className={cn("flex h-16 items-center gap-2 px-4", collapsed && "justify-center px-2")}>
        <BrandMark showName={!collapsed} className="text-sidebar-foreground" />
      </div>
      <div
        className="via-sidebar-primary/40 mx-4 h-px bg-linear-to-r from-transparent to-transparent"
        aria-hidden
      />
      <nav
        aria-label={t("app.name")}
        className={cn("stagger flex-1 space-y-5 overflow-y-auto px-3 pt-4 pb-4 [--stagger:40ms]", collapsed && "px-2.5")}
      >
        {items.map((group) => (
          <div key={group.id} className="space-y-0.5">
            {group.labelKey ? (
              collapsed ? (
                <div className="bg-sidebar-border mx-auto mb-2 h-px w-6" aria-hidden />
              ) : (
                <p className="text-sidebar-foreground/45 px-3 pb-1.5 text-[0.6875rem] font-semibold tracking-[0.08em] uppercase">
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
      <div
        className={cn(
          "border-sidebar-border flex items-center gap-2 border-t p-3",
          collapsed && "flex-col px-2",
        )}
      >
        {collapsed ? (
          <Tooltip>
            <TooltipTrigger
              render={<span className="rounded-full outline-none" tabIndex={0} aria-label={name} />}
            >
              {avatar}
            </TooltipTrigger>
            <TooltipContent side="inline-end">{name}</TooltipContent>
          </Tooltip>
        ) : (
          avatar
        )}
        {!collapsed ? (
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-medium">{name}</p>
            {user.email && user.displayName ? (
              <p className="text-sidebar-foreground/55 truncate text-xs">{user.email}</p>
            ) : null}
          </div>
        ) : null}
        <Tooltip>
          <TooltipTrigger
            render={
              <Button
                type="button"
                variant="ghost"
                size="icon-sm"
                className="text-sidebar-foreground/70 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground dark:hover:bg-sidebar-accent"
                onClick={onToggle}
                aria-pressed={collapsed}
                aria-label={toggleLabel}
              />
            }
          >
            <ToggleIcon className="rtl:-scale-x-100" />
          </TooltipTrigger>
          <TooltipContent side={collapsed ? "inline-end" : "top"}>{toggleLabel}</TooltipContent>
        </Tooltip>
      </div>
    </aside>
  );
}
