"use client";

import { useLocale, useTranslations } from "next-intl";

import type { AppLocale } from "@/config/app";
import { useFormatDuration } from "@/hooks/use-format-duration";
import { formatCurrency } from "@/lib/utils/currency";

import type { AppNotification, BookingPaymentData } from "@/types/notification";

export const BOOKING_AUTO_CANCELLED = "booking_auto_cancelled";
export const BOOKING_BALANCE_OVERDUE = "booking_balance_overdue";
export const BOOKING_CREATED = "booking_created";
export const BOOKING_CANCELLED = "booking_cancelled";
export const BOOKING_SOLD = "booking_sold";
export const BOOKING_HOLD_REQUESTED = "booking_hold_requested";
export const BOOKING_HOLD_APPROVED = "booking_hold_approved";
export const BOOKING_HOLD_REJECTED = "booking_hold_rejected";
export const VEHICLE_READY_FOR_SALE = "vehicle_ready_for_sale";
export const VEHICLE_SOLD = "vehicle_sold";

export function bookingVehicleLabel(data: BookingPaymentData) {
  return data.vehicleTitle || data.stockNumber || "—";
}

/** The missed deadline in minutes (older rows stored whole days). */
export function deadlineMinutes(data: BookingPaymentData, fallbackDays: number) {
  return data.deadlineMinutes ?? (data.days ?? fallbackDays) * 24 * 60;
}

/** Title and body in the viewer's language, falling back to the stored English text. */
export function useNotificationText() {
  const t = useTranslations("notifications.types");
  const locale = useLocale() as AppLocale;
  const formatDuration = useFormatDuration();
  return (item: AppNotification) => {
    const data = item.data as BookingPaymentData;
    if (item.type === BOOKING_AUTO_CANCELLED) {
      return {
        title: t("bookingAutoCancelled.title"),
        body: t("bookingAutoCancelled.body", {
          number: data.bookingNumber ?? "—",
          vehicle: bookingVehicleLabel(data),
          duration: formatDuration(deadlineMinutes(data, 3)),
        }),
      };
    }
    if (item.type === BOOKING_BALANCE_OVERDUE) {
      return {
        title: t("bookingBalanceOverdue.title"),
        body: t("bookingBalanceOverdue.body", {
          number: data.bookingNumber ?? "—",
          vehicle: bookingVehicleLabel(data),
          duration: formatDuration(deadlineMinutes(data, 7)),
          amount: formatCurrency(data.outstanding ?? 0, locale, data.currency ?? "AED"),
        }),
      };
    }
    if (item.type === BOOKING_CREATED) {
      return {
        title: t("bookingCreated.title"),
        body: t("bookingCreated.body", {
          number: data.bookingNumber ?? "—",
          vehicle: bookingVehicleLabel(data),
          actor: data.actorName ?? "—",
          customer: data.customerName ?? "—",
        }),
      };
    }
    if (item.type === BOOKING_SOLD) {
      return {
        title: t("bookingSold.title"),
        body: t("bookingSold.body", {
          number: data.bookingNumber ?? "—",
          vehicle: bookingVehicleLabel(data),
          actor: data.actorName ?? "—",
          customer: data.customerName ?? "—",
        }),
      };
    }
    if (item.type === BOOKING_CANCELLED) {
      const body = t("bookingCancelled.body", {
        number: data.bookingNumber ?? "—",
        vehicle: bookingVehicleLabel(data),
        actor: data.actorName ?? "—",
      });
      return {
        title: t("bookingCancelled.title"),
        body: data.reason ? `${body} ${t("bookingCancelled.reason", { reason: data.reason })}` : body,
      };
    }
    if (item.type === BOOKING_HOLD_REQUESTED) {
      return {
        title: t("bookingHoldRequested.title"),
        body: t("bookingHoldRequested.body", {
          number: data.bookingNumber ?? "—",
          vehicle: bookingVehicleLabel(data),
          actor: data.actorName ?? "—",
          customer: data.customerName ?? "—",
          reason: data.reason ?? "—",
        }),
      };
    }
    if (item.type === BOOKING_HOLD_APPROVED || item.type === BOOKING_HOLD_REJECTED) {
      const key = item.type === BOOKING_HOLD_APPROVED ? "bookingHoldApproved" : "bookingHoldRejected";
      const body = t(`${key}.body`, {
        number: data.bookingNumber ?? "—",
        vehicle: bookingVehicleLabel(data),
        actor: data.actorName ?? "—",
      });
      return { title: t(`${key}.title`), body: data.note ? `${body} ${data.note}` : body };
    }
    if (item.type === VEHICLE_READY_FOR_SALE || item.type === VEHICLE_SOLD) {
      const key = item.type === VEHICLE_SOLD ? "vehicleSold" : "vehicleReadyForSale";
      const stock = data.stockNumber ? ` (${data.stockNumber})` : "";
      return {
        title: t(`${key}.title`),
        body: t(`${key}.body`, {
          vehicle: `${bookingVehicleLabel(data)}${data.vehicleTitle ? stock : ""}`,
          actor: data.actorName ?? "—",
        }),
      };
    }
    return { title: item.title, body: item.message };
  };
}
