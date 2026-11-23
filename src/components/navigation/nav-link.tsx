"use client";

import { useTranslations } from "next-intl";

import { isNavItemActive } from "@/config/navigation";
import { Link, usePathname } from "@/lib/i18n/navigation";
import { cn } from "@/lib/utils";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import type { NavItem } from "@/types/navigation";

export function NavLink({
  item,
  collapsed = false,
  onNavigate,
  tone = "sidebar",
}: {
  item: NavItem;
  collapsed?: boolean;
  onNavigate?: () => void;
  tone?: "sidebar" | "surface";
}) {
  const pathname = usePathname();
  const t = useTranslations();
  const active = isNavItemActive(pathname, item.href);
  const label = t(item.labelKey as Parameters<typeof t>[0]);
  const Icon = item.icon;

  const link = (
    <Link
      href={item.href}
      onClick={onNavigate}
      aria-current={active ? "page" : undefined}
      className={cn(
        "group/nav relative flex h-9 items-center gap-2.5 rounded-lg px-2.5 text-[0.8125rem] font-medium transition-[color,background-color,box-shadow] duration-150 outline-none focus-visible:ring-2",
        collapsed && "justify-center px-0",
        tone === "surface" && "h-11",
        tone === "sidebar" && "focus-visible:ring-sidebar-ring",
        tone === "surface" && "focus-visible:ring-ring",
        tone === "sidebar" &&
          (active
            ? "bg-sidebar-accent text-sidebar-accent-foreground ring-sidebar-border/70 shadow-xs ring-1 dark:ring-white/5"
            : "text-sidebar-foreground/65 hover:bg-sidebar-accent/60 hover:text-sidebar-foreground"),
        tone === "surface" &&
          (active ? "bg-brand-soft text-foreground" : "text-foreground hover:bg-muted"),
      )}
    >
      <Icon
        className={cn(
          "size-4 shrink-0 opacity-80",
          active &&
            (tone === "sidebar" ? "text-sidebar-primary opacity-100" : "text-brand opacity-100"),
        )}
        aria-hidden
      />
      <span className={cn("truncate", collapsed && "sr-only")}>{label}</span>
      {active && tone === "sidebar" ? (
        <span
          className={cn(
            "bg-sidebar-primary size-1.5 shrink-0 rounded-full",
            collapsed ? "absolute end-1 top-1" : "ms-auto",
          )}
          aria-hidden
        />
      ) : null}
    </Link>
  );

  if (!collapsed) return link;

  return (
    <Tooltip>
      <TooltipTrigger render={link} />
      <TooltipContent side="inline-end">{label}</TooltipContent>
    </Tooltip>
  );
}
