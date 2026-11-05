import type { Metadata } from "next";
import { getLocale, getTranslations } from "next-intl/server";

import { PageHeader } from "@/components/layout/page-header";
import { InvoiceStatusAction, RecordPaymentAction } from "@/components/platform/billing-actions";
import { DataTable } from "@/components/platform/data-table";
import { PlatformStatus } from "@/components/platform/platform-ui";
import { RefundAction } from "@/components/platform/refund-action";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import type { AppLocale } from "@/config/app";
import { Link } from "@/lib/i18n/navigation";
import { canPlatform } from "@/lib/platform/permissions";
import { getBillingReport, listBillingActivity, listInvoices, listTransactions } from "@/lib/platform/service";
import { requirePlatformPage } from "@/lib/platform/session";
import { formatCurrency } from "@/lib/utils/currency";
import { formatDate } from "@/lib/utils/date";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("platform");
  return { title: t("nav.billing") };
}

export default async function Page() {
  const context = await requirePlatformPage("billing.view");
  const t = await getTranslations("platform");
  const locale = (await getLocale()) as AppLocale;
  const [invoices, transactions, report, activity] = await Promise.all([
    listInvoices(),
    listTransactions(),
    getBillingReport(12),
    listBillingActivity(),
  ]);
  const review = activity.checkouts.filter((c) => c.status === "needs_review");
  const refundedBy = new Map<string, number>();
  for (const tx of transactions) {
    if (tx.kind === "refund" && tx.parent_transaction_id && tx.status !== "failed") {
      refundedBy.set(tx.parent_transaction_id, (refundedBy.get(tx.parent_transaction_id) ?? 0) - tx.amount);
    }
  }
  const canManage = canPlatform(context, "billing.manage");
  const numbers = new Map(invoices.map((invoice) => [invoice.id, invoice.invoice_number]));
  const paid = new Map<string, number>();
  // Only what settled: a failed attempt or pending refund is no money received.
  for (const tx of transactions) {
    if (tx.status === "succeeded") paid.set(tx.invoice_id, (paid.get(tx.invoice_id) ?? 0) + tx.amount);
  }

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title={t("billing.title")}
        description={t("billing.pageDescription")}
        actions={
          <Button variant="outline" nativeButton={false} render={<Link href="/platform/billing/settings" />}>
            {t("billingSettings.title")}
          </Button>
        }
      />
      {review.length > 0 ? (
        <Alert variant="destructive">
          <AlertDescription>{t("billing.reviewAlert", { count: review.length })}</AlertDescription>
        </Alert>
      ) : null}
      <Card>
        <CardHeader>
          <CardTitle>{t("billing.report")}</CardTitle>
          <CardDescription>{t("billing.reportHint")}</CardDescription>
        </CardHeader>
        <CardContent>
          <DataTable
            empty={t("billing.noTransactions")}
            headers={[t("billing.month"), t("settings.currency"), t("billing.received"), t("billing.refunded"), t("billing.tax"), t("billing.payments"), t("billing.failed")]}
            rows={report.map((row) => ({
              key: `${row.month}-${row.currency}`,
              cells: [
                String(row.month).slice(0, 7),
                row.currency,
                formatCurrency(Number(row.received), locale, row.currency),
                formatCurrency(Number(row.refunded), locale, row.currency),
                formatCurrency(Number(row.tax), locale, row.currency),
                String(row.payments),
                String(row.failed),
              ],
            }))}
          />
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>{t("billing.invoices")}</CardTitle>
        </CardHeader>
        <CardContent>
          <DataTable
            empty={t("billing.none")}
            headers={[t("billing.number"), t("tenants.name"), t("billing.amount"), t("billing.received"), t("subscriptions.status"), t("billing.due"), ""]}
            rows={invoices.map((invoice) => {
              const received = paid.get(invoice.id) ?? 0;
              return {
                key: invoice.id,
                cells: [
                  invoice.invoice_number,
                  <Link key="n" href={`/platform/tenants/${invoice.tenant_id}`} className="hover:underline">
                    {invoice.tenants?.name ?? "—"}
                  </Link>,
                  formatCurrency(invoice.amount, locale, invoice.currency),
                  formatCurrency(received, locale, invoice.currency),
                  <PlatformStatus key="s" status={invoice.status} />,
                  invoice.due_at ? formatDate(invoice.due_at, locale) : "—",
                  <div key="links" className="flex flex-wrap items-center gap-1">
                    <a href={`/api/billing/invoices/${invoice.id}`} target="_blank" rel="noopener noreferrer" className="text-sm hover:underline">
                      {t("billing.viewInvoice")}
                    </a>
                  {canManage ? (
                    <div key="a" className="flex gap-1">
                      {invoice.status === "draft" ? <InvoiceStatusAction id={invoice.id} status="issued" /> : null}
                      {invoice.status === "issued" ? <RecordPaymentAction id={invoice.id} amount={Math.max(invoice.amount - received, 0)} /> : null}
                      {invoice.status === "issued" || invoice.status === "draft" ? <InvoiceStatusAction id={invoice.id} status="void" /> : null}
                    </div>
                  ) : null}
                  </div>,
                ],
              };
            })}
          />
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>{t("billing.checkouts")}</CardTitle>
          <CardDescription>{t("billing.checkoutsHint")}</CardDescription>
        </CardHeader>
        <CardContent>
          <DataTable
            empty={t("billing.noCheckouts")}
            headers={[t("audit.when"), t("tenants.name"), t("billing.kind"), t("billing.gateway"), t("subscriptions.status"), t("billing.reason")]}
            rows={activity.checkouts.map((c) => ({
              key: c.id,
              cells: [
                formatDate(c.created_at, locale),
                c.tenants?.name ?? "—",
                c.kind,
                c.gateway,
                <div key="s" className="flex flex-wrap gap-1">
                  <PlatformStatus status={`checkout_${c.status}`} />
                  {c.is_test ? <PlatformStatus status="test" /> : null}
                </div>,
                c.review_reason ?? "—",
              ],
            }))}
          />
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>{t("billing.webhooks")}</CardTitle>
          <CardDescription>{t("billing.webhooksHint")}</CardDescription>
        </CardHeader>
        <CardContent>
          <DataTable
            empty={t("billing.noWebhooks")}
            headers={[t("audit.when"), t("billing.gateway"), t("billing.event"), t("subscriptions.status"), t("billing.attempts")]}
            rows={activity.events.map((e) => ({
              key: `${e.gateway}-${e.event_id}`,
              cells: [
                formatDate(e.received_at, locale),
                e.gateway,
                <code key="c" className="text-xs">{e.event_type}</code>,
                <div key="s" className="grid gap-1">
                  <PlatformStatus status={`webhook_${e.status}`} />
                  {e.error ? <span className="text-muted-foreground text-xs">{e.error}</span> : null}
                </div>,
                String(e.attempts),
              ],
            }))}
          />
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>{t("billing.transactions")}</CardTitle>
        </CardHeader>
        <CardContent>
          <DataTable
            empty={t("billing.noTransactions")}
            headers={[t("audit.when"), t("billing.number"), t("tenants.name"), t("billing.kind"), t("subscriptions.status"), t("billing.amount"), t("billing.method"), t("billing.reference"), ""]}
            rows={transactions.map((tx) => ({
              key: tx.id,
              cells: [
                formatDate(tx.occurred_at, locale),
                numbers.get(tx.invoice_id) ?? "—",
                tx.tenants?.name ?? "—",
                t(`billing.kinds.${tx.kind}`),
                <div key="s" className="grid gap-1">
                  <PlatformStatus status={tx.status} />
                  {tx.is_test ? <PlatformStatus status="test" /> : null}
                  {tx.failure_reason ? <span className="text-muted-foreground text-xs">{tx.failure_reason}</span> : null}
                </div>,
                formatCurrency(tx.amount, locale, tx.currency),
                t(`methods.${tx.method}` as never),
                <span key="r" className="text-xs break-all" dir="ltr">{tx.reference ?? "—"}</span>,
                canManage && tx.kind === "payment" && tx.status === "succeeded" && tx.amount - (refundedBy.get(tx.id) ?? 0) > 0 ? (
                  <RefundAction key="a" id={tx.id} amount={tx.amount - (refundedBy.get(tx.id) ?? 0)} viaGateway={Boolean(tx.gateway)} />
                ) : null,
              ],
            }))}
          />
        </CardContent>
      </Card>
    </div>
  );
}
