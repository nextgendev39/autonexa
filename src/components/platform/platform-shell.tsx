"use client";

import {
  ActivityIcon,
  Building2Icon,
  CreditCardIcon,
  GaugeIcon,
  GlobeIcon,
  InboxIcon,
  LayersIcon,
  LibraryIcon,
  LogOutIcon,
  ReceiptTextIcon,
  ScrollTextIcon,
  ShieldCheckIcon,
  type LucideIcon,
} from "lucide-react";
import { useTranslations } from "next-intl";

import { LanguageSwitcher } from "@/components/navigation/language-switcher";
import { ThemeToggle } from "@/components/navigation/theme-toggle";
import { BrandMark } from "@/components/shared/brand-mark";
import { Button } from "@/components/ui/button";
import { signOutClient } from "@/hooks/use-auth-submit";
import { Link, usePathname } from "@/lib/i18n/navigation";
import type { PlatformContext, PlatformPermission } from "@/lib/platform/permissions";
import { cn } from "@/lib/utils";

const NAV: { href: string; key: string; icon: LucideIcon; permission: PlatformPermission }[] = [
  { href: "/platform", key: "dashboard", icon: GaugeIcon, permission: "console.access" },
  { href: "/platform/tenants", key: "tenants", icon: Building2Icon, permission: "tenants.view" },
  {
    href: "/platform/subscriptions",
    key: "subscriptions",
    icon: CreditCardIcon,
    permission: "subscriptions.view",
  },
  { href: "/platform/plans", key: "plans", icon: LayersIcon, permission: "plans.view" },
  {
    href: "/platform/storefronts",
    key: "storefronts",
    icon: GlobeIcon,
    permission: "storefronts.view",
  },
  {
    href: "/platform/demo-requests",
    key: "demoRequests",
    icon: InboxIcon,
    permission: "demo_requests.view",
  },
  { href: "/platform/usage", key: "usage", icon: ActivityIcon, permission: "usage.view" },
  { href: "/platform/billing", key: "billing", icon: ReceiptTextIcon, permission: "billing.view" },
  { href: "/platform/catalog", key: "catalog", icon: LibraryIcon, permission: "catalog.manage" },
  { href: "/platform/admins", key: "admins", icon: ShieldCheckIcon, permission: "console.access" },
  { href: "/platform/audit-logs", key: "audit", icon: ScrollTextIcon, permission: "audit.view" },
];

export function PlatformShell({
  context,
  children,
}: {
  context: PlatformContext;
  children: React.ReactNode;
}) {
  const t = useTranslations("platform");
  const pathname = usePathname();
  const items = NAV.filter((item) => context.permissions.includes(item.permission));
  const active = (href: string) =>
    href === "/platform" ? pathname === href : pathname === href || pathname.startsWith(`${href}/`);

  return (
    <div className="bg-background lg:bg-shell flex h-svh flex-col overflow-hidden lg:flex-row">
      {/* Rail on the shell frame (desktop); a scrolling tab row on phones. */}
      <aside className="flex shrink-0 flex-col lg:w-60">
        <div className="flex h-14 items-center gap-2 px-4 lg:h-16">
          <BrandMark className="[&_img]:h-8" />
          <span className="eyebrow ms-auto lg:ms-0">{t("nav.badge")}</span>
        </div>
        <nav
          aria-label={t("nav.label")}
          className="border-divider flex shrink-0 gap-1 overflow-x-auto border-b px-3 pb-2 lg:flex-1 lg:flex-col lg:overflow-y-auto lg:border-0 lg:pt-2"
        >
          {items.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              aria-current={active(item.href) ? "page" : undefined}
              className={cn(
                "flex h-9 shrink-0 items-center gap-2.5 rounded-lg px-2.5 text-[0.8125rem] font-medium whitespace-nowrap transition-[color,background-color,box-shadow] duration-150",
                active(item.href)
                  ? "bg-sidebar-accent text-foreground ring-sidebar-border/70 shadow-xs ring-1 dark:ring-white/5"
                  : "text-muted-foreground hover:bg-sidebar-accent/60 hover:text-foreground",
              )}
            >
              <item.icon className={cn("size-4", active(item.href) && "text-brand")} aria-hidden />
              {t(`nav.${item.key}`)}
              {active(item.href) ? (
                <span
                  className="bg-brand ms-auto hidden size-1.5 rounded-full lg:block"
                  aria-hidden
                />
              ) : null}
            </Link>
          ))}
        </nav>
        <div className="border-sidebar-border hidden items-center gap-1 border-t p-3 lg:flex">
          <span className="text-muted-foreground min-w-0 flex-1 truncate text-xs">
            {context.email}
            <span className="text-subtle-foreground block">{t(`roles.${context.role}`)}</span>
          </span>
          <Button
            variant="ghost"
            size="icon-sm"
            aria-label={t("nav.signOut")}
            onClick={() => void signOutClient()}
          >
            <LogOutIcon />
          </Button>
        </div>
      </aside>
      <div className="flex min-h-0 min-w-0 flex-1 flex-col lg:py-2 lg:pe-2">
        <div className="bg-background flex min-h-0 flex-1 flex-col overflow-hidden lg:rounded-2xl lg:border lg:shadow-sm">
          <header className="border-divider flex h-14 shrink-0 items-center justify-end gap-2 border-b px-4 md:px-6 lg:px-10">
            <div className="border-border bg-card flex items-center rounded-full border p-0.5 shadow-xs [&>*>button]:size-8 [&>*>button]:rounded-full [&>button]:size-8 [&>button]:rounded-full">
              <LanguageSwitcher compact />
              <ThemeToggle />
            </div>
            <Button
              variant="ghost"
              size="icon"
              className="lg:hidden"
              aria-label={t("nav.signOut")}
              onClick={() => void signOutClient()}
            >
              <LogOutIcon />
            </Button>
          </header>
          <main
            id="main"
            className="min-h-0 flex-1 overflow-y-auto px-4 pt-6 pb-12 md:px-6 lg:px-10 lg:pt-8"
          >
            <div className="mx-auto w-full max-w-[1400px]">{children}</div>
          </main>
        </div>
      </div>
    </div>
  );
}
