"use client";

import {
  ArchiveIcon,
  ArrowLeftRightIcon,
  CameraIcon,
  FileTextIcon,
  HistoryIcon,
  LayoutDashboardIcon,
  MoreHorizontalIcon,
  PackageIcon,
  PencilIcon,
  RefreshCwIcon,
  TagsIcon,
} from "lucide-react";
import { useTranslations } from "next-intl";
import { useEffect, useMemo, useState } from "react";

import { PermissionGate } from "@/components/auth/permission-gate";
import { EmptyState } from "@/components/feedback/empty-state";
import {
  useAppLocale,
  vehicleTitle,
} from "@/components/inventory/inventory-utils";
import { VehicleArchiveDialog } from "@/components/inventory/vehicle-archive-dialog";
import { VehicleDocumentsPanel } from "@/components/inventory/vehicle-documents-panel";
import { VehicleHistory } from "@/components/inventory/vehicle-history";
import { VehicleImageManager } from "@/components/inventory/vehicle-image-manager";
import {
  AcquisitionSummaryCard,
  IdentificationCard,
  OriginLocationCard,
  RecordNotesCard,
} from "@/components/inventory/vehicle-overview-sections";
import {
  AcquisitionCostChart,
  BookingProgressCard,
  KeyDatesCard,
  PriceProfitCard,
  StockAgeCard,
  VehicleHero,
} from "@/components/inventory/vehicle-insights";
import { ShareVehicleButton } from "@/components/inventory/share-vehicle-button";
import { StorefrontListingToggle } from "@/components/inventory/storefront-listing-toggle";
import { VehicleSaleActions } from "@/components/inventory/vehicle-sale-actions";
import { SoldTag } from "@/components/inventory/vehicle-sold-tag";
import { usePermission } from "@/hooks/use-permission";
import { VehicleTransferDialog } from "@/components/inventory/vehicle-transfer-dialog";
import { VehiclePricingPanel } from "@/components/pricing/vehicle-pricing-panel";
import { PageHeader } from "@/components/layout/page-header";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button, buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { VehicleDetailSkeleton } from "@/components/feedback/skeletons";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useVehicle } from "@/hooks/use-vehicles";
import { Link } from "@/lib/i18n/navigation";
import { cn } from "@/lib/utils";
import { formatCurrency } from "@/lib/utils/currency";
import { formatDate } from "@/lib/utils/date";
import { canArchiveStatus, isSoldStatus } from "@/lib/vehicles/status-transitions";
import type { VehicleDetail } from "@/types/vehicle";
import { vehicleHref } from "@/lib/vehicles/routes";
import { quantityTotal } from "@/lib/vehicles/quantity";

const DETAIL_TABS = [
  "overview",
  "acquisition",
  "pricing",
  "photos",
  "documents",
  "history",
] as const;

type DetailTab = (typeof DETAIL_TABS)[number];

function DetailItem({ label, value }: { label: string; value: React.ReactNode }) {
  const t = useTranslations();
  const empty = value === null || value === undefined || value === "";
  return (
    <div className="bg-muted/30 grid gap-1 rounded-xl px-3.5 py-3">
      <dt className="text-muted-foreground text-[11px] font-medium tracking-wide uppercase">
        {label}
      </dt>
      <dd
        className={cn(
          "text-sm font-medium wrap-break-word",
          empty && "text-muted-foreground font-normal",
        )}
      >
        {empty ? t("inventory.fields.notSet") : value}
      </dd>
    </div>
  );
}

function Overview({ vehicle }: { vehicle: VehicleDetail }) {
  const hasPrivate =
    vehicle.totalAcquisitionCost !== undefined ||
    vehicle.minimumSellingPrice !== undefined ||
    vehicle.currentSellingPrice != null;

  return (
    <div className="grid gap-4">
      <VehicleHero vehicle={vehicle} />

      {/* Money and time: the questions owners ask first. */}
      <div className="grid gap-4 lg:grid-cols-3">
        {hasPrivate ? (
          <div className="lg:col-span-2">
            <PriceProfitCard vehicle={vehicle} />
          </div>
        ) : null}
        <StockAgeCard vehicle={vehicle} />
        {!hasPrivate ? (
          <div className="lg:col-span-2">
            <KeyDatesCard vehicle={vehicle} />
          </div>
        ) : null}
      </div>

      {vehicle.booking || hasPrivate ? (
        <div className="grid gap-4 lg:grid-cols-3">
          {vehicle.booking ? (
            <div className="lg:col-span-2">
              <BookingProgressCard vehicle={vehicle} />
            </div>
          ) : null}
          {hasPrivate ? (
            <div className={cn(!vehicle.booking && "lg:col-span-3")}>
              <KeyDatesCard vehicle={vehicle} />
            </div>
          ) : null}
        </div>
      ) : null}

      <div className="grid gap-4 lg:grid-cols-2">
        <IdentificationCard vehicle={vehicle} />
        <OriginLocationCard vehicle={vehicle} />
        {vehicle.acquisition ? <AcquisitionSummaryCard vehicle={vehicle} /> : null}
        <div className={cn(!vehicle.acquisition && "lg:col-span-2")}>
          <RecordNotesCard vehicle={vehicle} />
        </div>
      </div>
    </div>
  );
}

function AcquisitionPanel({ vehicle }: { vehicle: VehicleDetail }) {
  const t = useTranslations();
  const locale = useAppLocale();
  const acquisition = vehicle.acquisition;
  const isActive =
    acquisition != null && acquisition.status !== "cancelled" && acquisition.status !== "rejected";
  const date = (value: string | null | undefined) =>
    value ? formatDate(value, locale, "medium") : null;
  const money = (value: number | null | undefined) =>
    value == null ? null : formatCurrency(value, locale, acquisition?.currency ?? undefined);

  if (!isActive) {
    return (
      <div className="grid gap-4">
        {acquisition ? (
          <Card>
            <CardHeader>
              <CardTitle>{t("inventory.acquisition.previousTitle")}</CardTitle>
            </CardHeader>
            <CardContent>
              <dl className="grid gap-4 sm:grid-cols-2">
                <DetailItem
                  label={t("inventory.fields.acquisitionNumber")}
                  value={acquisition.acquisitionNumber}
                />
                <DetailItem
                  label={t("inventory.fields.acquisitionStatus")}
                  value={t(`acquisitions.status.${acquisition.status}`)}
                />
              </dl>
            </CardContent>
          </Card>
        ) : null}
        <EmptyState
          title={t("inventory.acquisition.emptyTitle")}
          description={t("inventory.acquisition.emptyHint")}
          action={
            isSoldStatus(vehicle.status) ? undefined : (
              <PermissionGate permission="acquisition.create">
                <Link href={vehicleHref(vehicle.stockNumber, "/edit")} className={cn(buttonVariants())}>
                  {t("inventory.actions.addAcquisition")}
                </Link>
              </PermissionGate>
            )
          }
        />
      </div>
    );
  }

  return (
    <Card className="border-border/70 shadow-none">
      <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-3 space-y-0">
        <CardTitle className="text-base tracking-tight">
          {t("inventory.sections.acquisition")}
        </CardTitle>
        {isSoldStatus(vehicle.status) ? null : (
          <div className="flex flex-wrap gap-2">
            <PermissionGate permission="vehicle.edit">
              <Link
                href={vehicleHref(vehicle.stockNumber, "/edit")}
                className={cn(buttonVariants({ variant: "outline", size: "sm" }))}
              >
                {t("inventory.actions.edit")}
              </Link>
            </PermissionGate>
          </div>
        )}
      </CardHeader>
      <CardContent className="grid gap-4">
        {vehicle.acquisitionSharedFrom ? (
          <Alert>
            <AlertDescription>
              {t.rich("inventory.acquisition.sharedFrom", {
                stock: vehicle.acquisitionSharedFrom.stockNumber,
                link: (chunks) => (
                  <Link
                    href={vehicleHref(vehicle.acquisitionSharedFrom!.stockNumber, "", "acquisition")}
                    className="font-medium underline underline-offset-4"
                  >
                    {chunks}
                  </Link>
                ),
              })}
            </AlertDescription>
          </Alert>
        ) : null}
        <dl className="grid grid-cols-2 gap-2.5 sm:gap-4 lg:grid-cols-3">
          <DetailItem
            label={t("inventory.fields.acquisitionNumber")}
            value={acquisition.acquisitionNumber}
          />
          <DetailItem
            label={t("inventory.fields.acquisitionStatus")}
            value={t(`acquisitions.status.${acquisition.status}`)}
          />
          <DetailItem
            label={t("inventory.fields.acquisitionType")}
            value={
              acquisition.sourceType
                ? t(`acquisitions.sourceTypes.${acquisition.sourceType}`)
                : null
            }
          />
          <DetailItem
            label={t("inventory.fields.purchaseDate")}
            value={date(acquisition.purchaseDate)}
          />
          <DetailItem
            label={
              vehicle.quantity > 1
                ? t("inventory.quantity.perUnitLabel", { label: t("inventory.fields.purchasePrice") })
                : t("inventory.fields.purchasePrice")
            }
            value={money(acquisition.purchasePrice)}
          />
          {acquisition.purchasePrice != null && vehicle.quantity > 1 ? (
            <DetailItem
              label={t("inventory.totals.totalPurchase", { count: vehicle.quantity })}
              value={money(quantityTotal(acquisition.purchasePrice, vehicle.quantity))}
            />
          ) : null}
          <DetailItem
            label={
              vehicle.quantity > 1
                ? t("inventory.quantity.perUnitLabel", { label: t("inventory.fields.acquisitionCost") })
                : t("inventory.fields.acquisitionCost")
            }
            value={
              money(acquisition.totalAcquisitionCost ?? vehicle.totalAcquisitionCost) ??
              (vehicle.totalAcquisitionCost === undefined
                ? t("inventory.placeholders.restricted")
                : null)
            }
          />
          {vehicle.quantity > 1 && (acquisition.totalAcquisitionCost ?? vehicle.totalAcquisitionCost) != null ? (
            <DetailItem
              label={t("inventory.totals.totalAcquisitionCost", { count: vehicle.quantity })}
              value={money(
                quantityTotal(acquisition.totalAcquisitionCost ?? vehicle.totalAcquisitionCost, vehicle.quantity),
              )}
            />
          ) : null}
        </dl>
        <AcquisitionCostChart
          purchasePrice={acquisition.purchasePrice}
          totalCost={acquisition.totalAcquisitionCost ?? vehicle.totalAcquisitionCost}
          currency={acquisition.currency}
        />
      </CardContent>
    </Card>
  );
}

export function VehicleDetailClient({
  vehicleId,
  initialTab = "overview",
}: {
  vehicleId: string;
  initialTab?: string;
}) {
  const t = useTranslations();
  const query = useVehicle(vehicleId);
  const { user, can } = usePermission();
  // Purchase details follow acquisition access; sales executives don't get the tab.
  const canViewPurchase = can("acquisition.view");
  // Once the header scrolls away, Book now / Mark as sold move into the sticky tab bar.
  const [headerEnd, setHeaderEnd] = useState<HTMLDivElement | null>(null);
  const [tabsStuck, setTabsStuck] = useState(false);
  useEffect(() => {
    if (!headerEnd) return;
    const observer = new IntersectionObserver(([entry]) =>
      setTabsStuck(!entry.isIntersecting && entry.boundingClientRect.top < (entry.rootBounds?.top ?? 0) + 200),
    );
    observer.observe(headerEnd);
    return () => observer.disconnect();
  }, [headerEnd]);
  const [transferOpen, setTransferOpen] = useState(false);
  const [archiveOpen, setArchiveOpen] = useState(false);

  const resolvedTab: DetailTab =
    initialTab &&
    DETAIL_TABS.includes(initialTab as DetailTab) &&
    (initialTab !== "acquisition" || canViewPurchase)
      ? (initialTab as DetailTab)
      : "overview";

  const tabs = useMemo(
    () =>
      [
        { id: "overview" as const, label: t("inventory.tabs.overview"), icon: LayoutDashboardIcon },
        ...(canViewPurchase
          ? [{ id: "acquisition" as const, label: t("inventory.tabs.acquisition"), icon: PackageIcon }]
          : []),
        { id: "pricing" as const, label: t("inventory.tabs.pricing"), icon: TagsIcon },
        { id: "photos" as const, label: t("inventory.tabs.photos"), icon: CameraIcon },
        { id: "documents" as const, label: t("inventory.tabs.documents"), icon: FileTextIcon },
        { id: "history" as const, label: t("inventory.tabs.history"), icon: HistoryIcon },
      ] as const,
    [t, canViewPurchase],
  );

  if (query.isPending) return <VehicleDetailSkeleton />;

  if (query.isError) {
    return (
      <EmptyState
        title={t("inventory.empty.notFound")}
        description={t("inventory.empty.notFoundHint")}
        action={
          <div className="flex flex-wrap justify-center gap-2">
            <Button variant="outline" onClick={() => void query.refetch()}>
              <RefreshCwIcon aria-hidden />
              {t("common.retry")}
            </Button>
            <Link href="/inventory" className={buttonVariants()}>
              {t("inventory.actions.back")}
            </Link>
          </div>
        }
      />
    );
  }

  const vehicle = query.data;
  const isArchived = vehicle.status === "archived";
  const isSuperAdmin = user.roles.includes("super_admin");
  const meta = [vehicle.stockNumber, vehicle.vin].filter(Boolean).join(" · ");

  return (
    <div className="flex flex-col gap-5">
      <PageHeader
        title={vehicleTitle(vehicle)}
        description={meta || undefined}
        actions={
          <>
            {isSoldStatus(vehicle.status) ? (
              <SoldTag soldAt={vehicle.booking?.status === "converted" ? vehicle.booking.soldAt : null} />
            ) : (
              <VehicleSaleActions vehicle={vehicle} />
            )}
            <ShareVehicleButton vehicle={vehicle} layout="button" className="flex-1 sm:flex-none" />
            {!isArchived && !isSoldStatus(vehicle.status) ? (
              <PermissionGate permission="vehicle.edit">
                <Link
                  href={vehicleHref(vehicle.stockNumber, "/edit")}
                  className={cn(buttonVariants(), "h-10 flex-1 sm:flex-none md:h-9")}
                >
                  <PencilIcon aria-hidden />
                  {t("inventory.actions.edit")}
                </Link>
              </PermissionGate>
            ) : null}
            {/* More actions (move branch, archive) are for Super Admins only. */}
            {isSuperAdmin && (!isArchived || canArchiveStatus(vehicle.status)) ? (
              <DropdownMenu>
                <DropdownMenuTrigger
                  render={
                    <Button
                      variant="outline"
                      size="icon"
                      className="h-10 w-10 md:h-9 md:w-9"
                      aria-label={t("nav.more")}
                    />
                  }
                >
                  <MoreHorizontalIcon aria-hidden />
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="min-w-44">
                  {!isArchived ? (
                    <PermissionGate permission="vehicle.branch.transfer">
                      <DropdownMenuItem onClick={() => setTransferOpen(true)}>
                        <ArrowLeftRightIcon aria-hidden />
                        {t("inventory.actions.transfer")}
                      </DropdownMenuItem>
                    </PermissionGate>
                  ) : null}
                  {canArchiveStatus(vehicle.status) ? (
                    <PermissionGate permission="vehicle.archive">
                      <DropdownMenuItem variant="destructive" onClick={() => setArchiveOpen(true)}>
                        <ArchiveIcon aria-hidden />
                        {t("inventory.actions.archive")}
                      </DropdownMenuItem>
                    </PermissionGate>
                  ) : null}
                </DropdownMenuContent>
              </DropdownMenu>
            ) : null}
          </>
        }
      />

      {/* Leaves the screen when the tab bar sticks to the top. */}
      <div ref={setHeaderEnd} aria-hidden className="-mt-5 h-px" />

      <StorefrontListingToggle vehicle={vehicle} />

      <Tabs defaultValue={resolvedTab} className="gap-4">
        <div
          className={cn(
            "bg-background/95 supports-backdrop-filter:bg-background/90 sticky z-20 flex items-center gap-2 border-b backdrop-blur-md",
            // Cancel #main py-5 / lg:py-8 so the bar sits flush under the app header.
            "-top-5 -mx-4 px-4 py-2 md:-mx-6 md:px-6 lg:-top-8 lg:-mx-8 lg:px-8",
          )}
        >
          {/* The list is wider than a phone, so it scrolls sideways inside its own box
              instead of stretching the whole page. */}
          <div className="bg-muted/40 min-w-0 flex-1 overflow-x-auto overscroll-x-contain rounded-2xl border p-1.5 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
            <TabsList
              variant="default"
              className="h-auto w-max min-w-full justify-start gap-1 bg-transparent p-0"
            >
              {tabs.map((tab) => {
                const Icon = tab.icon;
                return (
                  <TabsTrigger
                    key={tab.id}
                    value={tab.id}
                    // Keep the chosen tab visible when it starts off-screen on a phone.
                    onClick={(event) =>
                      event.currentTarget.scrollIntoView({ block: "nearest", inline: "center", behavior: "smooth" })
                    }
                    className={cn(
                      "h-9 shrink-0 flex-none rounded-xl px-3 text-[13px] font-medium sm:h-10 sm:px-3.5 sm:text-sm",
                      "data-active:bg-background data-active:text-foreground data-active:shadow-sm",
                      "dark:data-active:bg-background",
                    )}
                  >
                    <Icon data-icon="inline-start" aria-hidden />
                    <span>{tab.label}</span>
                  </TabsTrigger>
                );
              })}
            </TabsList>
          </div>
          {tabsStuck ? (
            <div className="animate-in fade-in slide-in-from-right-2 flex shrink-0 items-center gap-2 duration-200 rtl:slide-in-from-left-2">
              <VehicleSaleActions vehicle={vehicle} layout="bar" />
            </div>
          ) : null}
        </div>

        <TabsContent value="overview" className="outline-none">
          <Overview vehicle={vehicle} />
        </TabsContent>

        {canViewPurchase ? (
          <TabsContent value="acquisition" className="outline-none">
            <AcquisitionPanel vehicle={vehicle} />
          </TabsContent>
        ) : null}


        <TabsContent value="pricing" className="outline-none">
          <VehiclePricingPanel vehicleId={vehicle.id} />
        </TabsContent>

        <TabsContent value="photos" className="outline-none">
          <VehicleImageManager
            mode="manage"
            vehicleId={vehicle.id}
            readOnly={isSoldStatus(vehicle.status)}
          />
        </TabsContent>

        <TabsContent value="documents" className="outline-none">
          <VehicleDocumentsPanel vehicleId={vehicle.id} />
        </TabsContent>

        <TabsContent value="history" className="outline-none">
          <VehicleHistory vehicleId={vehicle.id} />
        </TabsContent>

      </Tabs>

      <VehicleTransferDialog vehicle={vehicle} open={transferOpen} onOpenChange={setTransferOpen} />
      <VehicleArchiveDialog vehicle={vehicle} open={archiveOpen} onOpenChange={setArchiveOpen} />
    </div>
  );
}
