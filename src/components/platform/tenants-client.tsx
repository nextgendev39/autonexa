"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { PlusIcon } from "lucide-react";

import { FormField } from "@/components/forms/form-field";
import { ActionDialog, endOfDayIso, SimpleSelect, usePlatformAction } from "@/components/platform/platform-ui";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

const slugify = (name: string) =>
  name.toLowerCase().trim().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 60);

export function CreateTenantDialog({ plans }: { plans: { id: string; name: string }[] }) {
  const t = useTranslations("platform");
  const { run, pending, error } = usePlatformAction();
  const [name, setName] = useState("");
  const [slug, setSlug] = useState("");
  const [numberPrefix, setPrefix] = useState("");
  const [planId, setPlanId] = useState(plans[0]?.id ?? "");
  const [status, setStatus] = useState("trialing");
  const [billingCycle, setCycle] = useState("monthly");
  const [periodEnd, setPeriodEnd] = useState("");
  const [ownerEmail, setEmail] = useState("");
  const [ownerFirstName, setFirst] = useState("");
  const [ownerLastName, setLast] = useState("");

  return (
    <ActionDialog
      trigger={
        <Button>
          <PlusIcon />
          {t("tenants.create")}
        </Button>
      }
      title={t("tenants.create")}
      description={t("tenants.createHint")}
      submitLabel={t("tenants.createSubmit")}
      error={error}
      pending={pending}
      onSubmit={() =>
        run("/api/platform/tenants", "POST", {
          name,
          slug,
          numberPrefix,
          planId,
          status,
          billingCycle,
          periodEnd: endOfDayIso(periodEnd),
          ownerEmail,
          ownerFirstName,
          ownerLastName,
        })
      }
    >
      <FormField label={t("tenants.name")} htmlFor="t-name" required>
        <Input
          id="t-name"
          required
          value={name}
          onChange={(e) => {
            setName(e.target.value);
            setSlug(slugify(e.target.value));
          }}
        />
      </FormField>
      <div className="grid gap-4 sm:grid-cols-2">
        <FormField label={t("tenants.slug")} htmlFor="t-slug" hint={t("tenants.slugHint")} required>
          <Input id="t-slug" required value={slug} onChange={(e) => setSlug(e.target.value)} />
        </FormField>
        <FormField label={t("tenants.prefix")} htmlFor="t-prefix" hint={t("tenants.prefixHint")} required>
          <Input
            id="t-prefix"
            required
            maxLength={8}
            value={numberPrefix}
            onChange={(e) => setPrefix(e.target.value.toUpperCase())}
          />
        </FormField>
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <FormField label={t("subscriptions.plan")} htmlFor="t-plan" required>
          <SimpleSelect
            id="t-plan"
            value={planId}
            onChange={setPlanId}
            options={plans.map((p) => ({ value: p.id, label: p.name }))}
          />
        </FormField>
        <FormField label={t("subscriptions.startAs")} htmlFor="t-status" required>
          <SimpleSelect
            id="t-status"
            value={status}
            onChange={setStatus}
            options={[
              { value: "trialing", label: t("status.trialing") },
              { value: "active", label: t("status.active") },
            ]}
          />
        </FormField>
        <FormField label={t("subscriptions.cycle")} htmlFor="t-cycle" required>
          <SimpleSelect
            id="t-cycle"
            value={billingCycle}
            onChange={setCycle}
            options={[
              { value: "monthly", label: t("cycle.monthly") },
              { value: "yearly", label: t("cycle.yearly") },
              { value: "custom", label: t("cycle.custom") },
            ]}
          />
        </FormField>
        <FormField label={t("subscriptions.periodEnd")} htmlFor="t-end" hint={t("subscriptions.periodEndHint")}>
          <Input id="t-end" type="date" value={periodEnd} onChange={(e) => setPeriodEnd(e.target.value)} />
        </FormField>
      </div>
      <FormField label={t("tenants.ownerEmail")} htmlFor="t-email" hint={t("tenants.ownerHint")} required>
        <Input id="t-email" type="email" required value={ownerEmail} onChange={(e) => setEmail(e.target.value)} />
      </FormField>
      <div className="grid gap-4 sm:grid-cols-2">
        <FormField label={t("common.firstName")} htmlFor="t-first" required>
          <Input id="t-first" required value={ownerFirstName} onChange={(e) => setFirst(e.target.value)} />
        </FormField>
        <FormField label={t("common.lastName")} htmlFor="t-last" required>
          <Input id="t-last" required value={ownerLastName} onChange={(e) => setLast(e.target.value)} />
        </FormField>
      </div>
    </ActionDialog>
  );
}
