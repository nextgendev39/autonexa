"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";

import { FormField } from "@/components/forms/form-field";
import { ActionDialog, usePlatformAction } from "@/components/platform/platform-ui";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";

export function StorefrontToggleAction({ id, disabled }: { id: string; disabled: boolean }) {
  const t = useTranslations("platform");
  const { run, pending, error } = usePlatformAction();
  const [reason, setReason] = useState("");
  return (
    <ActionDialog
      trigger={
        <Button variant={disabled ? "outline" : "ghost"} size="sm">
          {t(disabled ? "storefronts.enable" : "storefronts.disable")}
        </Button>
      }
      title={t(disabled ? "storefronts.enable" : "storefronts.disable")}
      description={t(disabled ? "storefronts.enableHint" : "storefronts.disableHint")}
      submitLabel={t(disabled ? "storefronts.enable" : "storefronts.disable")}
      destructive={!disabled}
      error={error}
      pending={pending}
      onSubmit={() => run(`/api/platform/storefronts/${id}`, "POST", { disabled: !disabled, reason: reason || null })}
    >
      {disabled ? null : (
        <FormField label={t("common.reason")} htmlFor="sf-reason">
          <Textarea id="sf-reason" value={reason} onChange={(e) => setReason(e.target.value)} />
        </FormField>
      )}
    </ActionDialog>
  );
}
