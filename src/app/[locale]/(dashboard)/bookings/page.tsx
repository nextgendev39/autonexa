import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";

import { BookingsPageClient } from "@/components/bookings/bookings-page-client";
import { ErrorState } from "@/components/feedback/error-state";
import { requirePagePermission } from "@/lib/auth/authorize";
import { readBookingListQuery } from "@/lib/bookings/list-query";
import { listBookingsPage } from "@/lib/bookings/service";
import { getPaymentTerms } from "@/lib/settings/payment-terms";
import { getUserContext } from "@/lib/auth/session";
import { hasPermission, type Permission } from "@/lib/permissions";
import { canViewAllBookings } from "@/lib/permissions/roles";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations();
  const context = await getUserContext();
  return { title: t(context && !canViewAllBookings(context.roles) ? "bookings.myTitle" : "bookings.title") };
}

export default async function BookingsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const context = await requirePagePermission("reservation.view");
  const can = (p: Permission) => hasPermission(context.permissions, p, context.roles);
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(await searchParams)) {
    if (typeof value === "string") params.set(key, value);
  }
  const query = readBookingListQuery(params);
  const [result, terms] = await Promise.all([listBookingsPage(context, query), getPaymentTerms()]);
  // Never show a failed load as an empty list: that hides the problem from staff.
  if (result.error) {
    console.error("[bookings] list failed:", result.error.code, result.error.message);
    return <ErrorState />;
  }

  return (
    <BookingsPageClient
      initialPage={result.data}
      initialQuery={query}
      canCreate={can("reservation.create")}
      canCreateCustomer={can("customer.create")}
      ownOnly={!canViewAllBookings(context.roles)}
      depositMinutes={terms.depositMinutes}
    />
  );
}
