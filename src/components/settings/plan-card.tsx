import { getLocale, getTranslations } from "next-intl/server";

import { PlatformStatus } from "@/components/platform/platform-ui";
import { UsageCell } from "@/components/platform/usage-cell";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import type { AppLocale } from "@/config/app";
import { Link } from "@/lib/i18n/navigation";
import { formatBytes } from "@/lib/platform/format";
import type { DealershipPlan } from "@/lib/platform/dealership";
import { formatCurrency, formatNumber } from "@/lib/utils/currency";
import { formatDate } from "@/lib/utils/date";

/** A dealership's view of its own plan: read-only, and only ever about itself. */
export async function PlanCard({
  plan,
  invoices,
}: {
  plan: DealershipPlan;
  invoices: { id: string; invoice_number: string; amount: number; currency: string; status: string; due_at: string | null }[];
}) {
  const t = await getTranslations("platform");
  const locale = (await getLocale()) as AppLocale;
  const count = (used: number, limit: number | null) => (
    <UsageCell
      used={used}
      limit={limit}
      usedLabel={formatNumber(used, locale)}
      limitLabel={limit === null ? "" : formatNumber(limit, locale)}
      unlimitedLabel={t("usage.unlimited")}
    />
  );
  const storageLimit = plan.limits.storageMb === null ? null : plan.limits.storageMb * 1024 * 1024;

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t("dealership.title")}</CardTitle>
        <CardDescription>
          {t("dealership.hint")}{" "}
          <Link href="/billing" className="font-medium hover:underline">
            {t("dealership.manage")}
          </Link>
        </CardDescription>
      </CardHeader>
      <CardContent className="grid gap-5">
        <dl className="grid grid-cols-2 gap-3 text-sm sm:grid-cols-3">
          <div>
            <dt className="text-muted-foreground">{t("subscriptions.plan")}</dt>
            <dd className="font-medium">{plan.plan}</dd>
          </div>
          <div>
            <dt className="text-muted-foreground">{t("subscriptions.status")}</dt>
            <dd><PlatformStatus status={plan.status} /></dd>
          </div>
          <div>
            <dt className="text-muted-foreground">{t("subscriptions.periodEnd")}</dt>
            <dd>{plan.periodEnd ? formatDate(plan.periodEnd, locale) : t("subscriptions.noExpiry")}</dd>
          </div>
        </dl>
        <dl className="grid gap-4 text-sm sm:grid-cols-2">
          <div className="grid gap-1">
            <dt className="text-muted-foreground">{t("usage.users")}</dt>
            <dd>{count(plan.usage.users, plan.limits.users)}</dd>
          </div>
          <div className="grid gap-1">
            <dt className="text-muted-foreground">{t("usage.branches")}</dt>
            <dd>{count(plan.usage.branches, plan.limits.branches)}</dd>
          </div>
          <div className="grid gap-1">
            <dt className="text-muted-foreground">{t("usage.vehicles")}</dt>
            <dd>{count(plan.usage.vehicles, plan.limits.vehicles)}</dd>
          </div>
          <div className="grid gap-1">
            <dt className="text-muted-foreground">{t("usage.storage")}</dt>
            <dd>
              <UsageCell
                used={plan.usage.storageBytes}
                limit={storageLimit}
                usedLabel={formatBytes(plan.usage.storageBytes)}
                limitLabel={storageLimit === null ? "" : formatBytes(storageLimit)}
                unlimitedLabel={t("usage.unlimited")}
              />
            </dd>
          </div>
        </dl>
        {invoices.length > 0 ? (
          <div className="grid gap-2">
            <h3 className="text-sm font-medium">{t("billing.invoices")}</h3>
            <ul className="divide-border divide-y text-sm">
              {invoices.map((invoice) => (
                <li key={invoice.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
                  <span>{invoice.invoice_number}</span>
                  <span className="tabular-nums">{formatCurrency(Number(invoice.amount), locale, invoice.currency)}</span>
                  <PlatformStatus status={invoice.status} />
                </li>
              ))}
            </ul>
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}
