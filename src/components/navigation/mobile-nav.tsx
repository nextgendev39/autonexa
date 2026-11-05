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
  const filtered = useMemo(() => filterNavigation(navigation, can, user.roles), [can, user.roles]);
  const allowedQuickActions = useMemo(
    () => quickActions.filter((action) => can(action.permission)),
    [can],
  );

  const home = filtered.find((group) => group.id === "overview")?.items[0];
  const cars = filtered.find((group) => group.id === "operations")?.items.find(
    (item) => item.href === "/inventory",
  );
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
        className="border-border bg-background/90 fixed inset-x-0 bottom-0 z-40 border-t px-2 pt-1.5 shadow-[0_-4px_16px_-8px_hsl(var(--shadow-color)/0.12)] backdrop-blur-lg lg:hidden"
        style={{ paddingBottom: "calc(0.4rem + env(safe-area-inset-bottom))" }}
      >
        <ul className="grid grid-cols-5 items-end">
          {slots[0] ? <MobileSlot item={slots[0].item} label={slots[0].label} pathname={pathname} /> : null}
          {slots[1] ? <MobileSlot item={slots[1].item} label={slots[1].label} pathname={pathname} /> : null}
          <li className="flex justify-center">
            <button
              type="button"
              className="bg-gold sheen text-brand-foreground focus-visible:ring-ring ring-background relative -mt-5 flex size-14 items-center justify-center overflow-hidden rounded-2xl shadow-[0_8px_24px_-6px_color-mix(in_oklch,var(--brand)_60%,transparent)] ring-4 outline-none transition-transform duration-300 ease-(--ease-spring) focus-visible:ring-2 active:scale-90"
              onClick={() => setCreateOpen(true)}
              aria-label={t("quick.title")}
            >
              <PlusIcon className="size-6 transition-transform duration-300" />
            </button>
          </li>
          {bookings ? <MobileSlot
              item={bookings}
              label={t(bookings.labelKey as Parameters<typeof t>[0])}
              pathname={pathname}
            /> : null}
          <li>
            <button
              type="button"
              className={cn(
                "group flex w-full flex-col items-center gap-1 rounded-lg px-1 py-1 text-[0.7rem] font-medium outline-none focus-visible:ring-2 focus-visible:ring-ring",
                moreOpen ? "text-foreground" : "text-muted-foreground",
              )}
              onClick={() => setMoreOpen(true)}
            >
              <span
                className={cn(
                  "flex h-7 w-12 items-center justify-center rounded-full transition-colors",
                  moreOpen && "bg-brand-soft",
                )}
              >
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
                  <p className="text-muted-foreground px-3 text-[0.6875rem] font-semibold tracking-[0.08em] uppercase">
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
          <ul className="stagger grid grid-cols-2 gap-3 px-4 pb-[calc(1.5rem+env(safe-area-inset-bottom))] [--stagger:50ms]">
            {allowedQuickActions.map((action) => (
              <li key={action.href}>
                <Link
                  href={action.href}
                  onClick={() => setCreateOpen(false)}
                  className="bg-card hover:border-brand/40 focus-visible:ring-ring flex flex-col items-start gap-3 rounded-xl border p-4 text-sm font-medium shadow-xs outline-none transition-all duration-200 hover:-translate-y-0.5 hover:shadow-md focus-visible:ring-2 active:scale-[0.97]"
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
          "flex flex-col items-center gap-1 rounded-lg px-1 py-1 text-[0.7rem] font-medium outline-none focus-visible:ring-2 focus-visible:ring-ring",
          active ? "text-foreground font-semibold" : "text-muted-foreground",
        )}
      >
        <span
          className={cn(
            "flex h-7 w-12 items-center justify-center rounded-full transition-colors",
            active && "bg-brand-soft text-brand animate-pop",
          )}
        >
          <Icon className="size-5" aria-hidden />
        </span>
        {label}
      </Link>
    </li>
  );
}

type NavItemIcon = (typeof navigation)[number]["items"][number]["icon"];
