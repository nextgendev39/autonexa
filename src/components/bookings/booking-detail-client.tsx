"use client";

import { useEffect, useState } from "react";
import {
  AlarmClockIcon,
  BadgeCheckIcon,
  BanIcon,
  CalendarCheckIcon,
  CarFrontIcon,
  CircleCheckIcon,
  CircleDashedIcon,
  CircleXIcon,
  PencilIcon,
  PhoneIcon,
  ShieldCheckIcon,
  ShieldEllipsisIcon,
  ShieldXIcon,
  StickyNoteIcon,
  TriangleAlertIcon,
  UserRoundIcon,
} from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { useRouter } from "next/navigation";

import {
  CancelBookingDialog,
  MarkSoldDialog,
  RequestHoldDialog,
  ReviewHoldDialog,
} from "@/components/bookings/booking-action-dialogs";
import { CountdownRing, PaymentBar, PaymentRing, type PaymentPart } from "@/components/bookings/booking-charts";
import { EditBookingDialog } from "@/components/bookings/edit-booking-dialog";
import { PageHeader } from "@/components/layout/page-header";
import { StatusBadge } from "@/components/shared/status-badge";
import { Button } from "@/components/ui/button";
import type { AppLocale } from "@/config/app";
import { useNow } from "@/hooks/use-now";
import { useViewerTimeZone } from "@/hooks/use-viewer-time-zone";
import type { BookingDetail } from "@/lib/bookings/service";
import { Link } from "@/lib/i18n/navigation";
import { cn } from "@/lib/utils";
import { formatCurrency } from "@/lib/utils/currency";
import { formatDate } from "@/lib/utils/date";
import { formatUaePhone } from "@/lib/utils/phone";
import { deadlineFrom } from "@/lib/validation/payment-terms";
import { vehicleHref } from "@/lib/vehicles/routes";

type Action = "edit" | "sold" | "cancel" | "requestHold" | "reviewHold";

const pad = (n: number) => String(n).padStart(2, "0");

/** "2d 04h 05m 09s" style countdown; drops leading zero units. */
function countdown(ms: number) {
  const total = Math.max(0, Math.floor(ms / 1000));
  const d = Math.floor(total / 86400);
  const h = Math.floor((total % 86400) / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  if (d > 0) return `${d}d ${pad(h)}h ${pad(m)}m`;
  if (h > 0) return `${h}h ${pad(m)}m ${pad(s)}s`;
  return `${pad(m)}m ${pad(s)}s`;
}

export function BookingDetailClient({ booking: b }: { booking: BookingDetail }) {
  const t = useTranslations("bookings.detail");
  const tBookings = useTranslations("bookings");
  const locale = useLocale() as AppLocale;
  const timeZone = useViewerTimeZone();
  const router = useRouter();
  const now = useNow(1000);
  const [action, setAction] = useState<Action | null>(null);

  const money = (value: number) => formatCurrency(value, locale, b.currency);
  const when = (iso: string) => formatDate(iso, locale, "dateTimeZone", timeZone);
  const refresh = () => router.refresh();

  // ---- Payment -----------------------------------------------------------
  const total = b.totalPrice ?? 0;
  const balancePaid = b.balanceReceived ?? 0;
  const collected = b.deposit + balancePaid;
  const outstanding = Math.max(0, total - collected);
  const paidShare = total > 0 ? Math.min(collected / total, 1) : 0;
  const parts: PaymentPart[] = [
    { key: "deposit", label: t("payment.deposit"), value: b.deposit, display: money(b.deposit) },
    { key: "balance", label: t("payment.balanceReceived"), value: balancePaid, display: money(balancePaid) },
    { key: "outstanding", label: t("payment.outstanding"), value: outstanding, display: money(outstanding) },
  ];

  // ---- Deadlines ---------------------------------------------------------
  const depositDueAt = deadlineFrom(b.reservedAt, b.paymentTerms.depositMinutes);
  const balanceDueAt = deadlineFrom(b.reservedAt, b.paymentTerms.balanceMinutes);
  const open = b.status === "active";
  // A pending or approved cancellation hold stops the deposit deadline.
  const depositOnHold =
    open &&
    b.deposit <= 0 &&
    (b.cancellationHold?.status === "pending" || b.cancellationHold?.status === "approved");
  const next = open
    ? b.depositDueAt
      ? { kind: "deposit" as const, at: b.depositDueAt }
      : b.balanceDueAt
        ? { kind: "balance" as const, at: b.balanceDueAt }
        : null
    : null;
  const nextMs = next ? new Date(next.at).getTime() : null;
  const startMs = new Date(b.reservedAt).getTime();
  const remaining = nextMs != null && now != null ? nextMs - now : null;
  const passed = remaining != null && remaining <= 0;

  // When the deadline passes, reload so the server applies it (cancel / alert).
  useEffect(() => {
    if (!passed) return;
    const timer = window.setTimeout(() => router.refresh(), 2500);
    return () => window.clearTimeout(timer);
  }, [passed, router]);

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title={b.number}
        description={t("subtitle", { date: when(b.reservedAt) })}
        actions={
          <div className="flex flex-wrap gap-2">
            {b.can.requestHold ? (
              <Button
                variant="outline"
                title={tBookings("requestHoldHint")}
                onClick={() => setAction("requestHold")}
              >
                <ShieldCheckIcon />
                {tBookings("requestHold")}
              </Button>
            ) : null}
            {b.can.reviewHold ? (
              <Button variant="brand" onClick={() => setAction("reviewHold")}>
                <ShieldEllipsisIcon />
                {tBookings("reviewHold")}
              </Button>
            ) : null}
            {b.can.edit ? (
              <Button variant="outline" onClick={() => setAction("edit")}>
                <PencilIcon />
                {tBookings("editAction")}
              </Button>
            ) : null}
            {b.can.cancel ? (
              <Button variant="outline" className="text-destructive" onClick={() => setAction("cancel")}>
                <BanIcon />
                {tBookings("cancelAction")}
              </Button>
            ) : null}
            {b.can.sell ? (
              <Button variant="brand" onClick={() => setAction("sold")}>
                <BadgeCheckIcon />
                {tBookings("markSold")}
              </Button>
            ) : null}
          </div>
        }
      />

      <StatusBanner booking={b} when={when} />

      <div className="grid gap-4 lg:grid-cols-3">
        {/* Vehicle hero */}
        <section className="bg-card relative overflow-hidden rounded-2xl border shadow-xs lg:col-span-2">
          <div className="grid sm:grid-cols-[minmax(0,15rem)_1fr]">
            <div className="bg-muted relative aspect-[16/10] sm:aspect-auto sm:min-h-52">
              {b.vehiclePhotoUrl ? (
                // eslint-disable-next-line @next/next/no-img-element -- short-lived signed URL
                <img src={b.vehiclePhotoUrl} alt="" className="absolute inset-0 size-full object-cover" />
              ) : (
                <div className="text-muted-foreground absolute inset-0 grid place-items-center">
                  <CarFrontIcon className="size-12 opacity-40" />
                </div>
              )}
            </div>
            <div className="flex flex-col gap-4 p-5">
              <div className="flex flex-wrap items-center gap-2">
                <StatusBadge status={`booking_${b.status}`} label={tBookings(`statuses.${b.status}`)} />
                {b.units > 1 ? (
                  <span className="bg-brand-soft text-brand rounded-full px-2 py-0.5 text-xs font-medium">
                    {tBookings("unitsBadge", { count: b.units })}
                  </span>
                ) : null}
              </div>
              <div className="grid gap-1">
                {b.vehicle ? (
                  <Link
                    href={b.vehicle.stockNumber ? vehicleHref(b.vehicle.stockNumber) : `/inventory/${b.vehicle.id}`}
                    className="hover:text-brand font-heading text-xl font-semibold tracking-tight transition-colors"
                  >
                    {b.vehicle.title}
                  </Link>
                ) : (
                  <span className="text-xl font-semibold">—</span>
                )}
                {b.vehicle?.stockNumber ? (
                  <span className="text-muted-foreground font-mono text-xs">{b.vehicle.stockNumber}</span>
                ) : null}
              </div>
              <dl className="mt-auto grid grid-cols-2 gap-3 sm:grid-cols-3">
                <Stat label={t("payment.total")} value={b.totalPrice == null ? "—" : money(b.totalPrice)} />
                <Stat label={t("payment.collected")} value={money(collected)} tone="good" />
                <Stat
                  label={t("payment.outstanding")}
                  value={money(outstanding)}
                  tone={outstanding > 0 ? "warning" : "good"}
                />
              </dl>
            </div>
          </div>
        </section>

        {/* Next deadline */}
        <section className="bg-card flex flex-col gap-4 rounded-2xl border p-5 shadow-xs">
          <h2 className="flex items-center gap-2 text-sm font-medium">
            <AlarmClockIcon className="text-muted-foreground size-4" />
            {t("nextDeadline.title")}
          </h2>
          {next && nextMs != null ? (
            <div className="flex items-center gap-4">
              <CountdownRing
                progress={now == null ? 0 : (now - startMs) / (nextMs - startMs)}
                tone={passed ? "critical" : remaining != null && remaining < (nextMs - startMs) * 0.25 ? "warning" : "neutral"}
              >
                <span className="text-muted-foreground text-[0.65rem] uppercase">
                  {passed ? t("nextDeadline.now") : t("nextDeadline.left")}
                </span>
              </CountdownRing>
              <div className="grid min-w-0 gap-1">
                <span className="text-muted-foreground text-xs">
                  {next.kind === "deposit" ? t("nextDeadline.deposit") : t("nextDeadline.balance")}
                </span>
                <span
                  className={cn(
                    "text-2xl font-semibold tracking-tight tabular-nums",
                    passed && "text-destructive",
                  )}
                  aria-live="polite"
                >
                  {remaining == null ? "—" : passed ? t("nextDeadline.applying") : countdown(remaining)}
                </span>
                <span className="text-muted-foreground text-xs">{when(next.at)}</span>
                <span className="text-muted-foreground text-xs">
                  {next.kind === "deposit" ? t("nextDeadline.depositMissed") : t("nextDeadline.balanceMissed")}
                </span>
              </div>
            </div>
          ) : (
            <div className="flex items-center gap-3">
              <span
                className={cn(
                  "flex size-11 items-center justify-center rounded-full",
                  b.status === "cancelled" ? "bg-muted text-muted-foreground" : "bg-emerald-600/12 text-emerald-700 dark:text-emerald-400",
                )}
              >
                {b.status === "cancelled" ? <CircleXIcon className="size-5" /> : <CircleCheckIcon className="size-5" />}
              </span>
              <p className="text-muted-foreground text-sm">
                {b.status === "cancelled"
                  ? t("nextDeadline.noneCancelled")
                  : b.balanceOverdue
                    ? t("nextDeadline.overdue", { date: when(balanceDueAt) })
                    : t("nextDeadline.none")}
              </p>
            </div>
          )}
        </section>

        {/* Payment chart */}
        <section className="bg-card grid gap-6 rounded-2xl border p-5 shadow-xs lg:col-span-2">
          <div className="flex items-baseline justify-between gap-3">
            <h2 className="text-sm font-medium">{t("payment.title")}</h2>
            {b.sellingPrice != null && b.units > 1 ? (
              <span className="text-muted-foreground text-xs">
                {t("payment.perUnit", { price: money(b.sellingPrice), count: b.units })}
              </span>
            ) : null}
          </div>
          {total > 0 ? (
            <div className="grid items-center gap-6 sm:grid-cols-[auto_1fr]">
              <PaymentRing
                parts={parts}
                centerValue={`${Math.round(paidShare * 100)}%`}
                centerLabel={t("payment.paid")}
              />
              <div className="grid gap-5">
                <PaymentBar parts={parts} label={t("payment.barLabel", { share: Math.round(paidShare * 100) })} />
                <p
                  className={cn(
                    "rounded-lg px-3 py-2 text-sm",
                    outstanding > 0
                      ? "bg-amber-500/10 text-amber-800 dark:text-amber-300"
                      : "bg-emerald-600/10 text-emerald-800 dark:text-emerald-300",
                  )}
                >
                  {outstanding > 0
                    ? t("payment.remaining", { amount: money(outstanding) })
                    : t("payment.fullyPaid")}
                </p>
              </div>
            </div>
          ) : (
            <p className="text-muted-foreground text-sm">{t("payment.noPrice")}</p>
          )}
        </section>

        {/* People */}
        <section className="bg-card grid content-start gap-4 rounded-2xl border p-5 shadow-xs">
          <h2 className="text-sm font-medium">{t("people.title")}</h2>
          <Person
            icon={UserRoundIcon}
            label={t("people.customer")}
            name={b.customer?.name ?? "—"}
            extra={
              b.customer ? (
                <a
                  href={`tel:${b.customer.phone}`}
                  dir="ltr"
                  className="text-muted-foreground hover:text-brand inline-flex items-center gap-1 text-xs tabular-nums transition-colors"
                >
                  <PhoneIcon className="size-3" />
                  {formatUaePhone(b.customer.phone)}
                </a>
              ) : null
            }
          />
          <Person icon={BadgeCheckIcon} label={t("people.salesperson")} name={b.salesperson?.name ?? "—"} />
          {/* Only when someone else booked it for the sales executive; otherwise it's the same name twice. */}
          {b.createdBy && b.createdBy !== b.salesperson?.id ? (
            <Person icon={CalendarCheckIcon} label={t("people.bookedBy")} name={b.bookedBy ?? "—"} />
          ) : null}
        </section>

        {/* Timeline */}
        <section className="bg-card rounded-2xl border p-5 shadow-xs lg:col-span-2">
          <h2 className="mb-4 text-sm font-medium">{t("timeline.title")}</h2>
          <ol className="relative grid gap-5 ps-1">
            <Step state="done" title={t("timeline.booked")} detail={when(b.reservedAt)} />
            <Step
              state={
                b.deposit > 0
                  ? "done"
                  : b.autoCancelled
                    ? "missed"
                    : open
                      ? depositOnHold
                        ? "upcoming"
                        : new Date(depositDueAt).getTime() <= (now ?? 0) && now != null
                          ? "missed"
                          : "upcoming"
                      : "skipped"
              }
              title={b.deposit > 0 ? t("timeline.depositReceived", { amount: money(b.deposit) }) : t("timeline.depositDue")}
              detail={
                b.deposit > 0
                  ? t("timeline.depositBy", { date: when(depositDueAt) })
                  : b.autoCancelled
                    ? t("timeline.depositMissed", { date: when(depositDueAt) })
                    : depositOnHold
                      ? t(`timeline.hold.${b.cancellationHold!.status}`)
                      : t("timeline.dueBy", { date: when(depositDueAt) })
              }
            />
            <Step
              state={
                outstanding <= 0 && total > 0
                  ? "done"
                  : b.balanceOverdue
                    ? "missed"
                    : b.status === "cancelled"
                      ? "skipped"
                      : "upcoming"
              }
              title={
                outstanding <= 0 && total > 0 ? t("timeline.paidInFull") : t("timeline.balanceDue")
              }
              detail={
                b.balanceOverdue
                  ? b.balanceAlertedAt
                    ? t("timeline.balanceAlerted", { date: when(b.balanceAlertedAt) })
                    : t("timeline.balanceMissed", { date: when(balanceDueAt) })
                  : t("timeline.dueBy", { date: when(balanceDueAt) })
              }
            />
            {b.status === "converted" && b.soldAt ? (
              <Step state="done" title={t("timeline.sold")} detail={when(b.soldAt)} />
            ) : null}
            {b.status === "cancelled" ? (
              <Step
                state="missed"
                title={b.autoCancelled ? t("timeline.autoCancelled") : t("timeline.cancelled")}
                detail={[b.cancelledAt ? when(b.cancelledAt) : null, b.cancelReason].filter(Boolean).join(" · ")}
              />
            ) : null}
            {b.status === "cancelled" && b.refund ? (
              <Step
                state="done"
                title={t("timeline.refunded", { amount: money(b.refund.amount) })}
                detail={refundDetail(b.refund, tBookings, when)}
              />
            ) : null}
          </ol>
        </section>

        {/* Notes */}
        <section className="bg-card grid content-start gap-3 rounded-2xl border p-5 shadow-xs">
          <h2 className="flex items-center gap-2 text-sm font-medium">
            <StickyNoteIcon className="text-muted-foreground size-4" />
            {t("notes")}
          </h2>
          <p className={cn("text-sm whitespace-pre-wrap", !b.notes && "text-muted-foreground")}>
            {b.notes || t("noNotes")}
          </p>
        </section>
      </div>

      <EditBookingDialog
        booking={b}
        depositMinutes={b.paymentTerms.depositMinutes}
        open={action === "edit"}
        onOpenChange={(o) => !o && setAction(null)}
        onSaved={refresh}
      />
      <MarkSoldDialog booking={b} open={action === "sold"} onOpenChange={(o) => !o && setAction(null)} onDone={refresh} />
      <CancelBookingDialog
        booking={b}
        open={action === "cancel"}
        onOpenChange={(o) => !o && setAction(null)}
        onDone={refresh}
      />
      <RequestHoldDialog
        booking={b}
        open={action === "requestHold"}
        onOpenChange={(o) => !o && setAction(null)}
        onDone={refresh}
      />
      <ReviewHoldDialog
        booking={b}
        open={action === "reviewHold"}
        onOpenChange={(o) => !o && setAction(null)}
        onDone={refresh}
      />
    </div>
  );
}

/** "Bank transfer · Ref 123 · by Omar · 12 Oct" for a recorded deposit refund. */
function refundDetail(
  refund: NonNullable<BookingDetail["refund"]>,
  t: ReturnType<typeof useTranslations<"bookings">>,
  when: (iso: string) => string,
) {
  return [
    refund.method ? t(`cancelDialog.refundMethods.${refund.method}` as Parameters<typeof t>[0]) : null,
    refund.reference ? t("refundRef", { reference: refund.reference }) : null,
    refund.refundedBy ? t("refundBy", { name: refund.refundedBy }) : null,
    refund.refundedAt ? when(refund.refundedAt) : null,
  ]
    .filter(Boolean)
    .join(" · ");
}

function StatusBanner({ booking: b, when }: { booking: BookingDetail; when: (iso: string) => string }) {
  const t = useTranslations("bookings.detail.banner");
  const tBookings = useTranslations("bookings");
  const locale = useLocale() as AppLocale;
  if (b.status === "cancelled") {
    return (
      <div className="border-destructive/30 bg-destructive/8 flex items-start gap-3 rounded-xl border p-4">
        <CircleXIcon className="text-destructive mt-0.5 size-5 shrink-0" />
        <div className="grid gap-0.5">
          <p className="font-medium">{b.autoCancelled ? t("autoCancelled") : t("cancelled")}</p>
          <p className="text-muted-foreground text-sm">
            {[b.cancelledAt ? when(b.cancelledAt) : null, b.cancelReason].filter(Boolean).join(" · ")}
          </p>
          {b.refund ? (
            <p className="text-sm">
              <span className="font-medium">
                {tBookings("refundedAmount", {
                  amount: formatCurrency(b.refund.amount, locale, b.currency),
                  deposit: formatCurrency(b.deposit, locale, b.currency),
                })}
              </span>
              {refundDetail(b.refund, tBookings, when) ? (
                <span className="text-muted-foreground"> · {refundDetail(b.refund, tBookings, when)}</span>
              ) : null}
            </p>
          ) : null}
        </div>
      </div>
    );
  }
  if (b.balanceOverdue) {
    return (
      <div className="flex items-start gap-3 rounded-xl border border-amber-500/35 bg-amber-500/10 p-4">
        <TriangleAlertIcon className="mt-0.5 size-5 shrink-0 text-amber-600 dark:text-amber-400" />
        <div className="grid gap-0.5">
          <p className="font-medium">{t("overdue")}</p>
          <p className="text-muted-foreground text-sm">{t("overdueHint", { date: when(b.balanceDueAt!) })}</p>
        </div>
      </div>
    );
  }
  const hold = b.cancellationHold;
  if (b.status === "active" && b.deposit <= 0 && hold) {
    const tone =
      hold.status === "approved"
        ? "border-emerald-500/30 bg-emerald-500/8"
        : hold.status === "rejected"
          ? "border-destructive/30 bg-destructive/8"
          : "border-sky-500/30 bg-sky-500/8";
    const Icon =
      hold.status === "approved"
        ? ShieldCheckIcon
        : hold.status === "rejected"
          ? ShieldXIcon
          : ShieldEllipsisIcon;
    const iconTone =
      hold.status === "approved"
        ? "text-emerald-600 dark:text-emerald-400"
        : hold.status === "rejected"
          ? "text-destructive"
          : "text-sky-600 dark:text-sky-400";
    const at = hold.status === "pending" ? hold.requestedAt : hold.reviewedAt;
    const by = hold.status === "pending" ? hold.requestedBy : hold.reviewedBy;
    const note = hold.status === "pending" ? hold.reason : hold.reviewNote;
    return (
      <div className={cn("flex items-start gap-3 rounded-xl border p-4", tone)}>
        <Icon className={cn("mt-0.5 size-5 shrink-0", iconTone)} />
        <div className="grid gap-0.5">
          <p className="font-medium">{t(`hold.${hold.status}`)}</p>
          <p className="text-muted-foreground text-sm">
            {[by, at ? when(at) : null, note].filter(Boolean).join(" · ")}
          </p>
        </div>
      </div>
    );
  }
  if (b.status === "converted") {
    return (
      <div className="flex items-start gap-3 rounded-xl border border-violet-500/30 bg-violet-500/8 p-4">
        <BadgeCheckIcon className="mt-0.5 size-5 shrink-0 text-violet-600 dark:text-violet-400" />
        <p className="font-medium">{t("sold", { date: b.soldAt ? when(b.soldAt) : "—" })}</p>
      </div>
    );
  }
  return null;
}

function Stat({ label, value, tone }: { label: string; value: string; tone?: "good" | "warning" }) {
  return (
    <div className="bg-muted/50 grid gap-0.5 rounded-lg px-3 py-2">
      <dt className="text-muted-foreground text-xs">{label}</dt>
      <dd
        className={cn(
          "truncate text-sm font-semibold tabular-nums",
          tone === "good" && "text-emerald-700 dark:text-emerald-400",
          tone === "warning" && "text-amber-700 dark:text-amber-400",
        )}
      >
        {value}
      </dd>
    </div>
  );
}

function Person({
  icon: Icon,
  label,
  name,
  extra,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  name: string;
  extra?: React.ReactNode;
}) {
  return (
    <div className="flex items-start gap-3">
      <span className="bg-brand-soft text-brand flex size-9 shrink-0 items-center justify-center rounded-full">
        <Icon className="size-4" />
      </span>
      <div className="grid min-w-0 gap-0.5">
        <span className="text-muted-foreground text-xs">{label}</span>
        <span className="truncate text-sm font-medium">{name}</span>
        {extra}
      </div>
    </div>
  );
}

function Step({
  state,
  title,
  detail,
}: {
  state: "done" | "upcoming" | "missed" | "skipped";
  title: string;
  detail: string;
}) {
  const Icon =
    state === "done" ? CircleCheckIcon : state === "missed" ? CircleXIcon : CircleDashedIcon;
  return (
    <li className="relative flex gap-3 [&:not(:last-child)]:after:absolute [&:not(:last-child)]:after:start-[0.95rem] [&:not(:last-child)]:after:top-8 [&:not(:last-child)]:after:h-[calc(100%-1rem)] [&:not(:last-child)]:after:w-px [&:not(:last-child)]:after:bg-border">
      <span
        className={cn(
          "relative z-10 flex size-8 shrink-0 items-center justify-center rounded-full",
          state === "done" && "bg-emerald-600/12 text-emerald-700 dark:text-emerald-400",
          state === "missed" && "bg-destructive/12 text-destructive",
          state === "upcoming" && "bg-amber-500/15 text-amber-700 dark:text-amber-400",
          state === "skipped" && "bg-muted text-muted-foreground",
        )}
      >
        <Icon className="size-4" />
      </span>
      <div className={cn("grid gap-0.5 pt-1", state === "skipped" && "opacity-60")}>
        <span className="text-sm font-medium">{title}</span>
        {detail ? <span className="text-muted-foreground text-xs">{detail}</span> : null}
      </div>
    </li>
  );
}
