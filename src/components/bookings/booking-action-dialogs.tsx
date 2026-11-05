"use client";

import {
  BadgeCheckIcon,
  CircleAlertIcon,
  CircleCheckIcon,
  ShieldCheckIcon,
  ShieldXIcon,
  XCircleIcon,
} from "lucide-react";
import { useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { toast } from "sonner";

import { LoadingButton } from "@/components/shared/loading-button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { NativeSelect } from "@/components/inventory/native-select";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import type { AppLocale } from "@/config/app";
import type { BookingListItem } from "@/lib/bookings/service";
import { cn } from "@/lib/utils";
import { formatCurrency } from "@/lib/utils/currency";
import { REFUND_METHODS } from "@/lib/validation/booking";

type DialogProps = {
  booking: BookingListItem | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onDone: () => void;
};

async function patchBooking(id: string, body: Record<string, unknown>) {
  const res = await fetch(`/api/bookings/${id}`, {
    method: "PATCH",
    credentials: "same-origin",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify(body),
  });
  return (await res.json().catch(() => null)) as
    | { status: "success" }
    | { status: "error"; message?: string; fieldErrors?: Record<string, string> }
    | null;
}

function BookingSubject({ booking }: { booking: BookingListItem }) {
  return (
    <>
      <span className="font-mono">{booking.number}</span>
      {booking.vehicle ? ` · ${booking.vehicle.title}` : null}
      {booking.customer ? ` · ${booking.customer.name}` : null}
    </>
  );
}

function MarkSoldForm({ booking, onOpenChange, onDone }: DialogProps & { booking: BookingListItem }) {
  const t = useTranslations("bookings");
  const tRoot = useTranslations();
  const locale = useLocale() as AppLocale;
  const money = (value: number) => formatCurrency(value, locale, booking.currency);
  const due = booking.balanceDue;

  // Selling closes the booking with the full balance received; it isn't editable here.
  const received = due ?? 0;
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setSaving(true);
    const json = await patchBooking(booking.id, { action: "sold" });
    setSaving(false);
    if (json?.status !== "success") {
      const fieldError = json?.status === "error" ? json.fieldErrors?.balanceReceived : undefined;
      if (fieldError) setError(fieldError);
      else toast.error((json?.status === "error" && json.message) || t("errors.actionFailed"));
      return;
    }
    toast.success(t("markedSold"));
    onOpenChange(false);
    onDone();
  }

  const rows: { label: string; value: string; strong?: boolean }[] = [
    {
      label: booking.units > 1 ? t("sold.totalUnits", { count: booking.units }) : t("sold.sellingPrice"),
      value: booking.totalPrice == null ? "—" : money(booking.totalPrice),
    },
    { label: t("sold.depositPaid"), value: `− ${money(booking.deposit)}` },
    { label: t("sold.balanceDue"), value: due == null ? "—" : money(due), strong: true },
  ];

  return (
    <form onSubmit={handleSubmit} noValidate className="grid gap-5">
      <dl className="bg-muted/50 grid gap-2 rounded-xl border p-4 text-sm">
        {rows.map((row) => (
          <div
            key={row.label}
            className={cn(
              "flex items-center justify-between gap-3",
              row.strong && "mt-1 border-t pt-3 text-base font-semibold",
            )}
          >
            <dt className={row.strong ? undefined : "text-muted-foreground"}>{row.label}</dt>
            <dd className="tabular-nums">{row.value}</dd>
          </div>
        ))}
      </dl>

      <div className="grid content-start gap-1.5">
        <Label htmlFor="sold-balance-received">{t("sold.balanceReceived")}</Label>
        <Input
          id="sold-balance-received"
          value={money(received)}
          readOnly
          aria-readonly
          tabIndex={-1}
          aria-describedby="sold-balance-hint"
          className="bg-muted/60 cursor-default font-semibold tabular-nums focus-visible:ring-0"
        />
        <div id="sold-balance-hint" aria-live="polite" className="min-h-5 text-xs">
          {error ? (
            <p className="text-destructive flex items-center gap-1.5">
              <CircleAlertIcon className="size-3.5" aria-hidden />
              {tRoot(error as Parameters<typeof tRoot>[0])}
            </p>
          ) : (
            <p className="flex items-center gap-1.5 text-emerald-700 dark:text-emerald-300">
              <CircleCheckIcon className="size-3.5" aria-hidden />
              {t("sold.fullBalanceHint")}
            </p>
          )}
        </div>
      </div>

      <p className="text-muted-foreground text-xs">{t("sold.effect")}</p>

      <DialogFooter showCloseButton>
        <LoadingButton type="submit" variant="brand" loading={saving}>
          <BadgeCheckIcon />
          {t("sold.confirm")}
        </LoadingButton>
      </DialogFooter>
    </form>
  );
}

export function MarkSoldDialog(props: DialogProps) {
  const t = useTranslations("bookings");
  const { booking, open, onOpenChange } = props;
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{t("sold.title")}</DialogTitle>
          <DialogDescription>{booking ? <BookingSubject booking={booking} /> : null}</DialogDescription>
        </DialogHeader>
        {/* Keyed so each booking opens with its own balance prefilled. */}
        {booking && open ? <MarkSoldForm key={booking.id} {...props} booking={booking} /> : null}
      </DialogContent>
    </Dialog>
  );
}

function CancelForm({ booking, onOpenChange, onDone }: DialogProps & { booking: BookingListItem }) {
  const t = useTranslations("bookings");
  const tRoot = useTranslations();
  const locale = useLocale() as AppLocale;
  const money = (value: number) => formatCurrency(value, locale, booking.currency);
  // A received deposit is settled as part of cancelling: by default all of it goes back.
  const hasDeposit = booking.deposit > 0;
  const [reason, setReason] = useState("");
  const [refundAmount, setRefundAmount] = useState(hasDeposit ? String(booking.deposit) : "");
  const [method, setMethod] = useState<(typeof REFUND_METHODS)[number] | "">("");
  const [reference, setReference] = useState("");
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);

  const amount = Number(refundAmount);
  const kept = hasDeposit && Number.isFinite(amount) ? Math.max(0, booking.deposit - amount) : 0;

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (saving) return;

    let refund: Record<string, unknown> | undefined;
    if (hasDeposit) {
      const next: Record<string, string> = {};
      if (refundAmount.trim() === "" || !Number.isFinite(amount) || amount < 0) {
        next.amount = "validation.currency";
      } else if (amount > booking.deposit) {
        next.amount = "bookings.cancelDialog.refundTooHigh";
      }
      if (!method) next.method = "validation.required";
      setErrors(next);
      if (Object.keys(next).length > 0) return;
      refund = { amount, method, reference: reference.trim() || undefined };
    }

    setSaving(true);
    const json = await patchBooking(booking.id, {
      action: "cancel",
      reason: reason.trim() || undefined,
      refund,
    });
    setSaving(false);
    if (json?.status !== "success") {
      const fieldErrors = json?.status === "error" ? json.fieldErrors : undefined;
      if (fieldErrors?.["refund.amount"]) setErrors({ amount: fieldErrors["refund.amount"] });
      else toast.error((json?.status === "error" && json.message) || t("errors.actionFailed"));
      return;
    }
    toast.success(hasDeposit ? t("cancelDialog.refundedAndCancelled") : t("cancelled"));
    onOpenChange(false);
    onDone();
  }

  const error = (key: string) =>
    errors[key] ? (
      <p className="text-destructive text-xs">
        {tRoot(errors[key] as Parameters<typeof tRoot>[0])}
      </p>
    ) : null;

  return (
    <form onSubmit={handleSubmit} noValidate className="grid gap-4">
      <p className="text-muted-foreground text-sm">{t("cancelDialog.effect")}</p>

      {hasDeposit ? (
        <section className="grid gap-3 rounded-xl border border-amber-500/30 bg-amber-500/5 p-4">
          <div className="flex items-start justify-between gap-3">
            <div className="grid gap-0.5">
              <h3 className="text-sm font-semibold">{t("cancelDialog.refundTitle")}</h3>
              <p className="text-muted-foreground text-xs">{t("cancelDialog.refundHint")}</p>
            </div>
            <div className="shrink-0 text-end">
              <p className="text-muted-foreground text-xs">{t("cancelDialog.depositReceived")}</p>
              <p className="font-semibold tabular-nums">{money(booking.deposit)}</p>
            </div>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <div className="grid content-start gap-1.5">
              <Label htmlFor="cancel-refund-amount">{t("cancelDialog.refundAmount")}</Label>
              <Input
                id="cancel-refund-amount"
                type="number"
                inputMode="decimal"
                min={0}
                max={booking.deposit}
                step="0.01"
                value={refundAmount}
                onChange={(event) => setRefundAmount(event.target.value)}
                aria-invalid={!!errors.amount || undefined}
              />
              {error("amount") ??
                (kept > 0 ? (
                  <p className="text-muted-foreground text-xs">
                    {t("cancelDialog.refundKept", { amount: money(kept) })}
                  </p>
                ) : null)}
            </div>
            <div className="grid content-start gap-1.5">
              <Label htmlFor="cancel-refund-method">{t("cancelDialog.refundMethod")}</Label>
              <NativeSelect
                id="cancel-refund-method"
                value={method}
                onChange={(event) => setMethod(event.target.value as typeof method)}
                aria-invalid={!!errors.method || undefined}
              >
                <option value="" disabled>
                  {t("cancelDialog.refundMethodPlaceholder")}
                </option>
                {REFUND_METHODS.map((value) => (
                  <option key={value} value={value}>
                    {t(`cancelDialog.refundMethods.${value}`)}
                  </option>
                ))}
              </NativeSelect>
              {error("method")}
            </div>
          </div>

          <div className="grid content-start gap-1.5">
            <Label htmlFor="cancel-refund-reference">
              {t("cancelDialog.refundReference")}
              <span className="text-muted-foreground font-normal">({tRoot("common.optional")})</span>
            </Label>
            <Input
              id="cancel-refund-reference"
              maxLength={200}
              value={reference}
              onChange={(event) => setReference(event.target.value)}
              placeholder={t("cancelDialog.refundReferencePlaceholder")}
            />
          </div>
        </section>
      ) : null}

      <div className="grid content-start gap-1.5">
        <Label htmlFor="cancel-booking-reason">{t("cancelDialog.reason")}</Label>
        <Textarea
          id="cancel-booking-reason"
          rows={3}
          maxLength={500}
          value={reason}
          onChange={(event) => setReason(event.target.value)}
          placeholder={t("cancelDialog.reasonPlaceholder")}
        />
      </div>
      <DialogFooter showCloseButton>
        <LoadingButton type="submit" variant="destructive" loading={saving}>
          <XCircleIcon />
          {hasDeposit ? t("cancelDialog.confirmRefund") : t("cancelDialog.confirm")}
        </LoadingButton>
      </DialogFooter>
    </form>
  );
}

export function CancelBookingDialog(props: DialogProps) {
  const t = useTranslations("bookings");
  const { booking, open, onOpenChange } = props;
  const hasDeposit = (booking?.deposit ?? 0) > 0;
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className={hasDeposit ? "sm:max-w-lg" : "sm:max-w-md"}>
        <DialogHeader>
          <DialogTitle>
            {hasDeposit ? t("cancelDialog.titleRefund") : t("cancelDialog.title")}
          </DialogTitle>
          <DialogDescription>{booking ? <BookingSubject booking={booking} /> : null}</DialogDescription>
        </DialogHeader>
        {booking && open ? <CancelForm key={booking.id} {...props} booking={booking} /> : null}
      </DialogContent>
    </Dialog>
  );
}

function RequestHoldForm({ booking, onOpenChange, onDone }: DialogProps & { booking: BookingListItem }) {
  const t = useTranslations("bookings");
  const tRoot = useTranslations();
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (saving) return;
    if (!reason.trim()) {
      setError("validation.required");
      return;
    }
    setSaving(true);
    const json = await patchBooking(booking.id, { action: "request_hold", reason: reason.trim() });
    setSaving(false);
    if (json?.status !== "success") {
      const fieldError = json?.status === "error" ? json.fieldErrors?.reason : undefined;
      if (fieldError) setError(fieldError);
      else toast.error((json?.status === "error" && json.message) || t("errors.actionFailed"));
      // Already requested or no longer possible: show the booking as it is now.
      if (!fieldError) onDone();
      return;
    }
    toast.success(t("holdDialog.sent"));
    onOpenChange(false);
    onDone();
  }

  return (
    <form onSubmit={handleSubmit} noValidate className="grid gap-4">
      <p className="text-muted-foreground text-sm">{t("holdDialog.effect")}</p>
      <div className="grid content-start gap-1.5">
        <Label htmlFor="hold-request-reason">{t("holdDialog.reason")}</Label>
        <Textarea
          id="hold-request-reason"
          rows={3}
          maxLength={500}
          value={reason}
          aria-invalid={Boolean(error)}
          aria-describedby={error ? "hold-request-error" : undefined}
          onChange={(event) => {
            setReason(event.target.value);
            if (error) setError(null);
          }}
          placeholder={t("holdDialog.reasonPlaceholder")}
        />
        {error ? (
          <p id="hold-request-error" className="text-destructive flex items-center gap-1.5 text-xs">
            <CircleAlertIcon className="size-3.5" aria-hidden />
            {tRoot(error as Parameters<typeof tRoot>[0])}
          </p>
        ) : null}
      </div>
      <DialogFooter showCloseButton>
        <LoadingButton type="submit" variant="brand" loading={saving}>
          <ShieldCheckIcon />
          {t("holdDialog.confirm")}
        </LoadingButton>
      </DialogFooter>
    </form>
  );
}

/** Sales executive: ask the Super Admins to keep a booking without a deposit from auto-cancelling. */
export function RequestHoldDialog(props: DialogProps) {
  const t = useTranslations("bookings");
  const { booking, open, onOpenChange } = props;
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{t("holdDialog.title")}</DialogTitle>
          <DialogDescription>{booking ? <BookingSubject booking={booking} /> : null}</DialogDescription>
        </DialogHeader>
        {booking && open ? <RequestHoldForm key={booking.id} {...props} booking={booking} /> : null}
      </DialogContent>
    </Dialog>
  );
}

function ReviewHoldForm({ booking, onOpenChange, onDone }: DialogProps & { booking: BookingListItem }) {
  const t = useTranslations("bookings");
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState<"approve" | "reject" | null>(null);
  const hold = booking.cancellationHold;

  async function review(decision: "approve" | "reject") {
    if (saving) return;
    setSaving(decision);
    const json = await patchBooking(booking.id, {
      action: "review_hold",
      decision,
      note: note.trim() || undefined,
    });
    setSaving(null);
    if (json?.status !== "success") {
      toast.error((json?.status === "error" && json.message) || t("errors.actionFailed"));
      onOpenChange(false);
      onDone();
      return;
    }
    toast.success(decision === "approve" ? t("reviewDialog.approved") : t("reviewDialog.rejected"));
    onOpenChange(false);
    onDone();
  }

  return (
    <div className="grid gap-4">
      <dl className="bg-muted/50 grid gap-2 rounded-xl border p-4 text-sm">
        <div className="flex items-center justify-between gap-3">
          <dt className="text-muted-foreground">{t("reviewDialog.requestedBy")}</dt>
          <dd className="font-medium">{hold?.requestedBy ?? "—"}</dd>
        </div>
        <div className="grid gap-1">
          <dt className="text-muted-foreground">{t("reviewDialog.reason")}</dt>
          <dd className="whitespace-pre-wrap">{hold?.reason || "—"}</dd>
        </div>
      </dl>
      <p className="text-muted-foreground text-sm">{t("reviewDialog.effect")}</p>
      <div className="grid content-start gap-1.5">
        <Label htmlFor="hold-review-note">{t("reviewDialog.note")}</Label>
        <Textarea
          id="hold-review-note"
          rows={2}
          maxLength={500}
          value={note}
          onChange={(event) => setNote(event.target.value)}
        />
      </div>
      <DialogFooter showCloseButton>
        <LoadingButton
          type="button"
          variant="outline"
          className="text-destructive"
          loading={saving === "reject"}
          disabled={saving !== null}
          onClick={() => review("reject")}
        >
          <ShieldXIcon />
          {t("reviewDialog.reject")}
        </LoadingButton>
        <LoadingButton
          type="button"
          variant="brand"
          loading={saving === "approve"}
          disabled={saving !== null}
          onClick={() => review("approve")}
        >
          <ShieldCheckIcon />
          {t("reviewDialog.approve")}
        </LoadingButton>
      </DialogFooter>
    </div>
  );
}

/** Super Admin: approve or reject a pending cancellation hold. */
export function ReviewHoldDialog(props: DialogProps) {
  const t = useTranslations("bookings");
  const { booking, open, onOpenChange } = props;
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{t("reviewDialog.title")}</DialogTitle>
          <DialogDescription>{booking ? <BookingSubject booking={booking} /> : null}</DialogDescription>
        </DialogHeader>
        {booking && open ? <ReviewHoldForm key={booking.id} {...props} booking={booking} /> : null}
      </DialogContent>
    </Dialog>
  );
}
