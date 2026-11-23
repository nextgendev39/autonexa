"use client";

import { useTranslations } from "next-intl";

import { MobileNav } from "@/components/navigation/mobile-nav";
import { FOCUS_ROUTES } from "@/config/routes";
import { HeaderBar } from "@/components/navigation/header-bar";
import { Sidebar } from "@/components/navigation/sidebar";
import { PermissionProvider } from "@/hooks/use-permission";
import { BookingPaymentAlerts } from "@/components/notifications/booking-payment-alert";
import { PushBanner } from "@/components/notifications/push-banner";
import { NotificationProvider } from "@/components/providers/notification-provider";
import { hasPermission } from "@/lib/permissions";
import { useSidebarCollapsed } from "@/hooks/use-sidebar-collapsed";
import { usePathname } from "@/lib/i18n/navigation";
import { cn } from "@/lib/utils";
import type { UserContext } from "@/types/auth";

export function AppShell({ user, children }: { user: UserContext; children: React.ReactNode }) {
  const t = useTranslations();
  const { collapsed, toggle } = useSidebarCollapsed();
  const notificationsEnabled = hasPermission(user.permissions, "notification.view", user.roles);
  const focus = FOCUS_ROUTES.test(usePathname());

  return (
    <PermissionProvider value={user}>
      <NotificationProvider enabled={notificationsEnabled}>
        <div className="bg-background lg:bg-shell flex h-svh flex-col overflow-hidden">
          <a
            href="#main"
            className="bg-primary text-primary-foreground sr-only z-50 rounded-md px-3 py-2 focus:not-sr-only focus:absolute focus:start-4 focus:top-3"
          >
            {t("app.skip")}
          </a>
          <div className="flex min-h-0 flex-1">
            <Sidebar collapsed={collapsed} onToggle={toggle} />
            {/* The canvas: inset and rounded on desktop, full-bleed on phones. */}
            <div className="flex min-h-0 min-w-0 flex-1 flex-col lg:py-2 lg:pe-2">
              <div className="bg-background flex min-h-0 flex-1 flex-col overflow-hidden lg:rounded-2xl lg:border lg:shadow-sm">
                <HeaderBar user={user} />
                <main
                  id="main"
                  className={cn(
                    "flex min-h-0 w-full flex-1 flex-col overflow-y-auto px-4 md:px-6 lg:px-10",
                    focus
                      ? "py-0"
                      : "pt-5 pb-[calc(7rem+env(safe-area-inset-bottom))] lg:pt-8 lg:pb-12",
                  )}
                >
                  <div className="mx-auto flex w-full max-w-[1480px] flex-1 flex-col">
                    {/* Booking payment alerts stay on every page until dismissed. */}
                    <BookingPaymentAlerts />
                    {notificationsEnabled ? <PushBanner /> : null}
                    {children}
                  </div>
                </main>
              </div>
            </div>
          </div>
          {focus ? null : <MobileNav />}
        </div>
      </NotificationProvider>
    </PermissionProvider>
  );
}
