"use client";

import {
  ArmchairIcon,
  BadgeCheckIcon,
  CalendarCheckIcon,
  CalendarIcon,
  CarFrontIcon,
  CheckIcon,
  CogIcon,
  FuelIcon,
  GaugeIcon,
  HandCoinsIcon,
  MapPinIcon,
  RouteIcon,
  ShipIcon,
  TrendingDownIcon,
  TrendingUpIcon,
  WrenchIcon,
  ZapIcon,
  type LucideIcon,
} from "lucide-react";
import { VehiclePhotoPlaceholder } from "@/components/inventory/vehicle-photo-placeholder";
import { useTranslations } from "next-intl";
import { useState } from "react";

import {
  bodyTypeLabel,
  enumLabel,
  useAppLocale,
  vehicleTitle,
} from "@/components/inventory/inventory-utils";
import { NewCarBadge, UsedCarBadge } from "@/components/inventory/market-type-badge";
import { ReadyForSaleTag, SoldRibbon } from "@/components/inventory/vehicle-sold-tag";
import { isSoldStatus } from "@/lib/vehicles/status-transitions";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { formatCurrency, formatNumber, formatPercent } from "@/lib/utils/currency";
import { formatDate } from "@/lib/utils/date";
import { quantityTotal } from "@/lib/vehicles/quantity";
import type { VehicleDetail, VehicleStatus } from "@/types/vehicle";

const DAY = 86_400_000;
const daysBetween = (from: string, to: number) =>
  Math.max(0, Math.floor((to - new Date(from).getTime()) / DAY));

/** "Now", fixed for the component's lifetime so renders stay pure. */
function useNow() {
  return useState(() => Date.now())[0];
}

/* ------------------------------------------------------------------ hero */

/** Photo, headline badges, journey stepper and the specs a buyer asks about first. */
export function VehicleHero({ vehicle }: { vehicle: VehicleDetail }) {
  const t = useTranslations();
  const locale = useAppLocale();

  const specs: { icon: LucideIcon; label: string; value: string | null }[] = [
    { icon: CalendarIcon, label: t("inventory.fields.year"), value: String(vehicle.year) },
    {
      icon: GaugeIcon,
      label: t("inventory.fields.mileage"),
      value: t("inventory.detail.mileageValue", {
        value: formatNumber(vehicle.mileage, locale),
        unit: t(`inventory.enums.mileageUnit.${vehicle.mileageUnit}`),
      }),
    },
    {
      icon: CogIcon,
      label: t("inventory.fields.transmission"),
      value: enumLabel(t, "transmission", vehicle.transmission),
    },
    {
      icon: FuelIcon,
      label: t("inventory.fields.fuelType"),
      value: enumLabel(t, "fuel", vehicle.fuelType),
    },
    {
      icon: CarFrontIcon,
      label: t("inventory.fields.bodyType"),
      value: bodyTypeLabel(t, vehicle.bodyType),
    },
    {
      icon: ZapIcon,
      label: t("inventory.fields.engineSize"),
      value:
        [
          vehicle.engineSize,
          vehicle.engineCylinders
            ? t("inventory.insights.cylinders", { count: vehicle.engineCylinders })
            : null,
        ]
          .filter(Boolean)
          .join(" · ") || null,
    },
    {
      icon: RouteIcon,
      label: t("inventory.fields.driveType"),
      value: enumLabel(t, "drive", vehicle.driveType),
    },
    {
      icon: ArmchairIcon,
      label: t("inventory.insights.seatsDoors"),
      value:
        vehicle.seats || vehicle.doors
          ? [
              vehicle.seats ? t("inventory.insights.seats", { count: vehicle.seats }) : null,
              vehicle.doors ? t("inventory.insights.doors", { count: vehicle.doors }) : null,
            ]
              .filter(Boolean)
              .join(" · ")
          : null,
    },
  ];
  const place = [vehicle.branchName, vehicle.locationName].filter(Boolean).join(" · ");

  return (
    <Card className="animate-rise overflow-hidden p-0">
      <div className="grid lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)]">
        <div className="bg-muted relative aspect-[16/10] overflow-hidden lg:aspect-auto lg:min-h-full">
          {vehicle.primaryPhotoUrl ? (
            // eslint-disable-next-line @next/next/no-img-element -- signed storage URL
            <img
              src={vehicle.primaryPhotoUrl}
              alt={vehicleTitle(vehicle)}
              className="absolute inset-0 size-full object-cover"
            />
          ) : (
            <VehiclePhotoPlaceholder
              size="lg"
              label={t("inventory.insights.noPhoto")}
              className="absolute inset-0"
            />
          )}
          <div className="pointer-events-none absolute inset-0 bg-linear-to-t from-black/60 via-black/0 to-transparent" />
          {isSoldStatus(vehicle.status) ? <SoldRibbon /> : null}
          {vehicle.marketType === "new" ? (
            <NewCarBadge className="absolute start-3 top-3" />
          ) : vehicle.marketType === "used" ? (
            <UsedCarBadge className="absolute start-3 top-3" />
          ) : null}
          {/* Ready for sale uses the corner the Sold ribbon takes on sold cars. */}
          {vehicle.status === "ready_for_sale" ? (
            <ReadyForSaleTag className="absolute end-3 top-3" />
          ) : null}
          {place ? (
            <p className="absolute start-4 bottom-4 flex items-center gap-1.5 text-sm font-medium text-white drop-shadow">
              <MapPinIcon className="size-4" aria-hidden />
              {place}
            </p>
          ) : null}
        </div>

        <div className="grid content-start gap-5 p-5">
          <LifecycleStepper status={vehicle.status} />
          <ul className="stagger grid grid-cols-2 gap-2.5 [--stagger:45ms] sm:grid-cols-4">
            {specs.map((spec) => (
              <li
                key={spec.label}
                className="group/spec bg-muted/40 hover:border-brand/40 hover:bg-brand-soft/40 grid gap-1.5 rounded-xl border border-transparent p-3 transition-colors"
              >
                <spec.icon
                  className="text-brand size-4 transition-transform duration-300 group-hover/spec:scale-110"
                  aria-hidden
                />
                <span className="text-muted-foreground text-[11px] font-medium tracking-wide uppercase">
                  {spec.label}
                </span>
                <span
                  className={cn(
                    "text-sm leading-tight font-semibold",
                    !spec.value && "text-muted-foreground font-normal",
                  )}
                >
                  {spec.value ?? "—"}
                </span>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </Card>
  );
}

/* ------------------------------------------------------------- lifecycle */

const JOURNEY: { status: VehicleStatus; icon: LucideIcon }[] = [
  { status: "acquired", icon: ShipIcon },
  { status: "ready_for_sale", icon: BadgeCheckIcon },
  { status: "reserved", icon: CalendarCheckIcon },
  { status: "sold", icon: HandCoinsIcon },
];

/** Workshop-type detours sit between "In transit" and "Ready for sale". */
const DETOURS: Partial<Record<VehicleStatus, number>> = {
  under_inspection: 0,
  inspection_failed: 0,
  under_repair: 0,
};

export function LifecycleStepper({ status }: { status: VehicleStatus }) {
  const t = useTranslations();
  // Delivery isn't tracked: Sold is the last step, and older "delivered" cars show as Sold.
  const onPath = JOURNEY.findIndex(
    (step) => step.status === (status === "delivered" ? "sold" : status),
  );
  const current = onPath >= 0 ? onPath : (DETOURS[status] ?? -1);
  const detour = onPath < 0 && current >= 0;
  const offPath = current < 0; // returned / archived
  const progress = offPath ? 0 : (current / (JOURNEY.length - 1)) * 100;
  // Sold is the end of the journey: show it as completed, not in progress.
  const finished = !offPath && current === JOURNEY.length - 1;
  // Dots sit in the middle of equal columns; the track runs from the first dot to the last.
  const edge = 50 / JOURNEY.length;
  const span = 100 - 2 * edge;

  return (
    <div className="grid gap-2">
      <div className="flex items-center justify-between gap-2">
        <p className="text-muted-foreground text-xs font-medium tracking-wide uppercase">
          {t("inventory.insights.journey")}
        </p>
        {detour || offPath ? (
          <span className="inline-flex items-center gap-1 rounded-full bg-amber-500/12 px-2 py-0.5 text-xs font-medium text-amber-700 dark:text-amber-300">
            <WrenchIcon className="size-3" aria-hidden />
            {t(`inventory.status.${status}`)}
          </span>
        ) : null}
      </div>
      <ol
        className="relative grid"
        style={{ gridTemplateColumns: `repeat(${JOURNEY.length}, minmax(0, 1fr))` }}
      >
        {/* Track and animated fill, drawn between the first and last dot. */}
        <span
          className="bg-border absolute top-4 h-0.5 rounded-full"
          style={{ insetInlineStart: `${edge}%`, insetInlineEnd: `${edge}%` }}
          aria-hidden
        />
        <span
          className="bg-gold animate-grow-x absolute top-4 h-0.5 rounded-full ltr:origin-left rtl:origin-right"
          style={{
            insetInlineStart: `${edge}%`,
            width: `${(progress / 100) * span}%`,
            animationDelay: "200ms",
          }}
          aria-hidden
        />
        {JOURNEY.map((step, index) => {
          const done = !offPath && (index < current || (finished && index === current));
          const active = !offPath && !finished && index === current;
          return (
            <li
              key={step.status}
              className="relative z-10 flex flex-col items-center gap-1.5 text-center"
              aria-current={!offPath && index === current ? "step" : undefined}
            >
              <span
                className={cn(
                  "flex size-8 items-center justify-center rounded-full border-2 transition-colors",
                  done && "bg-gold text-brand-foreground border-transparent",
                  active && "border-brand bg-card text-brand shadow-[0_0_0_4px_var(--brand-soft)]",
                  !done && !active && "bg-card text-muted-foreground border-border",
                )}
              >
                {done ? (
                  <CheckIcon className="size-4" aria-hidden />
                ) : (
                  <step.icon className={cn("size-3.5", active && "animate-pop")} aria-hidden />
                )}
              </span>
              <span
                className={cn(
                  "text-[11px] leading-tight",
                  !offPath && index === current
                    ? "text-foreground font-semibold"
                    : "text-muted-foreground",
                )}
              >
                {t(`inventory.status.${step.status}`)}
              </span>
            </li>
          );
        })}
      </ol>
    </div>
  );
}

/* --------------------------------------------------------- price & profit */

/**
 * Cost → minimum → selling price as proportional bars, plus the expected profit.
 * Rendered only for people allowed to see costs or price floors.
 */
export function PriceProfitCard({ vehicle }: { vehicle: VehicleDetail }) {
  const t = useTranslations();
  const locale = useAppLocale();
  const money = (value: number) => formatCurrency(value, locale);

  const cost = vehicle.totalAcquisitionCost ?? null;
  const minimum = vehicle.minimumSellingPrice ?? null;
  const selling = vehicle.currentSellingPrice ?? null;
  const agreed = vehicle.booking?.sellingPrice ?? null;

  const bars = [
    { key: "cost", label: t("inventory.fields.acquisitionCost"), value: cost, color: "bg-chart-2" },
    {
      key: "minimum",
      label: t("inventory.fields.minimumPrice"),
      value: minimum,
      color: "bg-chart-4",
    },
    { key: "selling", label: t("inventory.fields.sellingPrice"), value: selling, color: "bg-gold" },
    ...(agreed != null && agreed !== selling
      ? [
          {
            key: "agreed",
            label: t("inventory.insights.agreedPrice"),
            value: agreed,
            color: "bg-chart-3",
          },
        ]
      : []),
  ].filter(
    (bar): bar is { key: string; label: string; value: number; color: string } =>
      bar.value != null && bar.value > 0,
  );

  if (bars.length === 0) return null;
  const max = Math.max(...bars.map((bar) => bar.value));
  const salePrice = agreed ?? selling;
  const profit = cost != null && cost > 0 && salePrice != null ? salePrice - cost : null;
  const margin = profit != null && salePrice ? profit / salePrice : null;

  return (
    <Card className="animate-rise h-full [animation-delay:80ms]">
      <CardHeader>
        <CardTitle>{t("inventory.insights.priceTitle")}</CardTitle>
        <CardDescription>
          {vehicle.quantity > 1
            ? t("inventory.insights.perUnitNote", { count: vehicle.quantity })
            : t("inventory.insights.priceHint")}
        </CardDescription>
      </CardHeader>
      <CardContent className="grid gap-5 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center">
        <ul className="grid gap-3.5">
          {bars.map((bar, index) => (
            <li key={bar.key} className="grid gap-1.5">
              <div className="flex items-baseline justify-between gap-3 text-sm">
                <span className="text-muted-foreground">{bar.label}</span>
                <span className="font-semibold tabular-nums">{money(bar.value)}</span>
              </div>
              <div className="bg-muted h-2.5 overflow-hidden rounded-full">
                <div
                  className={cn(
                    bar.color,
                    "animate-grow-x h-full rounded-full ltr:origin-left rtl:origin-right",
                  )}
                  style={{
                    width: `${(bar.value / max) * 100}%`,
                    animationDelay: `${150 + index * 120}ms`,
                  }}
                />
              </div>
            </li>
          ))}
          {vehicle.quantity > 1 && selling != null ? (
            <li className="text-muted-foreground border-t pt-3 text-xs">
              {t("inventory.totals.totalSelling", { count: vehicle.quantity })}:{" "}
              <span className="text-foreground font-semibold tabular-nums">
                {money(quantityTotal(selling, vehicle.quantity) ?? 0)}
              </span>
            </li>
          ) : null}
        </ul>
        {profit != null && margin != null ? (
          <MarginGauge margin={margin} profit={money(profit)} positive={profit >= 0} />
        ) : null}
      </CardContent>
    </Card>
  );
}

function MarginGauge({
  margin,
  profit,
  positive,
}: {
  margin: number;
  profit: string;
  positive: boolean;
}) {
  const t = useTranslations();
  const locale = useAppLocale();
  // Semicircle: 0% margin at the left end, 40%+ fills it.
  const fill = Math.min(Math.max(margin, 0) / 0.4, 1);
  const Icon = positive ? TrendingUpIcon : TrendingDownIcon;
  return (
    <figure className="mx-auto grid w-44 justify-items-center gap-1 text-center">
      <svg viewBox="0 0 120 70" className="w-full overflow-visible rtl:-scale-x-100" aria-hidden>
        <path
          d="M10 62 A50 50 0 0 1 110 62"
          fill="none"
          className="stroke-muted"
          strokeWidth="10"
          strokeLinecap="round"
        />
        <path
          d="M10 62 A50 50 0 0 1 110 62"
          fill="none"
          pathLength={1}
          strokeDasharray={`${fill} 1`}
          strokeWidth="10"
          strokeLinecap="round"
          className={cn("animate-draw", positive ? "stroke-[var(--brand)]" : "stroke-destructive")}
          style={{ animationDelay: "300ms" }}
        />
      </svg>
      <figcaption className="-mt-9 grid gap-0.5">
        <span
          className={cn(
            "font-heading text-2xl font-semibold tabular-nums",
            !positive && "text-destructive",
          )}
        >
          {formatPercent(margin, locale)}
        </span>
        <span className="text-muted-foreground text-[11px] font-medium tracking-wide uppercase">
          {t("inventory.insights.margin")}
        </span>
        <span
          className={cn(
            "mt-1 inline-flex items-center justify-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium tabular-nums",
            positive
              ? "bg-emerald-600/10 text-emerald-700 dark:bg-emerald-400/12 dark:text-emerald-300"
              : "bg-destructive/10 text-destructive",
          )}
        >
          <Icon className="size-3.5" aria-hidden />
          {t("inventory.insights.profit", { amount: profit })}
        </span>
      </figcaption>
    </figure>
  );
}

/* ----------------------------------------------------------- stock age */

const AGE_BANDS = [
  {
    max: 30,
    key: "fresh",
    ring: "stroke-emerald-500",
    chip: "bg-emerald-600/10 text-emerald-700 dark:text-emerald-300",
  },
  { max: 60, key: "mid", ring: "stroke-[var(--brand)]", chip: "bg-brand-soft text-brand" },
  {
    max: 90,
    key: "aging",
    ring: "stroke-orange-500",
    chip: "bg-orange-500/12 text-orange-700 dark:text-orange-300",
  },
  {
    max: Infinity,
    key: "old",
    ring: "stroke-rose-500",
    chip: "bg-rose-500/12 text-rose-700 dark:text-rose-300",
  },
] as const;

/** Ring gauge of how long the car has been in stock, coloured by the dashboard aging bands. */
export function StockAgeCard({ vehicle }: { vehicle: VehicleDetail }) {
  const t = useTranslations();
  const now = useNow();
  const since = vehicle.purchaseDate ?? vehicle.createdAt;
  const soldAt = vehicle.booking?.status === "converted" ? vehicle.booking.soldAt : null;
  const closed = vehicle.status === "sold" || vehicle.status === "delivered";
  const days = daysBetween(since, soldAt ? new Date(soldAt).getTime() : now);
  const band = AGE_BANDS.find((b) => days <= b.max) ?? AGE_BANDS[3];
  const fill = Math.min(days / 120, 1);
  const r = 42;

  return (
    <Card className="animate-rise h-full [animation-delay:160ms]">
      <CardHeader>
        <CardTitle>{t("inventory.insights.ageTitle")}</CardTitle>
        <CardDescription>
          {closed ? t("inventory.insights.ageSold") : t("inventory.insights.ageHint")}
        </CardDescription>
      </CardHeader>
      <CardContent className="grid justify-items-center gap-3">
        <div className="relative size-36">
          <svg viewBox="0 0 100 100" className="size-full -rotate-90" aria-hidden>
            <circle cx="50" cy="50" r={r} fill="none" className="stroke-muted" strokeWidth="9" />
            <circle
              cx="50"
              cy="50"
              r={r}
              fill="none"
              pathLength={1}
              strokeDasharray={`${Math.max(fill, 0.02)} 1`}
              strokeWidth="9"
              strokeLinecap="round"
              className={cn("animate-draw", band.ring)}
              style={{ animationDelay: "250ms" }}
            />
          </svg>
          <div className="absolute inset-0 grid place-content-center text-center">
            <span className="font-heading text-3xl font-semibold tabular-nums">{days}</span>
            <span className="text-muted-foreground text-xs">
              {t("inventory.insights.days", { count: days })}
            </span>
          </div>
        </div>
        <span className={cn("rounded-full px-2.5 py-0.5 text-xs font-medium", band.chip)}>
          {t(`dashboard.agingBands.${band.key}`)}
        </span>
      </CardContent>
    </Card>
  );
}

/* ------------------------------------------------------------- booking */

/** Who booked the car and how much of the price has been collected. */
export function BookingProgressCard({ vehicle }: { vehicle: VehicleDetail }) {
  const t = useTranslations();
  const locale = useAppLocale();
  const booking = vehicle.booking;
  if (!booking) return null;

  const money = (value: number) => formatCurrency(value, locale, booking.currency);
  const total = quantityTotal(booking.sellingPrice, vehicle.quantity);
  const received = booking.balanceReceived ?? 0;
  const paid = booking.deposit + received;
  const remaining = total != null ? Math.max(0, total - paid) : null;
  const pct = (value: number) => (total ? Math.min((value / total) * 100, 100) : 0);
  const date = (value: string) => formatDate(value, locale, "medium");

  const segments = [
    {
      key: "deposit",
      label: t("bookings.payment.deposit"),
      value: booking.deposit,
      color: "bg-gold",
    },
    ...(received > 0
      ? [
          {
            key: "balance",
            label: t("bookings.payment.balanceReceived"),
            value: received,
            color: "bg-emerald-500",
          },
        ]
      : []),
  ];

  return (
    <Card className="animate-rise [animation-delay:120ms]">
      <CardHeader>
        <CardTitle className="flex flex-wrap items-center gap-2">
          {t("inventory.booking.title")}
          <span className="text-muted-foreground font-mono text-xs font-normal">
            {booking.number}
          </span>
        </CardTitle>
        <CardDescription>
          {t(`bookings.statuses.${booking.status}`)} · {date(booking.reservedAt)}
          {booking.soldAt ? ` → ${t("inventory.booking.soldOn")} ${date(booking.soldAt)}` : null}
        </CardDescription>
      </CardHeader>
      <CardContent className="grid gap-5">
        <div className="grid gap-3 sm:grid-cols-2">
          <Person
            label={t("bookings.customer")}
            name={booking.customer?.name ?? null}
            sub={booking.customer?.phone}
          />
          <Person
            label={t("bookings.salesperson")}
            name={booking.salesperson}
            sub={
              booking.bookedBy
                ? t("inventory.insights.bookedBy", { name: booking.bookedBy })
                : undefined
            }
          />
        </div>

        {total != null ? (
          <div className="grid gap-2">
            <div className="flex items-baseline justify-between gap-3 text-sm">
              <span className="text-muted-foreground">{t("inventory.insights.collected")}</span>
              <span className="tabular-nums">
                <span className="font-semibold">{money(paid)}</span>
                <span className="text-muted-foreground"> / {money(total)}</span>
              </span>
            </div>
            <div
              className="bg-muted flex h-3 gap-0.5 overflow-hidden rounded-full"
              role="img"
              aria-label={`${money(paid)} / ${money(total)}`}
            >
              {segments.map((segment, index) => (
                <div
                  key={segment.key}
                  className={cn(
                    segment.color,
                    "animate-grow-x h-full first:rounded-s-full last:rounded-e-full ltr:origin-left rtl:origin-right",
                  )}
                  style={{
                    width: `${pct(segment.value)}%`,
                    animationDelay: `${200 + index * 200}ms`,
                  }}
                />
              ))}
            </div>
            <ul className="flex flex-wrap gap-x-4 gap-y-1.5 text-xs">
              {segments.map((segment) => (
                <li key={segment.key} className="flex items-center gap-1.5">
                  <span className={cn(segment.color, "size-2.5 rounded-full")} aria-hidden />
                  <span className="text-muted-foreground">{segment.label}</span>
                  <span className="font-medium tabular-nums">{money(segment.value)}</span>
                </li>
              ))}
              {remaining != null && remaining > 0 ? (
                <li className="flex items-center gap-1.5">
                  <span className="bg-muted-foreground/30 size-2.5 rounded-full" aria-hidden />
                  <span className="text-muted-foreground">
                    {booking.status === "converted"
                      ? t("bookings.payment.outstanding")
                      : t("bookings.payment.balanceDue")}
                  </span>
                  <span className="font-medium tabular-nums">{money(remaining)}</span>
                </li>
              ) : null}
            </ul>
          </div>
        ) : null}

        {booking.notes ? (
          <p className="bg-muted/40 text-muted-foreground rounded-lg px-3 py-2 text-sm whitespace-pre-wrap">
            {booking.notes}
          </p>
        ) : null}
      </CardContent>
    </Card>
  );
}

function Person({ label, name, sub }: { label: string; name: string | null; sub?: string | null }) {
  const initials = (name ?? "?")
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join("");
  return (
    <div className="flex min-w-0 items-center gap-3 rounded-xl border p-3">
      <span className="bg-gold text-brand-foreground flex size-10 shrink-0 items-center justify-center rounded-full text-sm font-semibold">
        {initials}
      </span>
      <div className="min-w-0">
        <p className="text-muted-foreground text-[11px] font-medium tracking-wide uppercase">
          {label}
        </p>
        <p className="truncate text-sm font-semibold">{name ?? "—"}</p>
        {sub ? (
          <p className="text-muted-foreground truncate text-xs" dir="auto">
            {sub}
          </p>
        ) : null}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------ key dates */

/** The car's milestones on one timeline, with registration expiry called out. */
export function KeyDatesCard({ vehicle }: { vehicle: VehicleDetail }) {
  const t = useTranslations();
  const locale = useAppLocale();
  const booking = vehicle.booking;
  const now = useNow();

  const events = [
    { key: "purchased", label: t("inventory.fields.purchaseDate"), at: vehicle.purchaseDate },
    { key: "added", label: t("inventory.insights.addedToStock"), at: vehicle.createdAt },
    {
      key: "registered",
      label: t("inventory.fields.registrationDate"),
      at: vehicle.registrationDate,
    },
    { key: "booked", label: t("inventory.booking.bookedOn"), at: booking?.reservedAt ?? null },
    { key: "sold", label: t("inventory.booking.soldOn"), at: booking?.soldAt ?? null },
  ]
    .filter((event): event is { key: string; label: string; at: string } => !!event.at)
    .sort((a, b) => a.at.localeCompare(b.at));

  const expiry = vehicle.registrationExpiry;
  const daysLeft = expiry ? Math.ceil((new Date(expiry).getTime() - now) / DAY) : null;
  const expiryTone =
    daysLeft == null
      ? ""
      : daysLeft < 0
        ? "bg-rose-500/12 text-rose-700 dark:text-rose-300"
        : daysLeft <= 30
          ? "bg-amber-500/12 text-amber-700 dark:text-amber-300"
          : "bg-emerald-600/10 text-emerald-700 dark:text-emerald-300";

  return (
    <Card className="animate-rise h-full [animation-delay:200ms]">
      <CardHeader>
        <CardTitle>{t("inventory.insights.datesTitle")}</CardTitle>
      </CardHeader>
      <CardContent className="grid gap-4">
        {expiry && daysLeft != null ? (
          <div
            className={cn(
              "flex items-center justify-between gap-3 rounded-xl px-3 py-2.5 text-sm",
              expiryTone,
            )}
          >
            <span className="font-medium">{t("inventory.fields.registrationExpiry")}</span>
            <span className="text-end">
              <span className="block font-semibold">{formatDate(expiry, locale, "medium")}</span>
              <span className="text-xs opacity-80">
                {daysLeft < 0
                  ? t("inventory.insights.expiredAgo", { count: -daysLeft })
                  : t("inventory.insights.expiresIn", { count: daysLeft })}
              </span>
            </span>
          </div>
        ) : null}
        {events.length > 0 ? (
          <ol className="stagger relative grid gap-4 ps-6 [--stagger:60ms]">
            <span
              className="bg-border absolute inset-y-1.5 start-[7px] w-0.5 rounded-full"
              aria-hidden
            />
            {events.map((event, index) => (
              <li key={event.key} className="relative grid gap-0.5">
                <span
                  className={cn(
                    "border-card absolute -start-6 top-1 size-4 rounded-full border-[3px]",
                    index === events.length - 1
                      ? "bg-gold shadow-[0_0_0_3px_var(--brand-soft)]"
                      : "bg-muted-foreground/40",
                  )}
                  aria-hidden
                />
                <span className="text-sm font-medium">{event.label}</span>
                <span className="text-muted-foreground text-xs">
                  {formatDate(event.at, locale, "medium")}
                </span>
              </li>
            ))}
          </ol>
        ) : (
          <p className="text-muted-foreground text-sm">{t("inventory.fields.notSet")}</p>
        )}
      </CardContent>
    </Card>
  );
}

/* ------------------------------------------------------ acquisition cost */

/** Donut of purchase price vs the other acquisition costs (shipping, fees…). */
export function AcquisitionCostChart({
  purchasePrice,
  totalCost,
  currency,
}: {
  purchasePrice: number | null | undefined;
  totalCost: number | null | undefined;
  currency?: string | null;
}) {
  const t = useTranslations();
  const locale = useAppLocale();
  if (purchasePrice == null || totalCost == null || totalCost <= 0) return null;

  const money = (value: number) => formatCurrency(value, locale, currency ?? undefined);
  const extras = Math.max(0, totalCost - purchasePrice);
  const parts = [
    {
      key: "purchase",
      label: t("inventory.fields.purchasePrice"),
      value: Math.min(purchasePrice, totalCost),
      color: "var(--chart-2)",
    },
    {
      key: "extras",
      label: t("inventory.insights.otherCosts"),
      value: extras,
      color: "var(--brand)",
    },
  ];
  const r = 42;
  let offset = 0;

  return (
    <div className="grid items-center gap-5 rounded-xl border p-4 sm:grid-cols-[auto_minmax(0,1fr)]">
      <div className="relative mx-auto size-40">
        <svg viewBox="0 0 100 100" className="size-full -rotate-90" aria-hidden>
          <circle cx="50" cy="50" r={r} fill="none" className="stroke-muted" strokeWidth="12" />
          {parts.map((part, index) => {
            const share = part.value / totalCost;
            const node = (
              <circle
                key={part.key}
                cx="50"
                cy="50"
                r={r}
                fill="none"
                stroke={part.color}
                strokeWidth="12"
                pathLength={1}
                strokeDasharray={`${share} 1`}
                strokeDashoffset={-offset}
                className="animate-fade-in"
                style={{ animationDelay: `${150 + index * 200}ms` }}
              />
            );
            offset += share;
            return node;
          })}
        </svg>
        <div className="absolute inset-0 grid place-content-center text-center">
          <span className="text-muted-foreground text-[10px] font-medium tracking-wide uppercase">
            {t("inventory.insights.totalCost")}
          </span>
          <span className="font-heading text-xs font-semibold tabular-nums">
            {money(totalCost)}
          </span>
        </div>
      </div>
      <ul className="grid gap-3">
        {parts.map((part) => (
          <li key={part.key} className="grid gap-1">
            <div className="flex items-center justify-between gap-3 text-sm">
              <span className="flex items-center gap-2">
                <span
                  className="size-2.5 rounded-full"
                  style={{ background: part.color }}
                  aria-hidden
                />
                {part.label}
              </span>
              <span className="font-semibold tabular-nums">{money(part.value)}</span>
            </div>
            <span className="text-muted-foreground ps-4.5 text-xs">
              {formatPercent(part.value / totalCost, locale)}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
