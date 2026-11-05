"use client";

import { useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { DownloadIcon, ExternalLinkIcon } from "lucide-react";
import { toast } from "sonner";

import { FormField } from "@/components/forms/form-field";
import { PageHeader } from "@/components/layout/page-header";
import { SimpleSelect, platformRequest } from "@/components/platform/platform-ui";
import { DataTableClient } from "@/components/storefront/data-table-client";
import { LoadingButton } from "@/components/shared/loading-button";
import { StatusBadge } from "@/components/shared/status-badge";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import type { AppLocale } from "@/config/app";
import type { BillingProfile, OwnInvoice, OwnTransaction } from "@/lib/billing/data";
import { useRouter } from "@/lib/i18n/navigation";
import { formatCurrency } from "@/lib/utils/currency";
import { formatDate } from "@/lib/utils/date";

export type BillingPlan = {
  id: string;
  name: string;
  description: string | null;
  monthly: number | null;
  yearly: number | null;
};

type Quote = {
  kind?: string;
  currency?: string;
  subtotal?: number;
  credit?: number;
  taxLabel?: string;
  taxRate?: number;
  tax?: number;
  total?: number;
  error?: string;
};

const badge: Record<string, string> = {
  paid: "approved",
  issued: "pending_approval",
  draft: "draft",
  void: "rejected",
  succeeded: "approved",
  pending: "pending_approval",
  failed: "rejected",
  active: "approved",
  trialing: "sourcing",
  past_due: "pending_approval",
  expired: "rejected",
  cancelled: "rejected",
};

export function BillingClient({
  plans,
  profile,
  invoices,
  transactions,
  subscription,
  planName,
  scheduledPlanName,
  canCheckOut,
  isTestMode,
  cancelled,
}: {
  plans: BillingPlan[];
  profile: BillingProfile | null;
  invoices: OwnInvoice[];
  transactions: OwnTransaction[];
  subscription: {
    status: string;
    billing_cycle: string;
    current_period_end: string | null;
    cancel_at_period_end: boolean;
    plan_id: string;
  } | null;
  planName: string | null;
  scheduledPlanName: string | null;
  canCheckOut: boolean;
  isTestMode: boolean;
  cancelled: boolean;
}) {
  const t = useTranslations("billing");
  const locale = useLocale() as AppLocale;
  const router = useRouter();
  const [cycle, setCycle] = useState<"monthly" | "yearly">("monthly");
  const [busy, setBusy] = useState<string | null>(null);

  const refresh = () => router.refresh();

  /** Sends the person to the gateway's own page. Nothing changes here until the gateway confirms. */
  async function goToCheckout(body: Record<string, unknown>, key: string) {
    setBusy(key);
    const outcome = await platformRequest("/api/billing/checkout", "POST", body);
    if (outcome.ok) {
      const url = (outcome.data as { redirectUrl?: string } | null)?.redirectUrl;
      if (url) {
        window.location.assign(url);
        return;
      }
    }
    setBusy(null);
    toast.error((!outcome.ok && outcome.message) || t("failed"));
  }

  async function act(path: string, body: Record<string, unknown>, key: string) {
    setBusy(key);
    const outcome = await platformRequest(path, "POST", body);
    setBusy(null);
    if (outcome.ok) {
      toast.success(t("saved"));
      refresh();
    } else {
      toast.error(outcome.message || t("failed"));
    }
  }

  const currency = profile?.currency ?? "AED";
  const money = (amount: number, code = currency) => formatCurrency(amount, locale, code);
  const payable = invoices.filter((i) => i.status === "issued" && i.kind === "renewal");

  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col gap-6">
      <PageHeader title={t("title")} description={t("description")} />

      {isTestMode ? (
        <Alert>
          <AlertDescription>{t("testMode")}</AlertDescription>
        </Alert>
      ) : null}
      {cancelled ? (
        <Alert>
          <AlertDescription>{t("checkoutCancelled")}</AlertDescription>
        </Alert>
      ) : null}
      {!canCheckOut ? (
        <Alert>
          <AlertDescription>{t("notAvailable")}</AlertDescription>
        </Alert>
      ) : null}

      <Card>
        <CardHeader>
          <CardTitle>{t("current.title")}</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4">
          <dl className="grid grid-cols-2 gap-3 text-sm sm:grid-cols-4">
            <div>
              <dt className="text-muted-foreground">{t("current.plan")}</dt>
              <dd className="font-medium">{planName ?? t("current.none")}</dd>
            </div>
            <div>
              <dt className="text-muted-foreground">{t("current.status")}</dt>
              <dd>
                {subscription ? (
                  <StatusBadge status={badge[subscription.status] ?? "draft"} label={t(`status.${subscription.status}`)} />
                ) : (
                  "—"
                )}
              </dd>
            </div>
            <div>
              <dt className="text-muted-foreground">{t("current.cycle")}</dt>
              <dd>{subscription ? t(`cycle.${subscription.billing_cycle}`) : "—"}</dd>
            </div>
            <div>
              <dt className="text-muted-foreground">{t("current.ends")}</dt>
              <dd>{subscription?.current_period_end ? formatDate(subscription.current_period_end, locale) : t("current.noEnd")}</dd>
            </div>
          </dl>
          {subscription?.cancel_at_period_end ? <p className="text-sm">{t("current.ending")}</p> : null}
          {scheduledPlanName ? <p className="text-sm">{t("current.scheduled", { plan: scheduledPlanName })}</p> : null}
          <div className="flex flex-wrap gap-2">
            {subscription?.current_period_end && subscription.status !== "cancelled" && subscription.status !== "expired" ? (
              <LoadingButton
                variant="outline"
                loading={busy === "cancel"}
                onClick={() => void act("/api/billing/cancel", { cancel: !subscription.cancel_at_period_end }, "cancel")}
              >
                {t(subscription.cancel_at_period_end ? "current.keep" : "current.cancel")}
              </LoadingButton>
            ) : null}
            {scheduledPlanName ? (
              <LoadingButton variant="ghost" loading={busy === "clear"} onClick={() => void act("/api/billing/schedule", { planId: null, cycle: null }, "clear")}>
                {t("current.clearScheduled")}
              </LoadingButton>
            ) : null}
          </div>
        </CardContent>
      </Card>

      {payable.length > 0 && canCheckOut ? (
        <Card>
          <CardHeader>
            <CardTitle>{t("due.title")}</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-3">
            {payable.map((invoice) => (
              <div key={invoice.id} className="flex flex-wrap items-center justify-between gap-2 text-sm">
                <span>
                  {invoice.invoice_number} · {money(invoice.amount, invoice.currency)}
                  {invoice.due_at ? ` · ${t("due.by", { date: formatDate(invoice.due_at, locale) })}` : ""}
                </span>
                <LoadingButton loading={busy === invoice.id} onClick={() => void goToCheckout({ invoiceId: invoice.id }, invoice.id)}>
                  {t("due.pay")}
                </LoadingButton>
              </div>
            ))}
          </CardContent>
        </Card>
      ) : null}

      <Card>
        <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-3">
          <div>
            <CardTitle>{t("plans.title")}</CardTitle>
            <CardDescription>{t("plans.hint")}</CardDescription>
          </div>
          <div className="w-40">
            <SimpleSelect
              id="billing-cycle"
              value={cycle}
              onChange={(value) => setCycle(value as "monthly" | "yearly")}
              options={[
                { value: "monthly", label: t("cycle.monthly") },
                { value: "yearly", label: t("cycle.yearly") },
              ]}
            />
          </div>
        </CardHeader>
        <CardContent>
          {!profile ? (
            <p className="text-muted-foreground text-sm">{t("plans.profileFirst")}</p>
          ) : (
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              {plans.map((plan) => {
                const price = cycle === "monthly" ? plan.monthly : plan.yearly;
                return (
                  <PlanOption
                    key={plan.id}
                    plan={plan}
                    price={price}
                    cycle={cycle}
                    currency={currency}
                    isCurrent={subscription?.plan_id === plan.id && subscription.billing_cycle === cycle && subscription.status !== "cancelled" && subscription.status !== "expired"}
                    disabled={!canCheckOut || price === null}
                    busy={busy === plan.id}
                    onCheckout={() => void goToCheckout({ planId: plan.id, cycle }, plan.id)}
                    onSchedule={() => void act("/api/billing/schedule", { planId: plan.id, cycle }, plan.id)}
                  />
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>

      <ProfileCard profile={profile} onSaved={refresh} />

      <Card>
        <CardHeader>
          <CardTitle>{t("invoices.title")}</CardTitle>
        </CardHeader>
        <CardContent>
          <DataTableClient
            empty={t("invoices.none")}
            headers={[t("invoices.number"), t("invoices.date"), t("invoices.description"), t("invoices.amount"), t("invoices.status"), ""]}
            rows={invoices.map((invoice) => ({
              key: invoice.id,
              cells: [
                invoice.invoice_number,
                formatDate(invoice.issued_at, locale),
                invoice.description ?? "—",
                money(invoice.amount, invoice.currency),
                <StatusBadge key="s" status={badge[invoice.status] ?? "draft"} label={t(`invoiceStatus.${invoice.status}`)} />,
                <div key="a" className="flex gap-1">
                  <Button variant="ghost" size="icon" aria-label={t("invoices.view")} nativeButton={false} render={<a href={`/api/billing/invoices/${invoice.id}`} target="_blank" rel="noopener noreferrer" />}>
                    <ExternalLinkIcon />
                  </Button>
                  <Button variant="ghost" size="icon" aria-label={t("invoices.download")} nativeButton={false} render={<a href={`/api/billing/invoices/${invoice.id}?download=1`} />}>
                    <DownloadIcon />
                  </Button>
                </div>,
              ],
            }))}
          />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{t("history.title")}</CardTitle>
          <CardDescription>{t("history.hint")}</CardDescription>
        </CardHeader>
        <CardContent>
          <DataTableClient
            empty={t("history.none")}
            headers={[t("history.date"), t("history.type"), t("history.status"), t("history.amount"), t("history.reference")]}
            rows={transactions.map((tx) => ({
              key: tx.id,
              cells: [
                formatDate(tx.occurred_at, locale),
                t(`history.kinds.${tx.kind}`),
                <div key="s" className="grid gap-1">
                  <StatusBadge status={badge[tx.status] ?? "draft"} label={t(`history.statuses.${tx.status}`)} />
                </div>,
                money(tx.amount, tx.currency),
                <span key="r" dir="ltr" className="text-xs break-all">{tx.reference ?? "—"}</span>,
              ],
            }))}
          />
        </CardContent>
      </Card>
    </div>
  );
}

function PlanOption({
  plan,
  price,
  cycle,
  currency,
  isCurrent,
  disabled,
  busy,
  onCheckout,
  onSchedule,
}: {
  plan: BillingPlan;
  price: number | null;
  cycle: "monthly" | "yearly";
  currency: string;
  isCurrent: boolean;
  disabled: boolean;
  busy: boolean;
  onCheckout: () => void;
  onSchedule: () => void;
}) {
  const t = useTranslations("billing");
  const locale = useLocale() as AppLocale;
  const [quote, setQuote] = useState<Quote | null>(null);

  async function loadQuote() {
    const response = await fetch(`/api/billing/quote?plan=${plan.id}&cycle=${cycle}`, { credentials: "same-origin" });
    const json = await response.json().catch(() => null);
    setQuote(json?.data ?? { error: "failed" });
  }
  const money = (amount: number | undefined) => formatCurrency(Number(amount ?? 0), locale, quote?.currency ?? currency);

  return (
    <div className="ring-border grid content-start gap-3 rounded-lg p-4 ring-1">
      <div>
        <h3 className="font-medium">{plan.name}</h3>
        {plan.description ? <p className="text-muted-foreground text-sm">{plan.description}</p> : null}
      </div>
      <p className="text-lg font-semibold">
        {price !== null ? formatCurrency(price, locale, currency) : t("plans.notAvailable")}
        {price !== null ? <span className="text-muted-foreground text-sm font-normal"> / {t(`per.${cycle}`)}</span> : null}
      </p>
      {isCurrent ? <p className="text-sm font-medium">{t("plans.current")}</p> : null}
      {quote && !quote.error ? (
        <dl className="grid gap-1 text-sm">
          <div className="flex justify-between"><dt>{t("quote.price")}</dt><dd>{money(quote.subtotal)}</dd></div>
          {Number(quote.credit) > 0 ? <div className="flex justify-between"><dt>{t("quote.credit")}</dt><dd>-{money(quote.credit)}</dd></div> : null}
          <div className="flex justify-between"><dt>{quote.taxLabel} ({Number(quote.taxRate)}%)</dt><dd>{money(quote.tax)}</dd></div>
          <div className="flex justify-between font-medium"><dt>{t("quote.total")}</dt><dd>{money(quote.total)}</dd></div>
        </dl>
      ) : null}
      {quote?.error === "schedule_downgrade" ? <p className="text-sm">{t("quote.downgrade")}</p> : null}
      {quote?.error && quote.error !== "schedule_downgrade" ? <p className="text-destructive text-sm">{t("quote.unavailable")}</p> : null}
      {quote === null ? (
        <Button variant="outline" disabled={disabled} onClick={() => void loadQuote()}>
          {t(isCurrent ? "plans.renew" : "plans.choose")}
        </Button>
      ) : quote.error === "schedule_downgrade" ? (
        <LoadingButton variant="outline" loading={busy} onClick={onSchedule}>
          {t("quote.schedule")}
        </LoadingButton>
      ) : quote.error ? null : (
        <LoadingButton loading={busy} disabled={disabled} onClick={onCheckout}>
          {t("quote.pay", { total: money(quote.total) })}
        </LoadingButton>
      )}
    </div>
  );
}

function ProfileCard({ profile, onSaved }: { profile: BillingProfile | null; onSaved: () => void }) {
  const t = useTranslations("billing");
  const [legalName, setName] = useState(profile?.legal_name ?? "");
  const [taxId, setTaxId] = useState(profile?.tax_id ?? "");
  const [address, setAddress] = useState(profile?.address ?? "");
  const [city, setCity] = useState(profile?.city ?? "");
  const [country, setCountry] = useState(profile?.country ?? "AE");
  const [currency, setCurrency] = useState(profile?.currency ?? "AED");
  const [email, setEmail] = useState(profile?.email ?? "");
  const [pending, setPending] = useState(false);

  async function save(event: React.FormEvent) {
    event.preventDefault();
    setPending(true);
    const response = await fetch("/api/billing/profile", {
      method: "PUT",
      credentials: "same-origin",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ legalName, taxId, address, city, country: country.toUpperCase(), currency, email }),
    });
    const json = await response.json().catch(() => null);
    setPending(false);
    if (response.ok) {
      toast.success(t("saved"));
      onSaved();
    } else {
      toast.error(json?.message ?? t("failed"));
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t("profile.title")}</CardTitle>
        <CardDescription>{t("profile.hint")}</CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={save} className="grid gap-4 sm:grid-cols-2">
          <FormField label={t("profile.legalName")} htmlFor="bp-name" required>
            <Input id="bp-name" required value={legalName} onChange={(e) => setName(e.target.value)} />
          </FormField>
          <FormField label={t("profile.taxId")} htmlFor="bp-tax" hint={t("profile.taxIdHint")}>
            <Input id="bp-tax" dir="ltr" value={taxId} onChange={(e) => setTaxId(e.target.value)} />
          </FormField>
          <FormField label={t("profile.address")} htmlFor="bp-address">
            <Input id="bp-address" value={address} onChange={(e) => setAddress(e.target.value)} />
          </FormField>
          <FormField label={t("profile.city")} htmlFor="bp-city">
            <Input id="bp-city" value={city} onChange={(e) => setCity(e.target.value)} />
          </FormField>
          <FormField label={t("profile.country")} htmlFor="bp-country" required>
            <SimpleSelect
              id="bp-country"
              value={country}
              onChange={setCountry}
              options={[
                { value: "AE", label: t("profile.countries.AE") },
                { value: "IN", label: t("profile.countries.IN") },
              ]}
            />
          </FormField>
          <FormField label={t("profile.currency")} htmlFor="bp-currency" required>
            <SimpleSelect
              id="bp-currency"
              value={currency}
              onChange={setCurrency}
              options={[
                { value: "AED", label: "AED" },
                { value: "INR", label: "INR" },
              ]}
            />
          </FormField>
          <FormField label={t("profile.email")} htmlFor="bp-email" hint={t("profile.emailHint")}>
            <Input id="bp-email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
          </FormField>
          <div className="flex items-end justify-end sm:col-span-2">
            <LoadingButton type="submit" loading={pending}>{t("profile.save")}</LoadingButton>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}
