"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";

import { PhoneInput } from "@/components/forms/phone-input";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { CustomerListItem } from "@/lib/customers/service";
import { firstFieldErrors } from "@/lib/validation";
import { editCustomerSchema } from "@/lib/validation/customer";

function EditCustomerForm({
  customer,
  onDone,
  onSaved,
}: {
  customer: CustomerListItem;
  onDone: () => void;
  onSaved: () => void;
}) {
  const t = useTranslations("customers.edit");
  const tRoot = useTranslations();
  const msg = (key: string) => tRoot(key as Parameters<typeof tRoot>[0]);

  const [form, setForm] = useState({
    firstName: customer.firstName,
    lastName: customer.lastName,
    phone: customer.phone,
    email: customer.email ?? "",
    city: customer.city ?? "",
  });
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  function set(key: keyof typeof form, value: string) {
    const next = { ...form, [key]: value };
    setForm(next);
    if (Object.keys(fieldErrors).length > 0) {
      const parsed = editCustomerSchema.safeParse(next);
      setFieldErrors(parsed.success ? {} : firstFieldErrors(parsed.error));
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setFormError(null);
    const parsed = editCustomerSchema.safeParse(form);
    if (!parsed.success) {
      setFieldErrors(firstFieldErrors(parsed.error));
      return;
    }

    setSaving(true);
    const res = await fetch(`/api/customers/${customer.id}`, {
      method: "PATCH",
      credentials: "same-origin",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify(parsed.data),
    });
    const json = await res.json().catch(() => null);
    setSaving(false);

    if (json?.status !== "success") {
      if (json?.fieldErrors && Object.keys(json.fieldErrors).length > 0)
        setFieldErrors(json.fieldErrors);
      else setFormError(json?.message ?? t("failed"));
      return;
    }
    toast.success(t("saved"));
    onDone();
    onSaved();
  }

  const error = (key: string) =>
    fieldErrors[key] ? <p className="text-destructive text-xs">{msg(fieldErrors[key])}</p> : null;

  return (
    <form onSubmit={handleSubmit} noValidate className="grid gap-4">
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="edit-customer-first">{t("firstName")}</Label>
          <Input
            id="edit-customer-first"
            value={form.firstName}
            onChange={(e) => set("firstName", e.target.value)}
            aria-invalid={!!fieldErrors.firstName || undefined}
            aria-required
          />
          {error("firstName")}
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="edit-customer-last">{t("lastName")}</Label>
          <Input
            id="edit-customer-last"
            value={form.lastName}
            onChange={(e) => set("lastName", e.target.value)}
            aria-invalid={!!fieldErrors.lastName || undefined}
            aria-required
          />
          {error("lastName")}
        </div>
        <div className="flex flex-col gap-1.5 sm:col-span-2">
          <Label htmlFor="edit-customer-phone">{t("phone")}</Label>
          <PhoneInput
            id="edit-customer-phone"
            value={form.phone}
            onChange={(v) => set("phone", v)}
            invalid={!!fieldErrors.phone}
          />
          {error("phone")}
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="edit-customer-email">
            {t("email")}
            <span className="text-muted-foreground font-normal">({tRoot("common.optional")})</span>
          </Label>
          <Input
            id="edit-customer-email"
            type="email"
            inputMode="email"
            autoComplete="off"
            value={form.email}
            onChange={(e) => set("email", e.target.value)}
            aria-invalid={!!fieldErrors.email || undefined}
          />
          {error("email")}
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="edit-customer-city">
            {t("city")}
            <span className="text-muted-foreground font-normal">({tRoot("common.optional")})</span>
          </Label>
          <Input
            id="edit-customer-city"
            value={form.city}
            onChange={(e) => set("city", e.target.value)}
            aria-invalid={!!fieldErrors.city || undefined}
          />
          {error("city")}
        </div>
      </div>

      {formError ? <p className="text-destructive text-sm">{formError}</p> : null}

      <DialogFooter showCloseButton>
        <Button type="submit" disabled={saving}>
          {tRoot("common.save")}
        </Button>
      </DialogFooter>
    </form>
  );
}

export function EditCustomerDialog({
  customer,
  open,
  onOpenChange,
  onSaved,
}: {
  customer: CustomerListItem | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSaved: () => void;
}) {
  const t = useTranslations("customers.edit");
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{t("title")}</DialogTitle>
          <DialogDescription>
            {customer ? `${customer.code} · ${customer.name}` : null}
          </DialogDescription>
        </DialogHeader>
        {/* Keyed so reopening for another customer starts from their saved values. */}
        {customer && open ? (
          <EditCustomerForm
            key={customer.id}
            customer={customer}
            onDone={() => onOpenChange(false)}
            onSaved={onSaved}
          />
        ) : null}
      </DialogContent>
    </Dialog>
  );
}
