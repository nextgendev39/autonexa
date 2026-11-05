"use client";

import { FileIcon } from "lucide-react";
import { useTranslations } from "next-intl";
import type { ReactNode } from "react";

import { useAppLocale } from "@/components/inventory/inventory-utils";
import { QuantityTotals } from "@/components/inventory/quantity-totals";
import { Button } from "@/components/ui/button";
import { useInventoryMeta } from "@/hooks/use-vehicles";
import { cn } from "@/lib/utils";
import { formatCurrency } from "@/lib/utils/currency";
import type { AcquisitionFormValues } from "@/lib/validation/acquisition";
import type { VehicleFormValues } from "@/lib/validation/vehicle";
import type { PendingAcquisitionDocument } from "@/types/acquisition-document";
import type { PendingVehiclePhoto } from "@/types/vehicle-photo";

function dash(value: ReactNode) {
  if (value == null || value === "") return "—";
  return value;
}

function ReviewField({ label, value, className }: { label: string; value: ReactNode; className?: string }) {
  return (
    <div className={cn("min-w-0", className)}>
      <dt className="text-muted-foreground text-xs">{label}</dt>
      <dd className="mt-0.5 text-sm font-medium wrap-break-word whitespace-pre-wrap">{dash(value)}</dd>
    </div>
  );
}

function ReviewSection({
  title,
  onEdit,
  editLabel,
  children,
}: {
  title: string;
  onEdit: () => void;
  editLabel: string;
  children: ReactNode;
}) {
  return (
    <section className="grid gap-3 rounded-xl border p-4">
      <div className="flex items-center justify-between gap-2">
        <h3 className="font-semibold">{title}</h3>
        <Button type="button" variant="outline" size="sm" onClick={onEdit}>
          {editLabel}
        </Button>
      </div>
      {children}
    </section>
  );
}

function formatMoney(amount: number | null | undefined, currency: string) {
  if (amount == null || !Number.isFinite(amount)) return null;
  try {
    return new Intl.NumberFormat(undefined, {
      style: "currency",
      currency: currency || "AED",
      maximumFractionDigits: 2,
    }).format(amount);
  } catch {
    return `${amount} ${currency}`;
  }
}

function formatBytes(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function CreateVehicleReview({
  vehicle,
  acquisition,
  acquisitionIncluded,
  documents,
  photos,
  onEditVehicle,
  onEditAcquisition,
  onEditPhotos,
  showAcquisition,
}: {
  vehicle: VehicleFormValues | null;
  acquisition: AcquisitionFormValues | null;
  acquisitionIncluded: boolean;
  documents: PendingAcquisitionDocument[];
  photos: PendingVehiclePhoto[];
  onEditVehicle: () => void;
  onEditAcquisition: () => void;
  onEditPhotos: () => void;
  showAcquisition: boolean;
}) {
  const t = useTranslations();
  const locale = useAppLocale();
  const meta = useInventoryMeta(vehicle?.branchId || undefined);

  const branchName =
    meta.data?.branches.find((branch) => branch.id === vehicle?.branchId)?.name ?? vehicle?.branchId;
  const locationName =
    meta.data?.locations.find((location) => location.id === vehicle?.locationId)?.name ?? null;

  return (
    <div className="grid gap-4">
      <ReviewSection
        title={t("inventory.stepper.review.vehicleTitle")}
        onEdit={onEditVehicle}
        editLabel={t("inventory.stepper.editStep")}
      >
        {vehicle ? (
          <dl className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            <ReviewField label={t("inventory.fields.vin")} value={vehicle.vin} />
            <ReviewField label={t("inventory.fields.chassisNumber")} value={vehicle.chassisNumber} />
            <ReviewField label={t("inventory.fields.brand")} value={vehicle.make} />
            <ReviewField label={t("inventory.fields.model")} value={vehicle.model} />
            <ReviewField label={t("inventory.fields.variant")} value={vehicle.variant} />
            <ReviewField label={t("inventory.fields.year")} value={vehicle.year} />
            <ReviewField
              label={t("inventory.fields.marketType")}
              value={t(`inventory.enums.marketType.${vehicle.marketType}`)}
            />
            <ReviewField
              label={t("inventory.fields.mileage")}
              value={`${vehicle.mileage} ${t(`inventory.enums.mileageUnit.${vehicle.mileageUnit}`)}`}
            />
            <ReviewField label={t("inventory.fields.quantity")} value={vehicle.quantity} />
            {vehicle.initialStatus === "acquired" ? (
              <ReviewField label={t("inventory.fields.portLocation")} value={vehicle.portLocation} />
            ) : null}
            {vehicle.minimumSellingPrice != null ? (
              <ReviewField
                label={t("inventory.fields.minimumSellingPrice")}
                value={formatCurrency(vehicle.minimumSellingPrice, locale)}
              />
            ) : null}
            {vehicle.targetSellingPrice != null ? (
              <ReviewField
                label={t("pricing.fields.target")}
                value={formatCurrency(vehicle.targetSellingPrice, locale)}
              />
            ) : null}
            <ReviewField label={t("inventory.fields.bodyType")} value={vehicle.bodyType} />
            <ReviewField
              label={t("inventory.fields.transmission")}
              value={
                vehicle.transmission
                  ? t(`inventory.enums.transmission.${vehicle.transmission}`)
                  : null
              }
            />
            <ReviewField
              label={t("inventory.fields.fuelType")}
              value={vehicle.fuelType ? t(`inventory.enums.fuel.${vehicle.fuelType}`) : null}
            />
            <ReviewField label={t("inventory.fields.engineSize")} value={vehicle.engineSize} />
            <ReviewField label={t("inventory.fields.engineCylinders")} value={vehicle.engineCylinders} />
            <ReviewField
              label={t("inventory.fields.driveType")}
              value={vehicle.driveType ? t(`inventory.enums.drive.${vehicle.driveType}`) : null}
            />
            <ReviewField label={t("inventory.fields.seats")} value={vehicle.seats} />
            <ReviewField label={t("inventory.fields.doors")} value={vehicle.doors} />
            <ReviewField label={t("inventory.fields.exteriorColor")} value={vehicle.exteriorColor} />
            <ReviewField label={t("inventory.fields.interiorColor")} value={vehicle.interiorColor} />
            <ReviewField
              label={t("inventory.fields.originType")}
              value={vehicle.originType ? t(`inventory.enums.origin.${vehicle.originType}`) : null}
            />
            <ReviewField label={t("inventory.fields.countryOfOrigin")} value={vehicle.countryOfOrigin} />
            <ReviewField label={t("inventory.fields.branch")} value={branchName} />
            <ReviewField
              label={t("inventory.fields.location")}
              value={locationName ?? t("inventory.form.noLocation")}
            />
            <ReviewField label={t("inventory.fields.purchaseDate")} value={vehicle.purchaseDate} />
            <ReviewField label={t("inventory.fields.registrationDate")} value={vehicle.registrationDate} />
            <ReviewField
              label={t("inventory.fields.notes")}
              value={vehicle.description}
              className="sm:col-span-2 lg:col-span-3"
            />
          </dl>
        ) : (
          <p className="text-muted-foreground text-sm">{t("inventory.stepper.review.missingVehicle")}</p>
        )}
      </ReviewSection>

      {vehicle ? (
        <QuantityTotals
          quantity={vehicle.quantity}
          rows={[
            {
              label: t("acquisitions.fields.purchasePrice"),
              unitPrice: acquisitionIncluded ? acquisition?.purchasePrice : null,
              currency: acquisition?.currency,
            },
            { label: t("inventory.fields.minimumSellingPrice"), unitPrice: vehicle.minimumSellingPrice },
            { label: t("pricing.fields.target"), unitPrice: vehicle.targetSellingPrice },
          ]}
        />
      ) : null}

      {showAcquisition ? (
        <ReviewSection
          title={t("inventory.stepper.review.acquisitionTitle")}
          onEdit={onEditAcquisition}
          editLabel={t("inventory.stepper.editStep")}
        >
          {!acquisitionIncluded || !acquisition ? (
            <p className="text-muted-foreground text-sm">
              {t("inventory.stepper.review.acquisitionSkipped")}
            </p>
          ) : (
            <div className="grid gap-4">
              <dl className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                <ReviewField
                  label={t("acquisitions.fields.sourceType")}
                  value={t(`acquisitions.sourceTypes.${acquisition.sourceType}`)}
                />
                <ReviewField label={t("acquisitions.fields.sourceName")} value={acquisition.sourceName} />
                <ReviewField
                  label={t("acquisitions.fields.sourceCompany")}
                  value={acquisition.sourceCompany}
                />
                <ReviewField label={t("acquisitions.fields.sourcePhone")} value={acquisition.sourcePhone} />
                <ReviewField label={t("acquisitions.fields.sourceEmail")} value={acquisition.sourceEmail} />
                <ReviewField
                  label={t("acquisitions.fields.sourceReference")}
                  value={acquisition.sourceReference}
                />
                <ReviewField label={t("acquisitions.fields.lotNumber")} value={acquisition.lotNumber} />
                <ReviewField
                  label={t("acquisitions.fields.purchasePrice")}
                  value={formatMoney(acquisition.purchasePrice, acquisition.currency)}
                />
                <ReviewField label={t("acquisitions.fields.currency")} value={acquisition.currency} />
                <ReviewField
                  label={t("acquisitions.fields.purchaseDate")}
                  value={acquisition.purchaseDate}
                />
                <ReviewField
                  label={t("acquisitions.fields.expectedArrivalDate")}
                  value={acquisition.expectedArrivalDate}
                />
                <ReviewField
                  label={t("acquisitions.fields.documentStatus")}
                  value={t(`acquisitions.enums.documentStatus.${acquisition.documentStatus}`)}
                />
                <ReviewField
                  label={t("acquisitions.fields.registrationStatus")}
                  value={t(`acquisitions.enums.registrationStatus.${acquisition.registrationStatus}`)}
                />
                <ReviewField
                  label={t("acquisitions.fields.notes")}
                  value={acquisition.notes}
                  className="sm:col-span-2 lg:col-span-3"
                />
              </dl>

              <div className="grid gap-2">
                <h4 className="text-sm font-semibold">
                  {t("inventory.stepper.review.documentsTitle")}
                </h4>
                {documents.length === 0 ? (
                  <p className="text-muted-foreground text-sm">
                    {t("inventory.stepper.review.documentsNone")}
                  </p>
                ) : (
                  <ul className="grid gap-2">
                    {documents.map((doc) => {
                      const isImage = doc.file.type.startsWith("image/");
                      const previewUrl =
                        doc.previewUrl ||
                        (typeof URL !== "undefined" ? URL.createObjectURL(doc.file) : "");
                      return (
                        <li
                          key={doc.localId}
                          className="bg-muted/30 flex items-start gap-3 rounded-xl border p-3"
                        >
                          {isImage && previewUrl ? (
                            // eslint-disable-next-line @next/next/no-img-element -- local blob preview
                            <img
                              src={previewUrl}
                              alt={doc.title || doc.file.name}
                              className="size-14 shrink-0 rounded-lg object-cover"
                            />
                          ) : (
                            <span className="bg-background flex size-14 shrink-0 items-center justify-center rounded-lg border">
                              <FileIcon className="text-muted-foreground size-5" aria-hidden />
                            </span>
                          )}
                          <div className="min-w-0 flex-1 grid gap-1 text-sm">
                            <p className="font-medium wrap-break-word">{doc.title || doc.file.name}</p>
                            <p className="text-muted-foreground text-xs">
                              {t(`acquisitions.documents.categories.${doc.category}`)} · {doc.file.name} ·{" "}
                              {formatBytes(doc.file.size)}
                            </p>
                            {doc.referenceNumber ? (
                              <p className="text-muted-foreground text-xs">
                                {t("acquisitions.documents.referenceNumber")}: {doc.referenceNumber}
                              </p>
                            ) : null}
                            {doc.notes ? (
                              <p className="text-muted-foreground wrap-break-word whitespace-pre-wrap text-xs">
                                {doc.notes}
                              </p>
                            ) : null}
                            <button
                              type="button"
                              className="text-primary w-fit text-xs font-medium underline-offset-2 hover:underline"
                              onClick={() => {
                                const url = doc.previewUrl || URL.createObjectURL(doc.file);
                                window.open(url, "_blank", "noopener,noreferrer");
                                if (!doc.previewUrl) {
                                  window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
                                }
                              }}
                            >
                              {t("acquisitions.documents.view")}
                            </button>
                          </div>
                        </li>
                      );
                    })}
                  </ul>
                )}
              </div>
            </div>
          )}
        </ReviewSection>
      ) : null}

      <ReviewSection
        title={t("inventory.stepper.review.photosTitle")}
        onEdit={onEditPhotos}
        editLabel={t("inventory.stepper.editStep")}
      >
        {photos.length === 0 ? (
          <p className="text-muted-foreground text-sm">{t("inventory.stepper.review.photosNone")}</p>
        ) : (
          <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
            {photos.map((photo) => (
              <li key={photo.localId} className="relative overflow-hidden rounded-xl border">
                {/* eslint-disable-next-line @next/next/no-img-element -- local blob preview */}
                <img
                  src={photo.previewUrl}
                  alt={photo.file.name}
                  className="aspect-[4/3] w-full object-cover"
                />
                {photo.isPrimary ? (
                  <span className="bg-primary text-primary-foreground absolute start-2 top-2 rounded-full px-2 py-0.5 text-[10px] font-medium">
                    {t("inventory.photos.primary")}
                  </span>
                ) : null}
                <p className="text-muted-foreground truncate px-2 py-1.5 text-xs">{photo.file.name}</p>
              </li>
            ))}
          </ul>
        )}
      </ReviewSection>
    </div>
  );
}
