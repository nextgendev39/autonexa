"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";

import { FormField } from "@/components/forms/form-field";
import { LoadingButton } from "@/components/shared/loading-button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import type { BillingEntityRow, PlanPriceRow, TaxRateRow } from "@/lib/platform/service";

const saveSetting = async (body: Record<string, unknown>) => {
  const response = await fetch("/api/platform/billing/settings", {
    method: "PUT",
    credentials: "same-origin",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  return response.ok;
};

export function BillingSettingsClient({
  taxes,
  entities,
  plans,
  prices,
  canManageBilling,
  canManagePlans,
}: {
  taxes: TaxRateRow[];
  entities: BillingEntityRow[];
  plans: { id: string; name: string; currency: string }[];
  prices: PlanPriceRow[];
  canManageBilling: boolean;
  canManagePlans: boolean;
}) {
  const t = useTranslations("platform");
  return (
    <div className="grid gap-6">
      <Card>
        <CardHeader>
          <CardTitle>{t("billingSettings.sellerTitle")}</CardTitle>
          <CardDescription>{t("billingSettings.sellerHint")}</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-6">
          {(["AED", "INR"] as const).map((currency) => (
            <EntityForm key={currency} currency={currency} entity={entities.find((e) => e.currency === currency)} disabled={!canManageBilling} />
          ))}
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>{t("billingSettings.taxTitle")}</CardTitle>
          <CardDescription>{t("billingSettings.taxHint")}</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4">
          {taxes.map((tax) => (
            <TaxForm key={tax.country} tax={tax} disabled={!canManageBilling} />
          ))}
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>{t("billingSettings.pricesTitle")}</CardTitle>
          <CardDescription>{t("billingSettings.pricesHint")}</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4">
          {plans.map((plan) => (
            <PriceForm key={plan.id} plan={plan} prices={prices} disabled={!canManagePlans} />
          ))}
        </CardContent>
      </Card>
    </div>
  );
}

function SaveButton({ pending, disabled }: { pending: boolean; disabled: boolean }) {
  const t = useTranslations("platform");
  return (
    <LoadingButton type="submit" loading={pending} disabled={disabled}>
      {t("common.save")}
    </LoadingButton>
  );
}

function useForm(body: () => Record<string, unknown>) {
  const t = useTranslations("platform");
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  return {
    pending,
    message,
    submit: async (event: React.FormEvent) => {
      event.preventDefault();
      setPending(true);
      const ok = await saveSetting(body());
      setPending(false);
      setMessage(t(ok ? "common.saved" : "common.failed"));
    },
  };
}

function EntityForm({ currency, entity, disabled }: { currency: "AED" | "INR"; entity?: BillingEntityRow; disabled: boolean }) {
  const t = useTranslations("platform");
  const [legalName, setName] = useState(entity?.legal_name ?? "");
  const [taxId, setTaxId] = useState(entity?.tax_id ?? "");
  const [address, setAddress] = useState(entity?.address ?? "");
  const [email, setEmail] = useState(entity?.email ?? "");
  const form = useForm(() => ({ type: "entity", currency, legalName, taxId, address, email }));
  return (
    <form onSubmit={form.submit} className="grid items-end gap-3 sm:grid-cols-[auto_1fr_1fr_1fr_1fr_auto]">
      <span className="pb-2 text-sm font-medium">{currency}</span>
      <FormField label={t("billingSettings.legalName")} htmlFor={`e-name-${currency}`} required>
        <Input id={`e-name-${currency}`} required disabled={disabled} value={legalName} onChange={(e) => setName(e.target.value)} />
      </FormField>
      <FormField label={t("billingSettings.taxId")} htmlFor={`e-tax-${currency}`}>
        <Input id={`e-tax-${currency}`} disabled={disabled} value={taxId} onChange={(e) => setTaxId(e.target.value)} />
      </FormField>
      <FormField label={t("billingSettings.address")} htmlFor={`e-address-${currency}`}>
        <Input id={`e-address-${currency}`} disabled={disabled} value={address} onChange={(e) => setAddress(e.target.value)} />
      </FormField>
      <FormField label={t("billingSettings.email")} htmlFor={`e-email-${currency}`}>
        <Input id={`e-email-${currency}`} type="email" disabled={disabled} value={email} onChange={(e) => setEmail(e.target.value)} />
      </FormField>
      <SaveButton pending={form.pending} disabled={disabled} />
      {form.message ? <p role="status" className="text-muted-foreground text-sm sm:col-span-6">{form.message}</p> : null}
    </form>
  );
}

function TaxForm({ tax, disabled }: { tax: TaxRateRow; disabled: boolean }) {
  const t = useTranslations("platform");
  const [label, setLabel] = useState(tax.label);
  const [rate, setRate] = useState(String(tax.rate));
  const form = useForm(() => ({ type: "tax", country: tax.country, label, rate: Number(rate) }));
  return (
    <form onSubmit={form.submit} className="grid items-end gap-3 sm:grid-cols-[auto_1fr_1fr_auto]">
      <span className="pb-2 text-sm font-medium">{tax.country}</span>
      <FormField label={t("billingSettings.taxLabel")} htmlFor={`t-label-${tax.country}`} required>
        <Input id={`t-label-${tax.country}`} required disabled={disabled} value={label} onChange={(e) => setLabel(e.target.value)} />
      </FormField>
      <FormField label={t("billingSettings.rate")} htmlFor={`t-rate-${tax.country}`} required>
        <Input id={`t-rate-${tax.country}`} type="number" min="0" max="100" step="0.01" required disabled={disabled} value={rate} onChange={(e) => setRate(e.target.value)} />
      </FormField>
      <SaveButton pending={form.pending} disabled={disabled} />
      {form.message ? <p role="status" className="text-muted-foreground text-sm sm:col-span-4">{form.message}</p> : null}
    </form>
  );
}

function PriceForm({ plan, prices, disabled }: { plan: { id: string; name: string }; prices: PlanPriceRow[]; disabled: boolean }) {
  const t = useTranslations("platform");
  const of = (cycle: string) => prices.find((p) => p.plan_id === plan.id && p.currency === "INR" && p.billing_cycle === cycle);
  const [monthly, setMonthly] = useState(of("monthly") ? String(of("monthly")?.amount) : "");
  const [yearly, setYearly] = useState(of("yearly") ? String(of("yearly")?.amount) : "");
  const form = useForm(() => ({
    type: "price",
    planId: plan.id,
    currency: "INR",
    monthly: monthly === "" ? null : Number(monthly),
    yearly: yearly === "" ? null : Number(yearly),
  }));
  return (
    <form onSubmit={form.submit} className="grid items-end gap-3 sm:grid-cols-[8rem_1fr_1fr_auto]">
      <span className="pb-2 text-sm font-medium">{plan.name}</span>
      <FormField label={t("billingSettings.inrMonthly")} htmlFor={`p-m-${plan.id}`}>
        <Input id={`p-m-${plan.id}`} type="number" min="0" step="0.01" disabled={disabled} value={monthly} onChange={(e) => setMonthly(e.target.value)} />
      </FormField>
      <FormField label={t("billingSettings.inrYearly")} htmlFor={`p-y-${plan.id}`}>
        <Input id={`p-y-${plan.id}`} type="number" min="0" step="0.01" disabled={disabled} value={yearly} onChange={(e) => setYearly(e.target.value)} />
      </FormField>
      <SaveButton pending={form.pending} disabled={disabled} />
      {form.message ? <p role="status" className="text-muted-foreground text-sm sm:col-span-4">{form.message}</p> : null}
    </form>
  );
}
