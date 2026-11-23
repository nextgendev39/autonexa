"use client";

import { EllipsisIcon, PlusIcon } from "lucide-react";
import { useMemo, useState } from "react";
import { useTranslations } from "next-intl";

import { NavLink } from "@/components/navigation/nav-link";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { filterNavigation, isNavItemActive, navigation } from "@/config/navigation";
import { quickActions } from "@/config/routes";
import { usePermission } from "@/hooks/use-permission";
import { Link, usePathname } from "@/lib/i18n/navigation";
import { cn } from "@/lib/utils";

export function MobileNav() {
  const t = useTranslations();
  const pathname = usePathname();
  const { can, user } = usePermission();
  const [moreOpen, setMoreOpen] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);
  const filtered = useMemo(
    () =>
      filterNavigation(navigation, can, user.roles, user.canManageCatalog, user.disabledFeatures),
    [can, user.roles, user.canManageCatalog, user.disabledFeatures],
  );
  const allowedQuickActions = useMemo(
    () => quickActions.filter((action) => can(action.permission)),
    [can],
  );

  const home = filtered.find((group) => group.id === "overview")?.items[0];
  const cars = filtered
    .find((group) => group.id === "operations")
    ?.items.find((item) => item.href === "/inventory");
  const bookings = filtered
    .find((group) => group.id === "operations")
    ?.items.find((item) => item.href === "/bookings");

  const slots = [
    home ? { item: home, label: t("nav.home") } : null,
    cars ? { item: cars, label: t("nav.cars") } : null,
  ].filter((slot) => slot !== null);

  return (
    <>
      <nav
        aria-label={t("nav.more")}
        className="brand-dark-scope text-sidebar-foreground fixed inset-x-3 z-40 rounded-2xl bg-[#111318]/95 px-1.5 py-1.5 shadow-[0_12px_32px_-12px_rgb(0_0_0/0.55)] ring-1 ring-white/10 backdrop-blur-lg lg:hidden"
        style={{ bottom: "calc(0.75rem + env(safe-area-inset-bottom))" }}
      >
        <ul className="grid grid-cols-5 items-center">
          {slots[0] ? (
            <MobileSlot item={slots[0].item} label={slots[0].label} pathname={pathname} />
          ) : null}
          {slots[1] ? (
            <MobileSlot item={slots[1].item} label={slots[1].label} pathname={pathname} />
          ) : null}
          <li className="flex justify-center">
            <button
              type="button"
              className="gradient-champagne text-gold-foreground focus-visible:ring-sidebar-ring flex size-12 items-center justify-center rounded-xl transition-transform duration-150 outline-none focus-visible:ring-2 active:scale-95"
              onClick={() => setCreateOpen(true)}
              aria-label={t("quick.title")}
            >
              <PlusIcon className="size-5" />
            </button>
          </li>
          {bookings ? (
            <MobileSlot
              item={bookings}
              label={t(bookings.labelKey as Parameters<typeof t>[0])}
              pathname={pathname}
            />
          ) : null}
          <li>
            <button
              type="button"
              className={cn(
                "group focus-visible:ring-sidebar-ring flex w-full flex-col items-center gap-0.5 rounded-xl px-0.5 py-1.5 text-[0.625rem] font-medium outline-none focus-visible:ring-2",
                moreOpen ? "text-sidebar-primary" : "text-sidebar-foreground/55",
              )}
              onClick={() => setMoreOpen(true)}
            >
              <span className="flex h-6 items-center justify-center">
                <EllipsisIcon className="size-5" aria-hidden />
              </span>
              {t("nav.more")}
            </button>
          </li>
        </ul>
      </nav>

      <Sheet open={moreOpen} onOpenChange={setMoreOpen}>
        <SheetContent side="bottom" className="max-h-[80svh] rounded-t-2xl">
          <SheetHeader>
            <SheetTitle>{t("nav.more")}</SheetTitle>
            <SheetDescription>{t("app.name")}</SheetDescription>
          </SheetHeader>
          <div className="space-y-4 overflow-y-auto px-4 pb-6">
            {filtered.map((group) => (
              <div key={group.id} className="space-y-1">
                {group.labelKey ? (
                  <p className="eyebrow px-3 pb-1">
                    {t(group.labelKey as Parameters<typeof t>[0])}
                  </p>
                ) : null}
                {group.items.map((item) => (
                  <NavLink
                    key={item.href}
                    item={item}
                    tone="surface"
                    onNavigate={() => setMoreOpen(false)}
                  />
                ))}
              </div>
            ))}
          </div>
        </SheetContent>
      </Sheet>

      <Sheet open={createOpen} onOpenChange={setCreateOpen}>
        <SheetContent side="bottom" className="rounded-t-2xl">
          <SheetHeader>
            <SheetTitle>{t("quick.title")}</SheetTitle>
            <SheetDescription>{t("quick.description")}</SheetDescription>
          </SheetHeader>
          <ul className="grid grid-cols-2 gap-3 px-4 pb-[calc(1.5rem+env(safe-area-inset-bottom))] [--stagger:50ms]">
            {allowedQuickActions.map((action) => (
              <li key={action.href}>
                <Link
                  href={action.href}
                  onClick={() => setCreateOpen(false)}
                  className="bg-card hover:border-brand/40 focus-visible:ring-ring flex flex-col items-start gap-3 rounded-xl border p-4 text-sm font-medium transition-colors duration-150 outline-none focus-visible:ring-2 active:scale-[0.98]"
                >
                  <span className="bg-brand-soft text-brand flex size-10 items-center justify-center rounded-lg">
                    <action.icon className="size-5" aria-hidden />
                  </span>
                  {t(action.labelKey as Parameters<typeof t>[0])}
                </Link>
              </li>
            ))}
          </ul>
        </SheetContent>
      </Sheet>
    </>
  );
}

function MobileSlot({
  item,
  label,
  pathname,
}: {
  item: { href: string; icon: NavItemIcon };
  label: string;
  pathname: string;
}) {
  const active = isNavItemActive(pathname, item.href);
  const Icon = item.icon;
  return (
    <li>
      <Link
        href={item.href}
        aria-current={active ? "page" : undefined}
        className={cn(
          "focus-visible:ring-sidebar-ring relative flex flex-col items-center gap-0.5 rounded-xl px-0.5 py-1.5 text-[0.625rem] font-medium transition-colors outline-none focus-visible:ring-2",
          active ? "text-sidebar-primary bg-white/6" : "text-sidebar-foreground/55",
        )}
      >
        <span className="flex h-6 items-center justify-center">
          <Icon className="size-5" aria-hidden />
        </span>
        <span className="max-w-full truncate">{label}</span>
      </Link>
    </li>
  );
}

type NavItemIcon = (typeof navigation)[number]["items"][number]["icon"];
