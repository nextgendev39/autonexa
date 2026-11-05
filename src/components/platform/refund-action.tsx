"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";

import { FormField } from "@/components/forms/form-field";
import { ActionDialog, usePlatformAction } from "@/components/platform/platform-ui";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";

export function RefundAction({ id, amount, viaGateway }: { id: string; amount: number; viaGateway: boolean }) {
  const t = useTranslations("platform");
  const { run, pending, error } = usePlatformAction();
  const [value, setValue] = useState(String(amount));
  const [reason, setReason] = useState("");
  return (
    <ActionDialog
      trigger={
        <Button variant="ghost" size="sm">
          {t("billing.refund")}
        </Button>
      }
      title={t("billing.refund")}
      description={t(viaGateway ? "billing.refundGatewayHint" : "billing.refundManualHint")}
      submitLabel={t("billing.refund")}
      destructive
      error={error}
      pending={pending}
      onSubmit={() =>
        run("/api/platform/billing/refunds", "POST", { transactionId: id, amount: Number(value), reason: reason || null })
      }
    >
      <FormField label={t("billing.amount")} htmlFor="rf-amount" required>
        <Input id="rf-amount" type="number" min="0" step="0.01" required value={value} onChange={(e) => setValue(e.target.value)} />
      </FormField>
      <FormField label={t("common.reason")} htmlFor="rf-reason">
        <Textarea id="rf-reason" value={reason} onChange={(e) => setReason(e.target.value)} />
      </FormField>
    </ActionDialog>
  );
}
