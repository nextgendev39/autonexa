"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { Trash2Icon } from "lucide-react";

import { FormField } from "@/components/forms/form-field";
import { ActionDialog, endOfDayIso, SimpleSelect, usePlatformAction } from "@/components/platform/platform-ui";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import type { SettingsRow } from "@/lib/platform/service";

const base = (id: string) => `/api/platform/tenants/${id}`;

export function TenantStatusAction({ id, status }: { id: string; status: "active" | "suspended" }) {
  const t = useTranslations("platform");
  const { run, pending, error } = usePlatformAction();
  const [reason, setReason] = useState("");
  const suspending = status === "active";
  return (
    <ActionDialog
      trigger={<Button variant={suspending ? "destructive" : "default"}>{t(suspending ? "tenants.suspend" : "tenants.activate")}</Button>}
      title={t(suspending ? "tenants.suspendTitle" : "tenants.activateTitle")}
      description={t(suspending ? "tenants.suspendHint" : "tenants.activateHint")}
      submitLabel={t(suspending ? "tenants.suspend" : "tenants.activate")}
      destructive={suspending}
      error={error}
      pending={pending}
      onSubmit={() =>
        run(`${base(id)}/status`, "POST", { status: suspending ? "suspended" : "active", reason: reason || null })
      }
    >
      <FormField label={t("common.reason")} htmlFor="status-reason">
        <Textarea id="status-reason" value={reason} onChange={(e) => setReason(e.target.value)} />
      </FormField>
    </ActionDialog>
  );
}

export function TenantSettingsForm({
  id,
  name: initialName,
  settings,
}: {
  id: string;
  name: string;
  settings: SettingsRow | null;
}) {
  const t = useTranslations("platform");
  const { run, pending, error } = usePlatformAction();
  const [name, setName] = useState(initialName);
  const [displayName, setDisplayName] = useState(settings?.display_name ?? "");
  const [logoUrl, setLogoUrl] = useState(settings?.logo_url ?? "");
  const [primaryColor, setColor] = useState(settings?.primary_color ?? "");
  const [contactEmail, setEmail] = useState(settings?.contact_email ?? "");
  const [contactPhone, setPhone] = useState(settings?.contact_phone ?? "");
  const [address, setAddress] = useState(settings?.address ?? "");
  const [timezone, setTimezone] = useState(settings?.timezone ?? "Asia/Dubai");
  const [defaultLocale, setLocale] = useState(settings?.default_locale ?? "en");
  const [currency, setCurrency] = useState(settings?.currency ?? "AED");

  return (
    <ActionDialog
      trigger={<Button variant="outline">{t("common.edit")}</Button>}
      title={t("settings.title")}
      description={t("settings.hint")}
      submitLabel={t("common.save")}
      error={error}
      pending={pending}
      onSubmit={() =>
        run(base(id), "PATCH", {
          name,
          displayName: displayName || null,
          logoUrl: logoUrl || null,
          primaryColor: primaryColor || null,
          contactEmail: contactEmail || null,
          contactPhone: contactPhone || null,
          address: address || null,
          timezone,
          defaultLocale,
          currency,
        })
      }
    >
      <FormField label={t("tenants.name")} htmlFor="s-name" required>
        <Input id="s-name" required value={name} onChange={(e) => setName(e.target.value)} />
      </FormField>
      <FormField label={t("settings.displayName")} htmlFor="s-display">
        <Input id="s-display" value={displayName} onChange={(e) => setDisplayName(e.target.value)} />
      </FormField>
      <div className="grid gap-4 sm:grid-cols-2">
        <FormField label={t("settings.logoUrl")} htmlFor="s-logo" hint={t("settings.logoHint")}>
          <Input id="s-logo" type="url" value={logoUrl} onChange={(e) => setLogoUrl(e.target.value)} />
        </FormField>
        <FormField label={t("settings.color")} htmlFor="s-color" hint={t("settings.colorHint")}>
          <Input id="s-color" value={primaryColor} onChange={(e) => setColor(e.target.value)} placeholder="#1A2B3C" />
        </FormField>
        <FormField label={t("settings.contactEmail")} htmlFor="s-email">
          <Input id="s-email" type="email" value={contactEmail} onChange={(e) => setEmail(e.target.value)} />
        </FormField>
        <FormField label={t("settings.contactPhone")} htmlFor="s-phone">
          <Input id="s-phone" value={contactPhone} onChange={(e) => setPhone(e.target.value)} />
        </FormField>
      </div>
      <FormField label={t("settings.address")} htmlFor="s-address">
        <Input id="s-address" value={address} onChange={(e) => setAddress(e.target.value)} />
      </FormField>
      <div className="grid gap-4 sm:grid-cols-3">
        <FormField label={t("settings.timezone")} htmlFor="s-zone" required>
          <Input id="s-zone" required value={timezone} onChange={(e) => setTimezone(e.target.value)} />
        </FormField>
        <FormField label={t("settings.locale")} htmlFor="s-locale" required>
          <SimpleSelect
            id="s-locale"
            value={defaultLocale}
            onChange={setLocale}
            options={[
              { value: "en", label: "English" },
              { value: "ar", label: "العربية" },
            ]}
          />
        </FormField>
        <FormField label={t("settings.currency")} htmlFor="s-currency" required>
          <Input id="s-currency" required maxLength={3} value={currency} onChange={(e) => setCurrency(e.target.value.toUpperCase())} />
        </FormField>
      </div>
    </ActionDialog>
  );
}

export function AddDomainAction({ id }: { id: string }) {
  const t = useTranslations("platform");
  const { run, pending, error } = usePlatformAction();
  const [domain, setDomain] = useState("");
  const [isPrimary, setPrimary] = useState(false);
  return (
    <ActionDialog
      trigger={<Button variant="outline">{t("domains.add")}</Button>}
      title={t("domains.add")}
      description={t("domains.hint")}
      submitLabel={t("domains.add")}
      error={error}
      pending={pending}
      onSubmit={() => run(`${base(id)}/domains`, "POST", { domain, isPrimary })}
    >
      <FormField label={t("domains.domain")} htmlFor="d-domain" required>
        <Input id="d-domain" required placeholder="cars.example.com" value={domain} onChange={(e) => setDomain(e.target.value)} />
      </FormField>
      <label className="flex items-center gap-2 text-sm">
        <Switch checked={isPrimary} onCheckedChange={setPrimary} />
        {t("domains.primary")}
      </label>
    </ActionDialog>
  );
}

export function RemoveDomainAction({ id, domainId, domain }: { id: string; domainId: string; domain: string }) {
  const t = useTranslations("platform");
  const { run, pending, error } = usePlatformAction();
  return (
    <ActionDialog
      trigger={
        <Button variant="ghost" size="icon" aria-label={t("domains.remove")}>
          <Trash2Icon />
        </Button>
      }
      title={t("domains.remove")}
      description={domain}
      submitLabel={t("domains.remove")}
      destructive
      error={error}
      pending={pending}
      onSubmit={() => run(`${base(id)}/domains/${domainId}`, "DELETE")}
    />
  );
}

export function InviteOwnerAction({ id }: { id: string }) {
  const t = useTranslations("platform");
  const { run, pending, error } = usePlatformAction();
  const [ownerEmail, setEmail] = useState("");
  const [ownerFirstName, setFirst] = useState("");
  const [ownerLastName, setLast] = useState("");
  return (
    <ActionDialog
      trigger={<Button variant="outline">{t("tenants.inviteOwner")}</Button>}
      title={t("tenants.inviteOwner")}
      description={t("tenants.inviteOwnerHint")}
      submitLabel={t("tenants.inviteOwner")}
      error={error}
      pending={pending}
      onSubmit={() => run(`${base(id)}/owner`, "POST", { ownerEmail, ownerFirstName, ownerLastName })}
    >
      <FormField label={t("tenants.ownerEmail")} htmlFor="o-email" required>
        <Input id="o-email" type="email" required value={ownerEmail} onChange={(e) => setEmail(e.target.value)} />
      </FormField>
      <div className="grid gap-4 sm:grid-cols-2">
        <FormField label={t("common.firstName")} htmlFor="o-first" required>
          <Input id="o-first" required value={ownerFirstName} onChange={(e) => setFirst(e.target.value)} />
        </FormField>
        <FormField label={t("common.lastName")} htmlFor="o-last" required>
          <Input id="o-last" required value={ownerLastName} onChange={(e) => setLast(e.target.value)} />
        </FormField>
      </div>
    </ActionDialog>
  );
}

export function AssignPlanAction({ id, plans }: { id: string; plans: { id: string; name: string }[] }) {
  const t = useTranslations("platform");
  const { run, pending, error } = usePlatformAction();
  const [planId, setPlanId] = useState(plans[0]?.id ?? "");
  const [status, setStatus] = useState("active");
  const [billingCycle, setCycle] = useState("monthly");
  const [periodEnd, setPeriodEnd] = useState("");
  return (
    <ActionDialog
      trigger={<Button>{t("subscriptions.assign")}</Button>}
      title={t("subscriptions.assign")}
      description={t("subscriptions.assignHint")}
      submitLabel={t("subscriptions.assign")}
      error={error}
      pending={pending}
      onSubmit={() =>
        run(`${base(id)}/subscription`, "POST", {
          action: "assign",
          planId,
          status,
          billingCycle,
          periodEnd: endOfDayIso(periodEnd),
        })
      }
    >
      <FormField label={t("subscriptions.plan")} htmlFor="a-plan" required>
        <SimpleSelect id="a-plan" value={planId} onChange={setPlanId} options={plans.map((p) => ({ value: p.id, label: p.name }))} />
      </FormField>
      <div className="grid gap-4 sm:grid-cols-2">
        <FormField label={t("subscriptions.startAs")} htmlFor="a-status" required>
          <SimpleSelect
            id="a-status"
            value={status}
            onChange={setStatus}
            options={[
              { value: "active", label: t("status.active") },
              { value: "trialing", label: t("status.trialing") },
            ]}
          />
        </FormField>
        <FormField label={t("subscriptions.cycle")} htmlFor="a-cycle" required>
          <SimpleSelect
            id="a-cycle"
            value={billingCycle}
            onChange={setCycle}
            options={[
              { value: "monthly", label: t("cycle.monthly") },
              { value: "yearly", label: t("cycle.yearly") },
              { value: "custom", label: t("cycle.custom") },
            ]}
          />
        </FormField>
      </div>
      <FormField label={t("subscriptions.periodEnd")} htmlFor="a-end" hint={t("subscriptions.periodEndHint")}>
        <Input id="a-end" type="date" value={periodEnd} onChange={(e) => setPeriodEnd(e.target.value)} />
      </FormField>
    </ActionDialog>
  );
}

export function RenewAction({ id, subscriptionId }: { id: string; subscriptionId: string }) {
  const t = useTranslations("platform");
  const { run, pending, error, setError } = usePlatformAction();
  const [periodEnd, setPeriodEnd] = useState("");
  return (
    <ActionDialog
      trigger={<Button variant="outline">{t("subscriptions.renew")}</Button>}
      title={t("subscriptions.renew")}
      submitLabel={t("subscriptions.renew")}
      error={error}
      pending={pending}
      onSubmit={async () => {
        const iso = endOfDayIso(periodEnd);
        if (!iso) {
          setError(t("subscriptions.periodEndRequired"));
          return false;
        }
        return run(`${base(id)}/subscription`, "POST", { action: "renew", subscriptionId, periodEnd: iso });
      }}
    >
      <FormField label={t("subscriptions.periodEnd")} htmlFor="r-end" required>
        <Input id="r-end" type="date" required value={periodEnd} onChange={(e) => setPeriodEnd(e.target.value)} />
      </FormField>
    </ActionDialog>
  );
}

export function CancelSubscriptionAction({ id, subscriptionId }: { id: string; subscriptionId: string }) {
  const t = useTranslations("platform");
  const { run, pending, error } = usePlatformAction();
  const [reason, setReason] = useState("");
  return (
    <ActionDialog
      trigger={<Button variant="ghost">{t("subscriptions.cancel")}</Button>}
      title={t("subscriptions.cancel")}
      description={t("subscriptions.cancelHint")}
      submitLabel={t("subscriptions.cancel")}
      destructive
      error={error}
      pending={pending}
      onSubmit={() =>
        run(`${base(id)}/subscription`, "POST", { action: "cancel", subscriptionId, reason: reason || null })
      }
    >
      <FormField label={t("common.reason")} htmlFor="c-reason">
        <Textarea id="c-reason" value={reason} onChange={(e) => setReason(e.target.value)} />
      </FormField>
    </ActionDialog>
  );
}

export function CreateInvoiceAction({
  id,
  subscriptionId,
  currency: initialCurrency,
}: {
  id: string;
  subscriptionId: string | null;
  currency: string;
}) {
  const t = useTranslations("platform");
  const { run, pending, error } = usePlatformAction();
  const [amount, setAmount] = useState("");
  const [currency, setCurrency] = useState(initialCurrency);
  const [description, setDescription] = useState("");
  const [status, setStatus] = useState("issued");
  const [dueAt, setDueAt] = useState("");
  return (
    <ActionDialog
      trigger={<Button variant="outline">{t("billing.createInvoice")}</Button>}
      title={t("billing.createInvoice")}
      description={t("billing.manualHint")}
      submitLabel={t("billing.createInvoice")}
      error={error}
      pending={pending}
      onSubmit={() =>
        run(`${base(id)}/invoices`, "POST", {
          amount: Number(amount),
          currency,
          description: description || null,
          subscriptionId,
          status,
          dueAt: endOfDayIso(dueAt),
        })
      }
    >
      <div className="grid gap-4 sm:grid-cols-2">
        <FormField label={t("billing.amount")} htmlFor="i-amount" required>
          <Input id="i-amount" type="number" min="0" step="0.01" required value={amount} onChange={(e) => setAmount(e.target.value)} />
        </FormField>
        <FormField label={t("settings.currency")} htmlFor="i-currency" required>
          <Input id="i-currency" required maxLength={3} value={currency} onChange={(e) => setCurrency(e.target.value.toUpperCase())} />
        </FormField>
        <FormField label={t("billing.invoiceStatus")} htmlFor="i-status" required>
          <SimpleSelect
            id="i-status"
            value={status}
            onChange={setStatus}
            options={[
              { value: "issued", label: t("status.issued") },
              { value: "draft", label: t("status.draft") },
            ]}
          />
        </FormField>
        <FormField label={t("billing.due")} htmlFor="i-due">
          <Input id="i-due" type="date" value={dueAt} onChange={(e) => setDueAt(e.target.value)} />
        </FormField>
      </div>
      <FormField label={t("billing.description")} htmlFor="i-description">
        <Input id="i-description" value={description} onChange={(e) => setDescription(e.target.value)} />
      </FormField>
    </ActionDialog>
  );
}
