import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";

import { CustomersPageClient } from "@/components/customers/customers-page-client";
import { ErrorState } from "@/components/feedback/error-state";
import { requirePagePermission } from "@/lib/auth/authorize";
import { getUserContext } from "@/lib/auth/session";
import { readCustomerListQuery } from "@/lib/customers/list-query";
import { listCustomersPage } from "@/lib/customers/service";
import { hasPermission } from "@/lib/permissions";
import { canViewAllBookings } from "@/lib/permissions/roles";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations();
  const context = await getUserContext();
  return {
    title: t(context && !canViewAllBookings(context.roles) ? "customers.myTitle" : "customers.title"),
  };
}

export default async function CustomersPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const context = await requirePagePermission("customer.view");
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(await searchParams)) {
    if (typeof value === "string") params.set(key, value);
  }
  const query = readCustomerListQuery(params);
  const result = await listCustomersPage(context, query);

  // Never show a failed load as an empty list: that hides the problem from staff.
  if (!result.data) {
    console.error("[customers] list failed:", result.error?.code, result.error?.message);
    return <ErrorState />;
  }

  return (
    <CustomersPageClient
      initialPage={result.data}
      initialQuery={query}
      canCreateBooking={hasPermission(context.permissions, "reservation.create", context.roles)}
    />
  );
}
