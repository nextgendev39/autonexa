"use client";

import { useEffect, useMemo, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { ShieldCheckIcon } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { toast } from "sonner";

import { PhoneInput } from "@/components/forms/phone-input";
import { Badge } from "@/components/ui/badge";
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
import { SearchableSelect } from "@/components/ui/searchable-select";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import type { BookableVehicle, CustomerOption, PersonOption } from "@/lib/bookings/service";
import { firstFieldErrors } from "@/lib/validation";
import { useFormatDuration } from "@/hooks/use-format-duration";
import { createBookingSchema } from "@/lib/validation/booking";
import type { AppLocale } from "@/config/app";
import { formatCurrency } from "@/lib/utils/currency";
import { quantityTotal } from "@/lib/vehicles/quantity";

const emptyForm = () => ({
  vehicleId: "",
  customerMode: "existing" as "existing" | "new",
  customerId: "",
  salespersonId: "",
  firstName: "",
  lastName: "",
  phone: "",
  deposit: "",
  sellingPrice: "",
  quantity: "1",
  notes: "",
});

export function NewBookingDialog({
  open,
  onOpenChange,
  initialVehicleId,
  initialQuantity,
  initialCustomerId,
  canCreateCustomer,
  sell = false,
  depositMinutes: initialDepositMinutes,
  onCreated,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  initialVehicleId?: string;
  /** Units to book when opened for a multi-unit car (e.g. from Update status). */
  initialQuantity?: number;
  /** An existing customer to book for (e.g. "Book a car" on the Customers screen). */
  initialCustomerId?: string;
  canCreateCustomer: boolean;
  /** Sell the car now, paid in full, instead of booking it (no deposit). */
  sell?: boolean;
  /** Payment terms the caller already has, so the deposit hint shows without waiting. */
  depositMinutes?: number;
  onCreated: () => void;
}) {
  const locale = useLocale() as AppLocale;
  const queryClient = useQueryClient();
  const t = useTranslations("bookings");
  const tRoot = useTranslations();
  const msg = (key: string) => tRoot(key as Parameters<typeof tRoot>[0]);

  const [form, setForm] = useState(() => ({
    ...emptyForm(),
    vehicleId: initialVehicleId ?? "",
    customerId: initialCustomerId ?? "",
    quantity: String(initialQuantity ?? 1),
  }));
  const [vehicles, setVehicles] = useState<BookableVehicle[]>([]);
  const [customers, setCustomers] = useState<CustomerOption[]>([]);
  const [salesExecutives, setSalesExecutives] = useState<PersonOption[]>([]);
  const [selfSalespersonId, setSelfSalespersonId] = useState<string | null>(null);
  const [depositMinutes, setDepositMinutes] = useState<number | null>(
    initialDepositMinutes ?? null,
  );
  const formatDuration = useFormatDuration();
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [submitted, setSubmitted] = useState(false);
  const [saving, setSaving] = useState(false);
  const [optionsLoaded, setOptionsLoaded] = useState(false);
  // Opened for a specific car: hold the form behind a skeleton until its details arrive,
  // so the car, units and price don't pop in after the form shows.
  const loadingVehicle = !!initialVehicleId && !optionsLoaded;

  useEffect(() => {
    if (!open) return;
    void fetch("/api/bookings/options", { credentials: "same-origin" })
      // A failed request can have an empty or non-JSON body.
      .then((res) => res.json().catch(() => null))
      .catch(() => null)
      .then((json) => {
        setOptionsLoaded(true);
        if (json?.status !== "success") {
          setFormError(json?.message ?? t("errors.optionsFailed"));
          return;
        }
        setVehicles(json.data.vehicles);
        // A car passed in from Inventory gets its price prefilled once options arrive.
        const preselected = (json.data.vehicles as BookableVehicle[]).find(
          (v) => v.id === initialVehicleId,
        );
        if (preselected?.sellingPrice != null) {
          setForm((prev) =>
            prev.sellingPrice === ""
              ? { ...prev, sellingPrice: String(preselected.sellingPrice) }
              : prev,
          );
        }
        setCustomers(json.data.customers);
        setSalesExecutives(json.data.salesExecutives);
        setSelfSalespersonId(json.data.selfSalespersonId);
        setDepositMinutes((prev) => json.data.paymentTerms?.depositMinutes ?? prev);
        if (json.data.customers.length === 0) {
          setForm((prev) => ({ ...prev, customerMode: canCreateCustomer ? "new" : "existing" }));
        }
      });
  }, [open, canCreateCustomer, initialVehicleId, t]);

  type FormValues = ReturnType<typeof emptyForm>;

  // Who the booking belongs to: an existing customer's own sales executive,
  // otherwise the signed-in sales executive, otherwise whoever is picked.
  function lockedSalesperson(values: FormValues): PersonOption | null {
    if (values.customerMode === "existing") {
      const owner = customers.find((c) => c.id === values.customerId)?.salesperson;
      if (owner) return owner;
    }
    if (selfSalespersonId) {
      return (
        salesExecutives.find((p) => p.id === selfSalespersonId) ?? {
          id: selfSalespersonId,
          name: "",
        }
      );
    }
    return null;
  }

  function duplicateCustomer(values: FormValues) {
    if (values.customerMode !== "new" || !values.phone) return null;
    return customers.find((c) => c.phone === values.phone) ?? null;
  }

  function toPayload(values: FormValues) {
    return {
      ...values,
      // Deposit is optional: blank means none received yet. A sale has none.
      deposit: sell || values.deposit.trim() === "" ? 0 : Number(values.deposit),
      sell: sell || undefined,
      sellingPrice: values.sellingPrice === "" ? Number.NaN : Number(values.sellingPrice),
      // Only multi-unit cars send a quantity; otherwise the whole record is booked.
      quantity:
        unitsFor(values.vehicleId) > 1
          ? values.quantity === ""
            ? Number.NaN
            : Number(values.quantity)
          : undefined,
      customerId: values.customerMode === "existing" ? values.customerId : undefined,
      salespersonId: lockedSalesperson(values)?.id ?? (values.salespersonId || undefined),
    };
  }

  function validate(values: ReturnType<typeof emptyForm>) {
    const parsed = createBookingSchema.safeParse(toPayload(values));
    const errors: Record<string, string> = parsed.success ? {} : firstFieldErrors(parsed.error);
    const quantity = Number(values.quantity);
    if (unitsFor(values.vehicleId) > 1 && quantity > unitsFor(values.vehicleId)) {
      errors.quantity = "bookings.errors.tooManyUnits";
    }
    if (duplicateCustomer(values)) errors.phone = "bookings.errors.customerExists";
    const customerChosen = values.customerMode === "new" || !!values.customerId;
    if (customerChosen && !lockedSalesperson(values) && !values.salespersonId) {
      errors.salespersonId = "bookings.errors.salespersonRequired";
    }
    setFieldErrors(errors);
    return Object.keys(errors).length === 0;
  }

  function set<K extends keyof FormValues>(key: K, value: FormValues[K]) {
    update({ [key]: value } as Partial<FormValues>);
  }

  function update(patch: Partial<FormValues>) {
    const next = { ...form, ...patch };
    setForm(next);
    if (submitted) {
      validate(next);
    } else if (patch.phone !== undefined) {
      // Duplicate phone numbers are flagged as soon as they're typed.
      setFieldErrors((prev) => {
        const rest = { ...prev };
        delete rest.phone;
        return duplicateCustomer(next)
          ? { ...rest, phone: "bookings.errors.customerExists" }
          : rest;
      });
    }
  }

  function unitsFor(vehicleId: string) {
    return vehicles.find((v) => v.id === vehicleId)?.quantity ?? 1;
  }

  // Prefill the car's current selling price; the user can still change it.
  function selectVehicle(vehicleId: string) {
    const price = vehicles.find((v) => v.id === vehicleId)?.sellingPrice;
    update({ vehicleId, sellingPrice: price == null ? "" : String(price), quantity: "1" });
  }

  function selectDuplicate(customerId: string) {
    update({ customerMode: "existing", customerId, phone: "", firstName: "", lastName: "" });
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitted(true);
    setFormError(null);
    if (!validate(form)) return;

    setSaving(true);
    const res = await fetch("/api/bookings", {
      method: "POST",
      credentials: "same-origin",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify(toPayload(form)),
    });
    const json = await res.json().catch(() => null);
    setSaving(false);

    if (!json || json.status !== "success") {
      if (json?.fieldErrors && Object.keys(json.fieldErrors).length > 0) {
        setFieldErrors(json.fieldErrors);
      } else {
        setFormError(json?.message ?? t("errors.createFailed"));
      }
      return;
    }

    // A colleague's customer: the booking went to their sales executive, not this user's list.
    const assignedTo = (json.data as { assignedTo?: string | null } | undefined)?.assignedTo;
    toast.success(t(sell ? "markedSold" : "created"), {
      description: assignedTo ? t("assignedToColleague", { name: assignedTo }) : undefined,
    });
    // Picks up the new booking's deposit deadline, so it's applied the moment it passes.
    void queryClient.invalidateQueries({ queryKey: ["notifications"] });
    onOpenChange(false);
    onCreated();
  }

  const vehicleOptions = useMemo(
    () =>
      vehicles.map((v) => ({
        value: v.id,
        label: v.stockNumber ? `${v.stockNumber} · ${v.title}` : v.title,
      })),
    [vehicles],
  );
  const customerOptions = useMemo(
    () => customers.map((c) => ({ value: c.id, label: `${c.name} · ${c.phone}` })),
    [customers],
  );

  const error = (key: string) =>
    fieldErrors[key] ? <p className="text-destructive text-xs">{msg(fieldErrors[key])}</p> : null;

  const selectedUnits = unitsFor(form.vehicleId);
  const bookedUnits = Number(form.quantity);
  // Selling price is per unit; show the total once more than one unit is booked.
  const sellingTotal =
    selectedUnits > 1 &&
    Number.isInteger(bookedUnits) &&
    bookedUnits > 1 &&
    form.sellingPrice !== ""
      ? quantityTotal(Number(form.sellingPrice), bookedUnits)
      : null;
  // A sale is paid in full: the whole selling price (× units) is received.
  const saleUnits = selectedUnits > 1 ? bookedUnits : 1;
  const saleTotal =
    form.sellingPrice !== "" &&
    Number.isFinite(Number(form.sellingPrice)) &&
    Number.isInteger(saleUnits)
      ? quantityTotal(Number(form.sellingPrice), saleUnits)
      : null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <form onSubmit={handleSubmit} noValidate>
          <DialogHeader>
            <DialogTitle>{t(sell ? "sellTitle" : "newTitle")}</DialogTitle>
            <DialogDescription>{t(sell ? "sellDescription" : "newDescription")}</DialogDescription>
          </DialogHeader>

          {loadingVehicle ? (
            <BookingFormSkeleton sell={sell} />
          ) : (
            <div className="mt-4 flex max-h-[65svh] flex-col gap-4 overflow-y-auto px-0.5">
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="booking-vehicle">{t("vehicle")}</Label>
                <SearchableSelect
                  id="booking-vehicle"
                  value={form.vehicleId}
                  onValueChange={selectVehicle}
                  options={vehicleOptions}
                  optional={false}
                  placeholder={vehicles.length ? t("selectVehicle") : t("noVehicles")}
                />
                {error("vehicleId")}
              </div>

              {selectedUnits > 1 ? (
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="booking-quantity">{t("units")}</Label>
                  <Input
                    id="booking-quantity"
                    type="number"
                    inputMode="numeric"
                    min={1}
                    max={selectedUnits}
                    step={1}
                    value={form.quantity}
                    onChange={(e) => set("quantity", e.target.value)}
                    aria-invalid={!!fieldErrors.quantity || undefined}
                    aria-describedby="booking-quantity-hint"
                    className="sm:max-w-40"
                  />
                  <p id="booking-quantity-hint" className="text-muted-foreground text-xs">
                    {t("unitsHint", { count: selectedUnits })}
                  </p>
                  {error("quantity")}
                </div>
              ) : null}

              <div className="flex flex-col gap-1.5">
                <Label>{t("customer")}</Label>
                {canCreateCustomer ? (
                  <div
                    className="bg-muted inline-flex w-fit rounded-lg p-0.5 text-sm"
                    role="radiogroup"
                  >
                    {(["existing", "new"] as const).map((mode) => (
                      <button
                        key={mode}
                        type="button"
                        role="radio"
                        aria-checked={form.customerMode === mode}
                        onClick={() => set("customerMode", mode)}
                        className={
                          form.customerMode === mode
                            ? "bg-background rounded-md px-3 py-1 font-medium shadow-xs"
                            : "text-muted-foreground px-3 py-1"
                        }
                      >
                        {t(mode === "existing" ? "existingCustomer" : "newCustomer")}
                      </button>
                    ))}
                  </div>
                ) : null}

                {form.customerMode === "existing" ? (
                  <>
                    <SearchableSelect
                      id="booking-customer"
                      value={form.customerId}
                      onValueChange={(v) => set("customerId", v)}
                      options={customerOptions}
                      optional={false}
                      placeholder={customers.length ? t("selectCustomer") : t("noCustomers")}
                    />
                    {error("customerId")}
                  </>
                ) : (
                  <div className="grid gap-3 sm:grid-cols-2">
                    <div className="flex flex-col gap-1.5">
                      <Label htmlFor="booking-first">{t("firstName")}</Label>
                      <Input
                        id="booking-first"
                        value={form.firstName}
                        onChange={(e) => set("firstName", e.target.value)}
                        aria-invalid={!!fieldErrors.firstName || undefined}
                      />
                      {error("firstName")}
                    </div>
                    <div className="flex flex-col gap-1.5">
                      <Label htmlFor="booking-last">{t("lastName")}</Label>
                      <Input
                        id="booking-last"
                        value={form.lastName}
                        onChange={(e) => set("lastName", e.target.value)}
                        aria-invalid={!!fieldErrors.lastName || undefined}
                      />
                      {error("lastName")}
                    </div>
                    <div className="flex flex-col gap-1.5 sm:col-span-2">
                      <Label htmlFor="booking-phone">{t("phone")}</Label>
                      <PhoneInput
                        id="booking-phone"
                        value={form.phone}
                        onChange={(v) => set("phone", v)}
                        invalid={!!fieldErrors.phone}
                      />
                      {error("phone")}
                      {duplicateCustomer(form) ? (
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          className="w-fit"
                          onClick={() => selectDuplicate(duplicateCustomer(form)!.id)}
                        >
                          {t("useExisting", { name: duplicateCustomer(form)!.name })}
                        </Button>
                      ) : null}
                    </div>
                  </div>
                )}
              </div>

              <div className="flex flex-col gap-1.5">
                <Label htmlFor="booking-salesperson">{t("salesperson")}</Label>
                {lockedSalesperson(form) ? (
                  <>
                    <Input
                      id="booking-salesperson"
                      value={lockedSalesperson(form)!.name}
                      readOnly
                      disabled
                    />
                    <p className="text-muted-foreground text-xs">
                      {form.customerMode === "existing" &&
                      customers.find((c) => c.id === form.customerId)?.salesperson
                        ? t("salespersonLinked")
                        : t("salespersonSelf")}
                    </p>
                  </>
                ) : (
                  <SearchableSelect
                    id="booking-salesperson"
                    value={form.salespersonId}
                    onValueChange={(v) => set("salespersonId", v)}
                    options={salesExecutives.map((p) => ({
                      value: p.id,
                      label: p.name,
                      badge: p.isSuperAdmin ? (
                        <Badge
                          variant="outline"
                          className="border-brand/40 bg-brand/10 text-brand h-5 gap-1 px-1.5 text-[11px]"
                        >
                          <ShieldCheckIcon data-icon="inline-start" aria-hidden />
                          {tRoot("modules.users.roleNames.super_admin")}
                        </Badge>
                      ) : undefined,
                    }))}
                    optional={false}
                    placeholder={
                      salesExecutives.length ? t("selectSalesperson") : t("noSalespeople")
                    }
                  />
                )}
                {error("salespersonId")}
              </div>

              <div className={sell ? "grid gap-3" : "grid gap-3 sm:grid-cols-2"}>
                {sell ? null : (
                  <div className="flex flex-col gap-1.5">
                    <Label htmlFor="booking-deposit">
                      {t("deposit")}
                      <span className="text-muted-foreground font-normal">
                        ({tRoot("common.optional")})
                      </span>
                    </Label>
                    <Input
                      id="booking-deposit"
                      placeholder="0"
                      type="number"
                      inputMode="decimal"
                      min={0}
                      step="0.01"
                      value={form.deposit}
                      onChange={(e) => set("deposit", e.target.value)}
                      aria-invalid={!!fieldErrors.deposit || undefined}
                    />
                    {error("deposit")}
                    {!fieldErrors.deposit &&
                    depositMinutes != null &&
                    !(Number(form.deposit) > 0) ? (
                      <p className="text-muted-foreground text-xs">
                        {t("depositHint", { duration: formatDuration(depositMinutes) })}
                      </p>
                    ) : null}
                  </div>
                )}
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="booking-selling-price">
                    {selectedUnits > 1
                      ? tRoot("inventory.quantity.perUnitLabel", { label: t("sellingPrice") })
                      : t("sellingPrice")}
                  </Label>
                  <Input
                    id="booking-selling-price"
                    type="number"
                    inputMode="decimal"
                    min={0}
                    step="0.01"
                    value={form.sellingPrice}
                    onChange={(e) => set("sellingPrice", e.target.value)}
                    aria-invalid={!!fieldErrors.sellingPrice || undefined}
                    aria-required
                  />
                  {sellingTotal != null ? (
                    <p className="text-muted-foreground text-xs">
                      {t("sellingTotal", {
                        count: bookedUnits,
                        total: formatCurrency(sellingTotal, locale),
                      })}
                    </p>
                  ) : null}
                  {error("sellingPrice")}
                </div>
              </div>

              {sell ? (
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="sale-amount-received">{t("sellAmountReceived")}</Label>
                  <Input
                    id="sale-amount-received"
                    value={saleTotal == null ? "—" : formatCurrency(saleTotal, locale)}
                    readOnly
                    aria-readonly
                    tabIndex={-1}
                    aria-describedby="sale-amount-hint"
                    className="bg-muted/60 cursor-default font-semibold tabular-nums focus-visible:ring-0"
                  />
                  <p id="sale-amount-hint" className="text-muted-foreground text-xs">
                    {t("sellPaidInFull")}
                  </p>
                </div>
              ) : null}

              <div className="flex flex-col gap-1.5">
                <Label htmlFor="booking-notes">{t("notes")}</Label>
                <Textarea
                  id="booking-notes"
                  rows={3}
                  value={form.notes}
                  onChange={(e) => set("notes", e.target.value)}
                />
              </div>

              {formError ? <p className="text-destructive text-sm">{formError}</p> : null}
            </div>
          )}

          <DialogFooter className="mt-6" showCloseButton>
            <Button type="submit" variant="brand" disabled={saving || loadingVehicle}>
              {t(sell ? "markSold" : "create")}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

/** Placeholder in the shape of the form: car, customer, sales person, prices, notes. */
function BookingFormSkeleton({ sell }: { sell: boolean }) {
  const field = (key: string, className?: string) => (
    <div
      key={key}
      className={className ? `flex flex-col gap-2 ${className}` : "flex flex-col gap-2"}
    >
      <Skeleton className="h-4 w-24" />
      <Skeleton className="h-9 w-full" />
    </div>
  );
  return (
    <div className="mt-4 flex flex-col gap-4 px-0.5" aria-busy aria-live="polite">
      {field("vehicle")}
      <div className="flex flex-col gap-2">
        <Skeleton className="h-4 w-20" />
        <Skeleton className="h-8 w-52" />
        <Skeleton className="h-9 w-full" />
      </div>
      {field("salesperson")}
      <div className={sell ? "grid gap-3" : "grid gap-3 sm:grid-cols-2"}>
        {sell ? null : field("deposit")}
        {field("price")}
      </div>
      <div className="flex flex-col gap-2">
        <Skeleton className="h-4 w-16" />
        <Skeleton className="h-20 w-full" />
      </div>
    </div>
  );
}
