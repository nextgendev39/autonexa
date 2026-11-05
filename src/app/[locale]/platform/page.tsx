import type { Metadata } from "next";
import { getLocale, getTranslations } from "next-intl/server";
import {
  ActivityIcon,
  AlertTriangleIcon,
  BanknoteIcon,
  Building2Icon,
  CarIcon,
  CreditCardIcon,
  HardDriveIcon,
  ReceiptIcon,
  UsersIcon,
} from "lucide-react";

import { KpiCard } from "@/components/cards/kpi-card";
import { PageHeader } from "@/components/layout/page-header";
import { DataTable } from "@/components/platform/data-table";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { AppLocale } from "@/config/app";
import { Link } from "@/lib/i18n/navigation";
import { formatBytes } from "@/lib/platform/format";
import { canPlatform } from "@/lib/platform/permissions";
import {
  endingWithinDays,
  getUsage,
  latestSubscriptionByDealership,
  listDealerships,
  listInvoices,
  listTransactions,
  monthlyValue,
  receivedThisMonth,
  settled,
  subscriptionCurrency,
  totalsByCurrency,
} from "@/lib/platform/service";
import { requirePlatformPage } from "@/lib/platform/session";
import { formatCurrency, formatNumber } from "@/lib/utils/currency";
import { formatDate } from "@/lib/utils/date";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("platform");
  return { title: t("nav.dashboard") };
}

const CURRENT = new Set(["trialing", "active", "past_due"]);

export default async function Page() {
  const context = await requirePlatformPage();
  const t = await getTranslations("platform");
  const locale = (await getLocale()) as AppLocale;
  const canBilling = canPlatform(context, "billing.view");
  const canSubscriptions = canPlatform(context, "subscriptions.view");

  const [dealerships, latest, usage, invoices, transactions] = await Promise.all([
    canPlatform(context, "tenants.view") ? listDealerships() : Promise.resolve([]),
    canSubscriptions ? latestSubscriptionByDealership() : Promise.resolve(new Map()),
    canPlatform(context, "usage.view") ? getUsage() : Promise.resolve([]),
    canBilling ? listInvoices() : Promise.resolve([]),
    canBilling ? listTransactions() : Promise.resolve([]),
  ]);

  const subscriptions = [...latest.values()];
  const current = subscriptions.filter((s) => CURRENT.has(s.status));
  const names = new Map(dealerships.map((d) => [d.id, d.name]));
  const received = settled(transactions);
  const revenueThisMonth = receivedThisMonth(transactions);
  const revenueTotal = totalsByCurrency(received, (tx) => tx.amount);
  const paidByInvoice = new Map<string, number>();
  for (const tx of received) paidByInvoice.set(tx.invoice_id, (paidByInvoice.get(tx.invoice_id) ?? 0) + tx.amount);
  const outstanding = totalsByCurrency(
    invoices.filter((invoice) => invoice.status === "issued" && !invoice.is_test),
    (invoice) => invoice.amount - (paidByInvoice.get(invoice.id) ?? 0),
  );
  const monthly = new Map<string, number>();
  for (const s of current) {
    const code = subscriptionCurrency(s);
    monthly.set(code, (monthly.get(code) ?? 0) + monthlyValue(s));
  }
  // One line per currency, because AED and INR can't be added together.
  const amounts = (totals: Map<string, number>) =>
    totals.size === 0
      ? formatCurrency(0, locale)
      : [...totals.entries()].map(([code, total]) => formatCurrency(total, locale, code)).join(" · ");

  const planCounts = new Map<string, number>();
  for (const s of current) {
    const name = s.plans?.name ?? "—";
    planCounts.set(name, (planCounts.get(name) ?? 0) + 1);
  }
  const totals = usage.reduce(
    (sum, row) => ({
      users: sum.users + row.users,
      branches: sum.branches + row.branches,
      vehicles: sum.vehicles + row.vehicles,
      storage: sum.storage + row.storage_bytes,
    }),
    { users: 0, branches: 0, vehicles: 0, storage: 0 },
  );
  const expiring = endingWithinDays(current, 14);
  const n = (value: number) => formatNumber(value, locale);

  return (
    <div className="flex flex-col gap-6">
      <PageHeader title={t("dashboard.title")} description={t("dashboard.description")} />

      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4" aria-label={t("nav.tenants")}>
        <KpiCard label={t("dashboard.tenants")} value={n(dealerships.length)} icon={Building2Icon} tone="brand" />
        <KpiCard
          label={t("dashboard.suspended")}
          value={n(dealerships.filter((d) => d.status === "suspended").length)}
          icon={AlertTriangleIcon}
          tone="danger"
        />
        {canSubscriptions ? (
          <>
            <KpiCard label={t("dashboard.activeSubscriptions")} value={n(current.length)} icon={CreditCardIcon} tone="success" />
            <KpiCard
              label={t("dashboard.inactiveSubscriptions")}
              value={n(subscriptions.length - current.length)}
              icon={ActivityIcon}
              tone="warning"
            />
          </>
        ) : null}
      </section>

      {canBilling ? (
        <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4" aria-label={t("nav.billing")}>
          <KpiCard
            label={t("dashboard.monthlyValue")}
            value={amounts(monthly)}
            hint={t("dashboard.monthlyValueHint")}
            icon={BanknoteIcon}
            tone="success"
          />
          <KpiCard label={t("dashboard.revenueMonth")} value={amounts(revenueThisMonth)} icon={ReceiptIcon} tone="info" />
          <KpiCard label={t("dashboard.revenueTotal")} value={amounts(revenueTotal)} icon={ReceiptIcon} tone="neutral" />
          <KpiCard label={t("dashboard.outstanding")} value={amounts(outstanding)} icon={AlertTriangleIcon} tone="warning" />
        </section>
      ) : null}

      {usage.length > 0 ? (
        <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4" aria-label={t("nav.usage")}>
          <KpiCard label={t("usage.users")} value={n(totals.users)} icon={UsersIcon} />
          <KpiCard label={t("usage.branches")} value={n(totals.branches)} icon={Building2Icon} />
          <KpiCard label={t("usage.vehicles")} value={n(totals.vehicles)} icon={CarIcon} />
          <KpiCard label={t("usage.storage")} value={formatBytes(totals.storage)} icon={HardDriveIcon} />
        </section>
      ) : null}

      {canSubscriptions ? (
        <div className="grid gap-6 lg:grid-cols-2">
          <Card>
            <CardHeader>
              <CardTitle>{t("dashboard.planDistribution")}</CardTitle>
            </CardHeader>
            <CardContent className="grid gap-3">
              {[...planCounts.entries()].map(([name, count]) => (
                <div key={name} className="grid gap-1">
                  <div className="flex justify-between text-sm">
                    <span>{name}</span>
                    <span className="tabular-nums">{n(count)}</span>
                  </div>
                  <div className="bg-muted h-2 overflow-hidden rounded-full" aria-hidden>
                    <div className="bg-brand h-full rounded-full" style={{ width: `${(count / Math.max(current.length, 1)) * 100}%` }} />
                  </div>
                </div>
              ))}
              {planCounts.size === 0 ? <p className="text-muted-foreground text-sm">{t("common.none")}</p> : null}
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle>{t("dashboard.expiringSoon")}</CardTitle>
            </CardHeader>
            <CardContent>
              <DataTable
                empty={t("dashboard.nothingExpiring")}
                headers={[t("tenants.name"), t("subscriptions.plan"), t("subscriptions.periodEnd")]}
                rows={expiring.map((s) => ({
                  key: s.id,
                  cells: [
                    <Link key="n" href={`/platform/tenants/${s.tenant_id}`} className="font-medium hover:underline">
                      {names.get(s.tenant_id) ?? "—"}
                    </Link>,
                    s.plans?.name ?? "—",
                    s.current_period_end ? formatDate(s.current_period_end, locale) : "—",
                  ],
                }))}
              />
            </CardContent>
          </Card>
        </div>
      ) : null}
    </div>
  );
}
