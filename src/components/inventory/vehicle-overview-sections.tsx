"use client";

import {
  BarcodeIcon,
  BuildingIcon,
  CalendarIcon,
  CheckIcon,
  ClipboardListIcon,
  CopyIcon,
  FingerprintIcon,
  GlobeIcon,
  HashIcon,
  LayersIcon,
  MapPinIcon,
  NotebookPenIcon,
  PackageIcon,
  PaletteIcon,
  ScanLineIcon,
  ShieldCheckIcon,
  SplitIcon,
  StoreIcon,
  TagIcon,
  UserRoundIcon,
  WarehouseIcon,
  ShipIcon,
  type LucideIcon,
} from "lucide-react";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { toast } from "sonner";

import { enumLabel, useAppLocale } from "@/components/inventory/inventory-utils";
import { VehicleColorDisplay } from "@/components/inventory/vehicle-color-field";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Link } from "@/lib/i18n/navigation";
import { cn } from "@/lib/utils";
import { formatCurrency, formatNumber } from "@/lib/utils/currency";
import { formatDate, formatRelativeTime } from "@/lib/utils/date";
import { countryFlag, findCountryByName } from "@/lib/vehicles/countries";
import { quantityTotal } from "@/lib/vehicles/quantity";
import { vehicleHref } from "@/lib/vehicles/routes";
import type { VehicleDetail } from "@/types/vehicle";

/* ------------------------------------------------------------ primitives */

function SectionCard({
  icon: Icon,
  title,
  action,
  className,
  delay = 0,
  children,
}: {
  icon: LucideIcon;
  title: string;
  action?: React.ReactNode;
  className?: string;
  delay?: number;
  children: React.ReactNode;
}) {
  return (
    <Card className={cn("animate-rise h-full", className)} style={{ animationDelay: `${delay}ms` }}>
      <CardHeader className="flex flex-row items-center justify-between gap-3">
        <CardTitle className="flex items-center gap-2.5">
          <span className="bg-brand-soft text-brand flex size-8 items-center justify-center rounded-lg">
            <Icon className="size-4" aria-hidden />
          </span>
          {title}
        </CardTitle>
        {action}
      </CardHeader>
      <CardContent>{children}</CardContent>
    </Card>
  );
}

/** One fact: icon tile, small label, value. Empty values are dimmed rather than hidden. */
function InfoRow({
  icon: Icon,
  label,
  value,
  mono = false,
  copy,
  wide = false,
}: {
  icon: LucideIcon;
  label: string;
  value: React.ReactNode;
  mono?: boolean;
  /** Text to copy; shows a copy button next to the value. */
  copy?: string | null;
  wide?: boolean;
}) {
  const t = useTranslations();
  const empty = value == null || value === "";
  return (
    <div
      className={cn(
        "group/info hover:bg-muted/40 flex min-w-0 items-start gap-3 rounded-xl p-2 transition-colors",
        wide && "col-span-2",
      )}
    >
      <span className="bg-muted text-muted-foreground group-hover/info:text-brand flex size-9 shrink-0 items-center justify-center rounded-lg transition-colors">
        <Icon className="size-4" aria-hidden />
      </span>
      <div className="grid min-w-0 flex-1 gap-0.5">
        <dt className="text-muted-foreground text-[11px] font-medium tracking-wide uppercase">{label}</dt>
        <dd
          className={cn(
            "flex min-w-0 items-center gap-1.5 text-sm font-medium",
            mono && "font-mono text-[13px]",
            empty && "text-muted-foreground font-normal",
          )}
        >
          <span className="min-w-0 break-all">{empty ? t("inventory.fields.notSet") : value}</span>
          {copy ? <CopyButton text={copy} /> : null}
        </dd>
      </div>
    </div>
  );
}

function CopyButton({ text }: { text: string }) {
  const t = useTranslations();
  const [done, setDone] = useState(false);
  return (
    <button
      type="button"
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(text);
          setDone(true);
          toast.success(t("inventory.overview.copied"));
          setTimeout(() => setDone(false), 1500);
        } catch {
          toast.error(t("inventory.overview.copyFailed"));
        }
      }}
      className="text-muted-foreground hover:text-brand hover:bg-brand-soft shrink-0 rounded-md p-1 transition-colors"
      aria-label={t("inventory.overview.copy")}
      title={t("inventory.overview.copy")}
    >
      {done ? <CheckIcon className="size-3.5 text-emerald-600" aria-hidden /> : <CopyIcon className="size-3.5" aria-hidden />}
    </button>
  );
}

/* -------------------------------------------------------- identification */

export function IdentificationCard({ vehicle }: { vehicle: VehicleDetail }) {
  const t = useTranslations();
  const locale = useAppLocale();
  return (
    <SectionCard icon={FingerprintIcon} title={t("inventory.detail.identity")} delay={240}>
      <dl className="grid grid-cols-1 gap-1 sm:grid-cols-2">
        <InfoRow icon={HashIcon} label={t("inventory.fields.stockId")} value={vehicle.stockNumber} mono copy={vehicle.stockNumber} />
        <InfoRow icon={BarcodeIcon} label={t("inventory.fields.vin")} value={vehicle.vin} mono copy={vehicle.vin} />
        <InfoRow
          icon={ScanLineIcon}
          label={t("inventory.fields.chassis")}
          value={vehicle.chassisNumber}
          mono
          copy={vehicle.chassisNumber}
        />
        <InfoRow icon={TagIcon} label={t("inventory.fields.brand")} value={`${vehicle.make} · ${vehicle.model}`} />
        <InfoRow icon={LayersIcon} label={t("inventory.fields.variant")} value={vehicle.variant} />
        <InfoRow icon={PackageIcon} label={t("inventory.fields.quantity")} value={formatNumber(vehicle.quantity, locale)} />
        {vehicle.splitFrom ? (
          <InfoRow
            icon={SplitIcon}
            label={t("inventory.fields.splitFrom")}
            value={
              <Link href={vehicleHref(vehicle.splitFrom.stockNumber)} className="text-brand underline-offset-4 hover:underline">
                {vehicle.splitFrom.stockNumber}
              </Link>
            }
          />
        ) : null}
      </dl>
    </SectionCard>
  );
}

/* ------------------------------------------------------ origin & location */

export function OriginLocationCard({ vehicle }: { vehicle: VehicleDetail }) {
  const t = useTranslations();
  const country = findCountryByName(vehicle.countryOfOrigin);

  return (
    <SectionCard icon={GlobeIcon} title={t("inventory.detail.originLocation")} delay={300}>
      {/* Where the car physically is, as a small breadcrumb: branch → bay (→ port while in transit). */}
      <div className="bg-muted/40 mb-3 flex flex-wrap items-center gap-2 rounded-xl p-3 text-sm">
        <span className="bg-gold text-brand-foreground flex size-8 items-center justify-center rounded-full">
          <MapPinIcon className="size-4" aria-hidden />
        </span>
        <span className="font-semibold">{vehicle.branchName ?? t("inventory.fields.notSet")}</span>
        {vehicle.locationName ? (
          <>
            <span className="text-muted-foreground rtl:rotate-180" aria-hidden>
              ›
            </span>
            <span>{vehicle.locationName}</span>
          </>
        ) : null}
        {vehicle.status === "acquired" && vehicle.portLocation ? (
          <span className="ms-auto inline-flex items-center gap-1 rounded-full bg-sky-500/12 px-2 py-0.5 text-xs font-medium text-sky-700 dark:text-sky-300">
            <ShipIcon className="size-3.5" aria-hidden />
            {vehicle.portLocation}
          </span>
        ) : null}
      </div>
      <dl className="grid grid-cols-1 gap-1 sm:grid-cols-2">
        <InfoRow icon={ShieldCheckIcon} label={t("inventory.fields.origin")} value={enumLabel(t, "origin", vehicle.originType)} />
        <InfoRow
          icon={GlobeIcon}
          label={t("inventory.fields.countryOfOrigin")}
          value={
            vehicle.countryOfOrigin ? (
              <span className="inline-flex items-center gap-2">
                <span className="text-base leading-none" aria-hidden>
                  {country ? countryFlag(country.code) : "🏳️"}
                </span>
                {vehicle.countryOfOrigin}
              </span>
            ) : null
          }
        />
        <InfoRow
          icon={PaletteIcon}
          label={t("inventory.fields.exteriorColor")}
          value={vehicle.exteriorColor ? <VehicleColorDisplay value={vehicle.exteriorColor} /> : null}
        />
        <InfoRow
          icon={PaletteIcon}
          label={t("inventory.fields.interiorColor")}
          value={vehicle.interiorColor ? <VehicleColorDisplay value={vehicle.interiorColor} /> : null}
        />
      </dl>
    </SectionCard>
  );
}

/* ------------------------------------------------------------ acquisition */

const ACQ_TONE: Record<string, string> = {
  received: "bg-emerald-600/10 text-emerald-700 dark:text-emerald-300",
  purchased: "bg-sky-500/12 text-sky-700 dark:text-sky-300",
  approved: "bg-sky-500/12 text-sky-700 dark:text-sky-300",
  cancelled: "bg-muted text-muted-foreground",
  rejected: "bg-rose-500/12 text-rose-700 dark:text-rose-300",
};

export function AcquisitionSummaryCard({ vehicle }: { vehicle: VehicleDetail }) {
  const t = useTranslations();
  const locale = useAppLocale();
  const acquisition = vehicle.acquisition;
  if (!acquisition) return null;
  const money = (value: number | null | undefined) =>
    value == null ? null : formatCurrency(value, locale, acquisition.currency ?? undefined);
  const cost = acquisition.totalAcquisitionCost ?? vehicle.totalAcquisitionCost;

  return (
    <SectionCard
      icon={StoreIcon}
      title={t("inventory.sections.acquisition")}
      delay={360}
      action={
        <Link
          href={vehicleHref(vehicle.stockNumber, "", "acquisition")}
          className={cn(buttonVariants({ variant: "outline", size: "sm" }))}
        >
          {t("inventory.actions.viewAcquisition")}
        </Link>
      }
    >
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <span className="font-mono text-sm font-semibold">{acquisition.acquisitionNumber}</span>
        <span
          className={cn(
            "rounded-full px-2 py-0.5 text-xs font-medium",
            ACQ_TONE[acquisition.status] ?? "bg-amber-500/12 text-amber-700 dark:text-amber-300",
          )}
        >
          {t(`acquisitions.status.${acquisition.status}`)}
        </span>
      </div>
      <dl className="grid grid-cols-1 gap-1 sm:grid-cols-2">
        <InfoRow
          icon={BuildingIcon}
          label={t("inventory.fields.acquisitionType")}
          value={acquisition.sourceType ? t(`acquisitions.sourceTypes.${acquisition.sourceType}`) : null}
        />
        <InfoRow
          icon={CalendarIcon}
          label={t("inventory.fields.purchaseDate")}
          value={acquisition.purchaseDate ? formatDate(acquisition.purchaseDate, locale, "medium") : null}
        />
        {acquisition.purchasePrice != null ? (
          <InfoRow
            icon={TagIcon}
            label={t("inventory.fields.purchasePrice")}
            value={
              vehicle.quantity > 1
                ? `${money(acquisition.purchasePrice)} × ${vehicle.quantity} = ${money(quantityTotal(acquisition.purchasePrice, vehicle.quantity))}`
                : money(acquisition.purchasePrice)
            }
          />
        ) : null}
        {cost != null ? (
          <InfoRow icon={WarehouseIcon} label={t("inventory.fields.acquisitionCost")} value={money(cost)} />
        ) : null}
      </dl>
    </SectionCard>
  );
}

/* -------------------------------------------------------- record & notes */

export function RecordNotesCard({ vehicle }: { vehicle: VehicleDetail }) {
  const t = useTranslations();
  const locale = useAppLocale();
  const entries = [
    { key: "created", label: t("inventory.overview.created"), at: vehicle.createdAt, by: vehicle.createdByName },
    { key: "updated", label: t("inventory.overview.updated"), at: vehicle.updatedAt, by: vehicle.updatedByName },
  ];

  return (
    <SectionCard icon={ClipboardListIcon} title={t("inventory.overview.recordNotes")} delay={420}>
      <div className="grid gap-4">
        <figure
          className={cn(
            "relative rounded-xl border-s-4 p-4 text-sm",
            vehicle.description ? "border-brand bg-brand-soft/40" : "border-border bg-muted/30",
          )}
        >
          <figcaption className="text-muted-foreground mb-1.5 flex items-center gap-1.5 text-[11px] font-medium tracking-wide uppercase">
            <NotebookPenIcon className="size-3.5" aria-hidden />
            {t("inventory.fields.notes")}
          </figcaption>
          <p className={cn("whitespace-pre-wrap", !vehicle.description && "text-muted-foreground italic")}>
            {vehicle.description || t("inventory.overview.noNotes")}
          </p>
        </figure>

        <ol className="grid gap-3 sm:grid-cols-2">
          {entries.map((entry) => (
            <li key={entry.key} className="flex items-center gap-3 rounded-xl border p-3">
              <span className="bg-muted flex size-9 shrink-0 items-center justify-center rounded-full text-xs font-semibold">
                {entry.by ? (
                  entry.by
                    .split(/\s+/)
                    .slice(0, 2)
                    .map((part) => part[0]?.toUpperCase())
                    .join("")
                ) : (
                  <UserRoundIcon className="text-muted-foreground size-4" aria-hidden />
                )}
              </span>
              <div className="grid min-w-0 gap-0.5">
                <span className="text-muted-foreground text-[11px] font-medium tracking-wide uppercase">{entry.label}</span>
                <span className="truncate text-sm font-medium">{entry.by ?? "—"}</span>
                <span className="text-muted-foreground text-xs" title={formatDate(entry.at, locale, "dateTime")}>
                  {formatRelativeTime(entry.at, locale)}
                </span>
              </div>
            </li>
          ))}
        </ol>
      </div>
    </SectionCard>
  );
}
