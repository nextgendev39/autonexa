"use client";

import { BanknoteIcon, CalendarXIcon, ChevronRightIcon, XIcon } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";

import { PushPrompt } from "@/components/notifications/push-prompt";
import {
  BOOKING_AUTO_CANCELLED,
  BOOKING_BALANCE_OVERDUE,
  bookingVehicleLabel,
  deadlineMinutes,
} from "@/components/notifications/use-notification-text";
import { useNotifications } from "@/components/providers/notification-provider";
import { Button } from "@/components/ui/button";
import { useFormatDuration } from "@/hooks/use-format-duration";
import type { AppLocale } from "@/config/app";
import { Link } from "@/lib/i18n/navigation";
import { cn } from "@/lib/utils";
import { formatCurrency } from "@/lib/utils/currency";
import type { AppNotification, BookingPaymentData } from "@/types/notification";

const VISIBLE = 3;

/**
 * Shown on every page until dismissed:
 * - The sales executive and Super Admins: bookings cancelled because no deposit arrived in time.
 * - The sales executive and Super Admins: bookings not paid in full in time.
 */
export function BookingPaymentAlerts() {
  const { items } = useNotifications();
  const cancelled = items.filter((item) => item.type === BOOKING_AUTO_CANCELLED && !item.read);
  const overdue = items.filter((item) => item.type === BOOKING_BALANCE_OVERDUE && !item.read);
  if (cancelled.length === 0 && overdue.length === 0) return null;

  return (
    <div className="mb-5 grid gap-3">
      {cancelled.length > 0 ? <AlertGroup kind="cancelled" items={cancelled} showPush /> : null}
      {overdue.length > 0 ? <AlertGroup kind="overdue" items={overdue} showPush={cancelled.length === 0} /> : null}
    </div>
  );
}

function AlertGroup({
  kind,
  items,
  showPush,
}: {
  kind: "cancelled" | "overdue";
  items: AppNotification[];
  showPush: boolean;
}) {
  const t = useTranslations(kind === "cancelled" ? "notifications.alert" : "notifications.balanceAlert");
  const tPeople = useTranslations("notifications.alert");
  const locale = useLocale() as AppLocale;
  const { markManyRead } = useNotifications();
  const dismiss = () => markManyRead(items.map((item) => item.id));
  const formatDuration = useFormatDuration();
  const duration = formatDuration(
    deadlineMinutes(items[0].data as BookingPaymentData, kind === "cancelled" ? 3 : 7),
  );
  const Icon = kind === "cancelled" ? CalendarXIcon : BanknoteIcon;

  return (
    <div
      role="alert"
      className={cn(
        "text-foreground grid gap-3 rounded-xl border p-4 shadow-xs",
        kind === "cancelled"
          ? "border-destructive/30 bg-destructive/8"
          : "border-amber-500/35 bg-amber-500/10",
      )}
    >
      <div className="flex items-start gap-3">
        <span
          className={cn(
            "flex size-9 shrink-0 items-center justify-center rounded-full",
            kind === "cancelled"
              ? "bg-destructive/15 text-destructive"
              : "bg-amber-500/20 text-amber-700 dark:text-amber-400",
          )}
        >
          <Icon className="size-4.5" />
        </span>
        <div className="grid min-w-0 flex-1 gap-1">
          <p className="font-medium">{t("title", { count: items.length })}</p>
          <p className="text-muted-foreground text-sm">{t("description", { duration })}</p>
        </div>
        <Button variant="ghost" size="icon-sm" aria-label={tPeople("dismiss")} onClick={dismiss}>
          <XIcon />
        </Button>
      </div>

      <ul className="grid gap-1.5 text-sm sm:ps-12">
        {items.slice(0, VISIBLE).map((item) => {
          const data = item.data as BookingPaymentData;
          return (
            <li key={item.id}>
              <Link
                href={item.href}
                onClick={() => markManyRead([item.id])}
                className="group/row bg-background/70 hover:border-foreground/20 flex flex-wrap items-center gap-x-2 gap-y-0.5 rounded-lg border px-3 py-2 transition-colors"
              >
                <span className="font-mono text-xs leading-5 font-medium">{data.bookingNumber}</span>
                <span className="font-medium">{bookingVehicleLabel(data)}</span>
                <span className="text-muted-foreground">
                  {tPeople("people", {
                    customer: data.customerName ?? "—",
                    salesperson: data.salespersonName ?? "—",
                  })}
                </span>
                {kind === "overdue" && data.outstanding != null ? (
                  <span className="font-medium text-amber-700 dark:text-amber-400">
                    {t("outstanding", {
                      amount: formatCurrency(data.outstanding, locale, data.currency ?? "AED"),
                    })}
                  </span>
                ) : null}
                <span className="text-brand ms-auto inline-flex items-center gap-1 text-xs font-medium group-hover/row:underline">
                  {tPeople("view")}
                  <ChevronRightIcon className="size-3.5 rtl:rotate-180" aria-hidden />
                </span>
              </Link>
            </li>
          );
        })}
        {items.length > VISIBLE ? (
          <li className="text-muted-foreground text-xs">{tPeople("more", { count: items.length - VISIBLE })}</li>
        ) : null}
      </ul>

      <div className="flex flex-wrap items-center gap-2 sm:ps-12">
        {/* One booking: open its booking screen. Several: each row opens its own; this lists them all. */}
        <Button
          size="sm"
          variant="outline"
          nativeButton={false}
          render={
            <Link
              href={
                items.length === 1
                  ? items[0].href
                  : kind === "cancelled"
                    ? "/bookings?filter=closed"
                    : "/bookings?filter=all"
              }
            />
          }
          onClick={dismiss}
        >
          {items.length === 1 ? tPeople("viewBooking") : t("viewBookings")}
        </Button>
        <Button size="sm" variant="ghost" onClick={dismiss}>
          {tPeople("dismiss")}
        </Button>
        {showPush ? <PushPrompt /> : null}
      </div>
    </div>
  );
}
