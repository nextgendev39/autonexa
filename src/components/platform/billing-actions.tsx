"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";

import { FormField } from "@/components/forms/form-field";
import { ActionDialog, SimpleSelect, usePlatformAction } from "@/components/platform/platform-ui";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

const METHODS = ["bank_transfer", "cash", "card", "cheque", "manual", "other"];

export function RecordPaymentAction({ id, amount: due }: { id: string; amount: number }) {
  const t = useTranslations("platform");
  const { run, pending, error } = usePlatformAction();
  const [amount, setAmount] = useState(String(due));
  const [method, setMethod] = useState("bank_transfer");
  const [reference, setReference] = useState("");
  return (
    <ActionDialog
      trigger={
        <Button variant="outline" size="sm">
          {t("billing.recordPayment")}
        </Button>
      }
      title={t("billing.recordPayment")}
      description={t("billing.manualHint")}
      submitLabel={t("billing.recordPayment")}
      error={error}
      pending={pending}
      onSubmit={() =>
        run(`/api/platform/invoices/${id}/payments`, "POST", {
          amount: Number(amount),
          method,
          reference: reference || null,
        })
      }
    >
      <div className="grid gap-4 sm:grid-cols-2">
        <FormField label={t("billing.amount")} htmlFor="p-amount" hint={t("billing.amountHint")} required>
          <Input id="p-amount" type="number" step="0.01" required value={amount} onChange={(e) => setAmount(e.target.value)} />
        </FormField>
        <FormField label={t("billing.method")} htmlFor="p-method" required>
          <SimpleSelect
            id="p-method"
            value={method}
            onChange={setMethod}
            options={METHODS.map((value) => ({ value, label: t(`methods.${value}` as never) }))}
          />
        </FormField>
      </div>
      <FormField label={t("billing.reference")} htmlFor="p-reference">
        <Input id="p-reference" value={reference} onChange={(e) => setReference(e.target.value)} />
      </FormField>
    </ActionDialog>
  );
}

export function InvoiceStatusAction({ id, status }: { id: string; status: "issued" | "void" }) {
  const t = useTranslations("platform");
  const { run, pending, error } = usePlatformAction();
  const voiding = status === "void";
  return (
    <ActionDialog
      trigger={
        <Button variant="ghost" size="sm">
          {t(voiding ? "billing.void" : "billing.issue")}
        </Button>
      }
      title={t(voiding ? "billing.void" : "billing.issue")}
      description={t(voiding ? "billing.voidHint" : "billing.issueHint")}
      submitLabel={t(voiding ? "billing.void" : "billing.issue")}
      destructive={voiding}
      error={error}
      pending={pending}
      onSubmit={() => run(`/api/platform/invoices/${id}`, "PATCH", { status })}
    />
  );
}
