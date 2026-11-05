import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getLocale, getTranslations } from "next-intl/server";

import { PageHeader } from "@/components/layout/page-header";
import { InvoiceStatusAction, RecordPaymentAction } from "@/components/platform/billing-actions";
import { DataTable } from "@/components/platform/data-table";
import { PlatformStatus } from "@/components/platform/platform-ui";
import {
  AddDomainAction,
  AssignPlanAction,
  CancelSubscriptionAction,
  CreateInvoiceAction,
  InviteOwnerAction,
  RemoveDomainAction,
  RenewAction,
  TenantSettingsForm,
  TenantStatusAction,
} from "@/components/platform/tenant-actions";
import { UsageCell } from "@/components/platform/usage-cell";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { AppLocale } from "@/config/app";
import { formatBytes } from "@/lib/platform/format";
import { canPlatform } from "@/lib/platform/permissions";
import {
  getDealership,
  getDealershipSettings,
  getUsage,
  listAuditLogs,
  listDomains,
  listInvoices,
  listPlans,
  listSubscriptions,
} from "@/lib/platform/service";
import { requirePlatformPage } from "@/lib/platform/session";
import { formatCurrency, formatNumber } from "@/lib/utils/currency";
import { formatDate } from "@/lib/utils/date";

type Props = { params: Promise<{ id: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { id } = await params;
  const dealership = await getDealership(id);
  return { title: dealership?.name };
}

const CURRENT = new Set(["trialing", "active", "past_due"]);

export default async function Page({ params }: Props) {
  const context = await requirePlatformPage("tenants.view");
  const { id } = await params;
  const dealership = await getDealership(id);
  if (!dealership) notFound();

  const t = await getTranslations("platform");
  const locale = (await getLocale()) as AppLocale;
  const canManage = canPlatform(context, "tenants.manage");
  const canManageSubs = canPlatform(context, "subscriptions.manage");
  const canBilling = canPlatform(context, "billing.view");
  const canManageBilling = canPlatform(context, "billing.manage");

  const [settings, domains, subscriptions, usage, invoices, audit, { plans }] = await Promise.all([
    getDealershipSettings(id),
    listDomains(id),
    canPlatform(context, "subscriptions.view") ? listSubscriptions(id) : Promise.resolve([]),
    canPlatform(context, "usage.view") ? getUsage() : Promise.resolve([]),
    canBilling ? listInvoices(id) : Promise.resolve([]),
    canPlatform(context, "audit.view") ? listAuditLogs({ dealershipId: id, limit: 20 }) : Promise.resolve([]),
    listPlans(),
  ]);

  const current = subscriptions.find((s) => CURRENT.has(s.status)) ?? null;
  const latest = subscriptions[0] ?? null;
  const plan = plans.find((p) => p.id === latest?.plan_id);
  const used = usage.find((row) => row.tenant_id === id);
  const activePlans = plans.filter((p) => p.is_active).map((p) => ({ id: p.id, name: p.name }));
  const usageCell = (value: number, limit: number | null | undefined) => (
    <UsageCell
      used={value}
      limit={limit ?? null}
      usedLabel={formatNumber(value, locale)}
      limitLabel={limit == null ? "" : formatNumber(limit, locale)}
      unlimitedLabel={t("usage.unlimited")}
    />
  );

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title={dealership.name}
        description={`${dealership.slug} · ${dealership.number_prefix}`}
        actions={
          canManage ? (
            <>
              <InviteOwnerAction id={id} />
              <TenantSettingsForm id={id} name={dealership.name} settings={settings} />
              <TenantStatusAction id={id} status={dealership.status} />
            </>
          ) : null
        }
      />

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>{t("subscriptions.title")}</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-4">
            <dl className="grid grid-cols-2 gap-3 text-sm">
              <dt className="text-muted-foreground">{t("tenants.status")}</dt>
              <dd><PlatformStatus status={dealership.status} /></dd>
              <dt className="text-muted-foreground">{t("subscriptions.plan")}</dt>
              <dd>{latest?.plans?.name ?? t("subscriptions.noPlan")}</dd>
              <dt className="text-muted-foreground">{t("subscriptions.status")}</dt>
              <dd>{latest ? <PlatformStatus status={latest.status} /> : "—"}</dd>
              <dt className="text-muted-foreground">{t("subscriptions.cycle")}</dt>
              <dd>{latest ? t(`cycle.${latest.billing_cycle}`) : "—"}</dd>
              <dt className="text-muted-foreground">{t("subscriptions.periodEnd")}</dt>
              <dd>{latest?.current_period_end ? formatDate(latest.current_period_end, locale) : t("subscriptions.noExpiry")}</dd>
            </dl>
            {canManageSubs ? (
              <div className="flex flex-wrap gap-2">
                <AssignPlanAction id={id} plans={activePlans} />
                {latest && latest.status !== "cancelled" ? <RenewAction id={id} subscriptionId={latest.id} /> : null}
                {latest && latest.status !== "cancelled" ? <CancelSubscriptionAction id={id} subscriptionId={latest.id} /> : null}
              </div>
            ) : null}
          </CardContent>
        </Card>

        {used ? (
          <Card>
            <CardHeader>
              <CardTitle>{t("usage.title")}</CardTitle>
            </CardHeader>
            <CardContent>
              <dl className="grid grid-cols-[auto_1fr] items-center gap-3 text-sm">
                <dt className="text-muted-foreground">{t("usage.users")}</dt>
                <dd>{usageCell(used.users, plan?.max_users)}</dd>
                <dt className="text-muted-foreground">{t("usage.branches")}</dt>
                <dd>{usageCell(used.branches, plan?.max_branches)}</dd>
                <dt className="text-muted-foreground">{t("usage.vehicles")}</dt>
                <dd>{usageCell(used.vehicles, plan?.max_vehicles)}</dd>
                <dt className="text-muted-foreground">{t("usage.storage")}</dt>
                <dd>
                  <UsageCell
                    used={used.storage_bytes}
                    limit={plan?.max_storage_mb == null ? null : plan.max_storage_mb * 1024 * 1024}
                    usedLabel={formatBytes(used.storage_bytes)}
                    limitLabel={plan?.max_storage_mb == null ? "" : formatBytes(plan.max_storage_mb * 1024 * 1024)}
                    unlimitedLabel={t("usage.unlimited")}
                  />
                </dd>
              </dl>
            </CardContent>
          </Card>
        ) : null}

        <Card>
          <CardHeader>
            <CardTitle>{t("settings.title")}</CardTitle>
          </CardHeader>
          <CardContent>
            <dl className="grid grid-cols-2 gap-3 text-sm">
              <dt className="text-muted-foreground">{t("settings.displayName")}</dt>
              <dd>{settings?.display_name ?? "—"}</dd>
              <dt className="text-muted-foreground">{t("settings.contactEmail")}</dt>
              <dd>{settings?.contact_email ?? "—"}</dd>
              <dt className="text-muted-foreground">{t("settings.contactPhone")}</dt>
              <dd>{settings?.contact_phone ?? "—"}</dd>
              <dt className="text-muted-foreground">{t("settings.color")}</dt>
              <dd>{settings?.primary_color ?? "—"}</dd>
              <dt className="text-muted-foreground">{t("settings.timezone")}</dt>
              <dd>{settings?.timezone ?? "—"}</dd>
              <dt className="text-muted-foreground">{t("settings.currency")}</dt>
              <dd>{settings?.currency ?? "—"}</dd>
            </dl>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between gap-2">
            <CardTitle>{t("domains.title")}</CardTitle>
            {canManage ? <AddDomainAction id={id} /> : null}
          </CardHeader>
          <CardContent className="grid gap-3">
            <p className="text-muted-foreground text-sm">{t("domains.hint")}</p>
            <DataTable
              empty={t("domains.none")}
              headers={[t("domains.domain"), t("domains.primary"), t("domains.verification"), t("domains.ssl"), ""]}
              rows={domains.map((d) => ({
                key: d.id,
                cells: [
                  d.domain,
                  d.is_primary ? t("common.yes") : t("common.no"),
                  <PlatformStatus key="v" status={d.verification_status} />,
                  <PlatformStatus key="ssl" status={`ssl_${d.ssl_status}`} />,
                  canManage ? <RemoveDomainAction key="r" id={id} domainId={d.id} domain={d.domain} /> : null,
                ],
              }))}
            />
          </CardContent>
        </Card>
      </div>

      {canBilling ? (
        <Card>
          <CardHeader className="flex flex-row items-center justify-between gap-2">
            <CardTitle>{t("billing.invoices")}</CardTitle>
            {canManageBilling ? (
              <CreateInvoiceAction id={id} subscriptionId={current?.id ?? null} currency={settings?.currency ?? "AED"} />
            ) : null}
          </CardHeader>
          <CardContent>
            <DataTable
              empty={t("billing.none")}
              headers={[t("billing.number"), t("billing.amount"), t("subscriptions.status"), t("billing.issued"), t("billing.due"), ""]}
              rows={invoices.map((invoice) => ({
                key: invoice.id,
                cells: [
                  invoice.invoice_number,
                  formatCurrency(invoice.amount, locale, invoice.currency),
                  <PlatformStatus key="s" status={invoice.status} />,
                  formatDate(invoice.issued_at, locale),
                  invoice.due_at ? formatDate(invoice.due_at, locale) : "—",
                  canManageBilling ? (
                    <div key="a" className="flex gap-1">
                      {invoice.status === "draft" ? <InvoiceStatusAction id={invoice.id} status="issued" /> : null}
                      {invoice.status === "issued" ? <RecordPaymentAction id={invoice.id} amount={invoice.amount} /> : null}
                      {invoice.status === "issued" || invoice.status === "draft" ? <InvoiceStatusAction id={invoice.id} status="void" /> : null}
                    </div>
                  ) : null,
                ],
              }))}
            />
          </CardContent>
        </Card>
      ) : null}

      {canPlatform(context, "subscriptions.view") ? (
        <Card>
          <CardHeader>
            <CardTitle>{t("subscriptions.history")}</CardTitle>
          </CardHeader>
          <CardContent>
            <DataTable
              empty={t("common.none")}
              headers={[t("subscriptions.plan"), t("subscriptions.status"), t("subscriptions.started"), t("subscriptions.periodEnd")]}
              rows={subscriptions.map((s) => ({
                key: s.id,
                cells: [
                  s.plans?.name ?? "—",
                  <PlatformStatus key="s" status={s.status} />,
                  formatDate(s.started_at, locale),
                  s.current_period_end ? formatDate(s.current_period_end, locale) : t("subscriptions.noExpiry"),
                ],
              }))}
            />
          </CardContent>
        </Card>
      ) : null}

      {canPlatform(context, "audit.view") ? (
        <Card>
          <CardHeader>
            <CardTitle>{t("audit.title")}</CardTitle>
          </CardHeader>
          <CardContent>
            <DataTable
              empty={t("audit.none")}
              headers={[t("audit.when"), t("audit.action")]}
              rows={audit.map((entry) => ({
                key: entry.id,
                cells: [
                  formatDate(entry.created_at, locale, "medium"),
                  <code key="c" className="text-xs">{entry.action}</code>,
                ],
              }))}
            />
          </CardContent>
        </Card>
      ) : null}
    </div>
  );
}
