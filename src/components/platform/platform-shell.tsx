"use client";

import {
  ActivityIcon,
  BadgeCheckIcon,
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
  { href: "/platform/subscriptions", key: "subscriptions", icon: CreditCardIcon, permission: "subscriptions.view" },
  { href: "/platform/plans", key: "plans", icon: LayersIcon, permission: "plans.view" },
  { href: "/platform/storefronts", key: "storefronts", icon: GlobeIcon, permission: "storefronts.view" },
  { href: "/platform/demo-requests", key: "demoRequests", icon: InboxIcon, permission: "demo_requests.view" },
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
    <div className="bg-background flex h-svh flex-col overflow-hidden">
      <header className="border-border flex h-14 shrink-0 items-center gap-3 border-b px-4 lg:px-6">
        <BrandMark />
        <span className="bg-brand-soft text-brand inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium">
          <BadgeCheckIcon className="size-3.5" aria-hidden />
          {t("nav.badge")}
        </span>
        <div className="ms-auto flex items-center gap-1">
          <span className="text-muted-foreground hidden text-sm sm:inline">
            {context.email} · {t(`roles.${context.role}`)}
          </span>
          <LanguageSwitcher compact />
          <ThemeToggle />
          <Button
            variant="ghost"
            size="icon"
            aria-label={t("nav.signOut")}
            onClick={() => void signOutClient()}
          >
            <LogOutIcon />
          </Button>
        </div>
      </header>
      <div className="flex min-h-0 flex-1 flex-col lg:flex-row">
        <nav
          aria-label={t("nav.label")}
          className="border-border flex shrink-0 gap-1 overflow-x-auto border-b p-2 lg:w-56 lg:flex-col lg:overflow-y-auto lg:border-e lg:border-b-0 lg:p-3"
        >
          {items.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              aria-current={active(item.href) ? "page" : undefined}
              className={cn(
                "text-muted-foreground hover:bg-muted hover:text-foreground flex shrink-0 items-center gap-2 rounded-md px-3 py-2 text-sm font-medium whitespace-nowrap",
                active(item.href) && "bg-muted text-foreground",
              )}
            >
              <item.icon className="size-4" aria-hidden />
              {t(`nav.${item.key}`)}
            </Link>
          ))}
        </nav>
        <main id="main" className="mx-auto min-h-0 w-full max-w-[1400px] flex-1 overflow-y-auto px-4 py-6 md:px-6 lg:px-8">
          {children}
        </main>
      </div>
    </div>
  );
}
