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
        "group/nav relative flex h-9 items-center gap-3 rounded-lg px-3 text-sm font-medium outline-none transition-all duration-200 focus-visible:ring-2",
        collapsed && "justify-center px-0",
        tone === "surface" && "h-11",
        tone === "sidebar" && "focus-visible:ring-sidebar-ring",
        tone === "surface" && "focus-visible:ring-ring",
        tone === "sidebar" &&
          (active
            ? "bg-linear-to-r from-sidebar-primary/15 to-sidebar-accent/60 text-sidebar-accent-foreground shadow-[inset_0_0_0_1px_color-mix(in_oklch,var(--sidebar-primary)_18%,transparent)] rtl:bg-linear-to-l"
            : "text-sidebar-foreground/70 hover:bg-sidebar-accent/60 hover:text-sidebar-accent-foreground"),
        tone === "surface" &&
          (active ? "bg-brand-soft text-foreground" : "text-foreground hover:bg-muted"),
      )}
    >
      {active && tone === "sidebar" ? (
        <span
          className={cn(
            "bg-gold animate-grow-y absolute inset-y-1.5 w-1 rounded-e-full shadow-[0_0_12px_2px_color-mix(in_oklch,var(--sidebar-primary)_55%,transparent)]",
            collapsed ? "-start-2.5" : "-start-3",
          )}
          aria-hidden
        />
      ) : null}
      <Icon
        className={cn(
          "size-[1.125rem] shrink-0 transition-transform duration-300 ease-(--ease-spring) group-hover/nav:scale-110",
          active &&
            (tone === "sidebar"
              ? "text-sidebar-primary drop-shadow-[0_0_6px_color-mix(in_oklch,var(--sidebar-primary)_60%,transparent)]"
              : "text-brand"),
        )}
        aria-hidden
      />
      <span className={cn("truncate", collapsed && "sr-only")}>{label}</span>
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
