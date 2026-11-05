"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { PencilIcon, PlusIcon } from "lucide-react";

import { FormField } from "@/components/forms/form-field";
import { ActionDialog, usePlatformAction } from "@/components/platform/platform-ui";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import type { FeatureRow, PlanWithFeatures } from "@/lib/platform/service";

/** Empty means unlimited. */
const toLimit = (value: string) => (value.trim() === "" ? null : Number(value));
const fromLimit = (value: number | null | undefined) => (value == null ? "" : String(value));

export function PlanDialog({ plan, features }: { plan?: PlanWithFeatures; features: FeatureRow[] }) {
  const t = useTranslations("platform");
  const { run, pending, error } = usePlatformAction();
  const [key, setKey] = useState("");
  const [name, setName] = useState(plan?.name ?? "");
  const [description, setDescription] = useState(plan?.description ?? "");
  const [priceMonthly, setMonthly] = useState(String(plan?.price_monthly ?? 0));
  const [priceYearly, setYearly] = useState(String(plan?.price_yearly ?? 0));
  const [maxUsers, setUsers] = useState(fromLimit(plan?.max_users));
  const [maxBranches, setBranches] = useState(fromLimit(plan?.max_branches));
  const [maxVehicles, setVehicles] = useState(fromLimit(plan?.max_vehicles));
  const [maxStorageMb, setStorage] = useState(fromLimit(plan?.max_storage_mb));
  const [maxCustomDomains, setDomains] = useState(fromLimit(plan?.max_custom_domains));
  const [graceDays, setGrace] = useState(String(plan?.grace_days ?? 7));
  const [isActive, setActive] = useState(plan?.is_active ?? true);
  const [enabled, setEnabled] = useState<Record<string, boolean>>(plan?.features ?? {});

  const values = {
    name,
    description: description || null,
    priceMonthly: Number(priceMonthly),
    priceYearly: Number(priceYearly),
    currency: plan?.currency ?? "AED",
    maxUsers: toLimit(maxUsers),
    maxBranches: toLimit(maxBranches),
    maxVehicles: toLimit(maxVehicles),
    maxStorageMb: toLimit(maxStorageMb),
    maxCustomDomains: toLimit(maxCustomDomains),
    graceDays: Number(graceDays),
    isActive,
    sortOrder: plan?.sort_order ?? 100,
    features: enabled,
  };

  return (
    <ActionDialog
      trigger={
        plan ? (
          <Button variant="ghost" size="icon" aria-label={t("common.edit")}>
            <PencilIcon />
          </Button>
        ) : (
          <Button>
            <PlusIcon />
            {t("plans.create")}
          </Button>
        )
      }
      title={plan ? plan.name : t("plans.create")}
      description={plan ? t("plans.editHint") : undefined}
      submitLabel={t("common.save")}
      error={error}
      pending={pending}
      onSubmit={() =>
        plan
          ? run(`/api/platform/plans/${plan.id}`, "PATCH", values)
          : run("/api/platform/plans", "POST", { key, ...values })
      }
    >
      {plan ? null : (
        <FormField label={t("plans.key")} htmlFor="pl-key" hint={t("plans.keyHint")} required>
          <Input id="pl-key" required value={key} onChange={(e) => setKey(e.target.value)} />
        </FormField>
      )}
      <FormField label={t("plans.name")} htmlFor="pl-name" required>
        <Input id="pl-name" required value={name} onChange={(e) => setName(e.target.value)} />
      </FormField>
      <FormField label={t("billing.description")} htmlFor="pl-desc">
        <Input id="pl-desc" value={description} onChange={(e) => setDescription(e.target.value)} />
      </FormField>
      <div className="grid gap-4 sm:grid-cols-2">
        <FormField label={t("plans.priceMonthly")} htmlFor="pl-m" required>
          <Input id="pl-m" type="number" min="0" step="0.01" required value={priceMonthly} onChange={(e) => setMonthly(e.target.value)} />
        </FormField>
        <FormField label={t("plans.priceYearly")} htmlFor="pl-y" required>
          <Input id="pl-y" type="number" min="0" step="0.01" required value={priceYearly} onChange={(e) => setYearly(e.target.value)} />
        </FormField>
      </div>
      <fieldset className="grid gap-4 sm:grid-cols-2">
        <legend className="mb-2 text-sm font-medium">{t("plans.limits")}</legend>
        <FormField label={t("usage.users")} htmlFor="pl-users" hint={t("plans.limitHint")}>
          <Input id="pl-users" type="number" min="0" value={maxUsers} onChange={(e) => setUsers(e.target.value)} />
        </FormField>
        <FormField label={t("usage.branches")} htmlFor="pl-branches">
          <Input id="pl-branches" type="number" min="0" value={maxBranches} onChange={(e) => setBranches(e.target.value)} />
        </FormField>
        <FormField label={t("usage.vehicles")} htmlFor="pl-vehicles">
          <Input id="pl-vehicles" type="number" min="0" value={maxVehicles} onChange={(e) => setVehicles(e.target.value)} />
        </FormField>
        <FormField label={t("plans.storageMb")} htmlFor="pl-storage">
          <Input id="pl-storage" type="number" min="0" value={maxStorageMb} onChange={(e) => setStorage(e.target.value)} />
        </FormField>
        <FormField label={t("plans.customDomains")} htmlFor="pl-domains">
          <Input id="pl-domains" type="number" min="0" value={maxCustomDomains} onChange={(e) => setDomains(e.target.value)} />
        </FormField>
        <FormField label={t("plans.graceDays")} htmlFor="pl-grace" hint={t("plans.graceHint")} required>
          <Input id="pl-grace" type="number" min="0" max="90" required value={graceDays} onChange={(e) => setGrace(e.target.value)} />
        </FormField>
      </fieldset>
      <fieldset className="grid gap-2">
        <legend className="mb-2 text-sm font-medium">{t("plans.features")}</legend>
        {features.map((feature) => (
          <label key={feature.key} className="flex items-center justify-between gap-3 text-sm">
            <span>{t(`features.${feature.key}` as never)}</span>
            <Switch
              checked={enabled[feature.key] === true}
              onCheckedChange={(checked) => setEnabled((current) => ({ ...current, [feature.key]: checked }))}
            />
          </label>
        ))}
      </fieldset>
      <label className="flex items-center gap-2 text-sm">
        <Switch checked={isActive} onCheckedChange={setActive} />
        {t("plans.active")}
      </label>
    </ActionDialog>
  );
}
