"use client";

import { CheckIcon, ChevronLeftIcon, ChevronRightIcon, Loader2Icon } from "lucide-react";
import { useTranslations } from "next-intl";
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { toast } from "sonner";

import {
  AcquisitionForm,
  type AcquisitionFormHandle,
} from "@/components/acquisitions/acquisition-form";
import {
  AcquisitionDocumentsManager,
  uploadPendingAcquisitionDocuments,
  useRevokePendingDocuments,
} from "@/components/acquisitions/acquisition-documents-manager";
import { EmptyState } from "@/components/feedback/empty-state";
import { FormStepBar } from "@/components/forms/form-step-bar";
import type { FormStepperStep } from "@/components/forms/form-stepper";
import { CreateVehicleReview } from "@/components/inventory/create-vehicle-review";
import {
  VehicleForm,
  type VehicleFormHandle,
  type VehicleTotalsValues,
} from "@/components/inventory/vehicle-form";
import { QuantityTotals } from "@/components/inventory/quantity-totals";
import {
  VehicleImageManager,
  uploadPendingVehiclePhotos,
} from "@/components/inventory/vehicle-image-manager";
import { LoadingButton } from "@/components/shared/loading-button";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button, buttonVariants } from "@/components/ui/button";
import { VehicleFormSkeleton } from "@/components/feedback/skeletons";
import { useAcquisition, useAcquisitionMutations } from "@/hooks/use-acquisitions";
import { usePermission } from "@/hooks/use-permission";
import { useVehicle, useVehicleMutations } from "@/hooks/use-vehicles";
import { addAcquisitionDocumentRequest } from "@/lib/acquisitions/document-api-client";
import { Link, useRouter } from "@/lib/i18n/navigation";
import { cn } from "@/lib/utils";
import type { AcquisitionFormValues } from "@/lib/validation/acquisition";
import type { VehicleFormValues } from "@/lib/validation/vehicle";
import { addVehiclePhotosRequest } from "@/lib/vehicles/photo-api-client";
import type { PendingAcquisitionDocument } from "@/types/acquisition-document";
import type { PendingVehiclePhoto } from "@/types/vehicle-photo";

type MutationError = Error & {
  fieldErrors?: Record<string, string>;
  code?: string;
  existingVehicleId?: string;
  existingAcquisitionId?: string;
};

function useSubmitErrors() {
  const t = useTranslations();
  const [fieldErrors, setFieldErrors] = useState<Record<string, string> | undefined>();
  const [formError, setFormError] = useState<ReactNode>(null);

  function reset() {
    setFieldErrors(undefined);
    setFormError(null);
  }

  function handle(error: unknown) {
    const err = error as MutationError;
    const duplicate = err.code === "duplicate_vin" || err.code === "duplicate_chassis";
    const message =
      err.code === "duplicate_vin"
        ? t("inventory.toasts.duplicateVin")
        : err.code === "duplicate_chassis"
          ? t("inventory.toasts.duplicateChassis")
          : err.code === "duplicate_acquisition"
            ? t("acquisitions.errors.duplicateActive")
            : err.message || t("inventory.toasts.error");

    setFieldErrors(err.fieldErrors ? { ...err.fieldErrors } : undefined);
    setFormError(
      <span className="flex flex-wrap items-center gap-x-3 gap-y-1">
        <span>{message}</span>
        {duplicate && err.existingVehicleId ? (
          <Link
            href={`/inventory/${err.existingVehicleId}`}
            className="font-medium underline underline-offset-4"
          >
            {t("inventory.actions.viewExisting")}
          </Link>
        ) : err.existingAcquisitionId ? (
          <Link
            href={`/inventory?tab=acquisition`}
            className="font-medium underline underline-offset-4"
          >
            {t("acquisitions.actions.viewExisting")}
          </Link>
        ) : null}
      </span>,
    );
    toast.error(message);
  }

  return { fieldErrors, formError, reset, handle };
}

function withVehicleLink(
  values: AcquisitionFormValues,
  vehicleId: string,
  vehicle: VehicleFormValues,
): AcquisitionFormValues {
  return {
    ...values,
    branchId: vehicle.branchId,
    vehicle: {
      vehicleId,
      vin: vehicle.vin ?? null,
      chassisNumber: vehicle.chassisNumber ?? null,
      make: vehicle.make,
      model: vehicle.model,
      variant: vehicle.variant ?? null,
      year: vehicle.year,
      mileage: vehicle.mileage,
      originType: vehicle.originType ?? "unknown",
      countryOfOrigin: vehicle.countryOfOrigin ?? null,
      makeId: vehicle.makeId ?? null,
      modelId: vehicle.modelId ?? null,
    },
  };
}

type PurchaseValues = { purchasePrice: number | null; currency: string };

/** Acquisition-step content after Purchase: the selling price slot, then quantity totals. */
function AfterPurchase({
  showPricing,
  onPricingSlot,
  vehicle,
  purchase,
}: {
  showPricing: boolean;
  onPricingSlot: (node: HTMLDivElement | null) => void;
  vehicle: VehicleTotalsValues | null;
  purchase: PurchaseValues | null;
}) {
  const t = useTranslations();
  return (
    <>
      {showPricing ? <div ref={onPricingSlot} /> : null}
      {vehicle ? (
        <QuantityTotals
          quantity={vehicle.quantity}
          rows={[
            {
              label: t("acquisitions.fields.purchasePrice"),
              unitPrice: purchase?.purchasePrice,
              currency: purchase?.currency,
            },
            ...(showPricing
              ? [
                  {
                    label: t("inventory.fields.minimumSellingPrice"),
                    unitPrice: vehicle.minimumSellingPrice,
                  },
                  { label: t("pricing.fields.target"), unitPrice: vehicle.targetSellingPrice },
                ]
              : []),
          ]}
        />
      ) : null}
    </>
  );
}

/** Edge-to-edge bars inside <main>, which pads its content by these amounts. */
const BLEED = "-mx-4 px-4 md:-mx-6 md:px-6 lg:-mx-8 lg:px-8";

/**
 * Full-screen step form: a slim sticky step bar, the form, and the actions pinned to the
 * bottom. The app shell drops the mobile tab bar on these routes so the form gets the room.
 */
function StepLayout({
  header,
  actions,
  children,
}: {
  header: ReactNode;
  actions: ReactNode;
  children: ReactNode;
}) {
  return (
    <div className="flex flex-1 flex-col">
      <div
        className={cn(
          "bg-background/95 supports-backdrop-filter:bg-background/80 sticky top-0 z-20 border-b py-2.5 backdrop-blur-md",
          BLEED,
        )}
      >
        {header}
      </div>
      <div className="grid flex-1 content-start gap-4 py-4 lg:py-6">{children}</div>
      <div
        className={cn(
          "bg-background/95 supports-backdrop-filter:bg-background/80 sticky bottom-0 z-20 border-t pt-3 pb-[calc(0.75rem+env(safe-area-inset-bottom))] backdrop-blur-md",
          BLEED,
        )}
      >
        <div className="flex items-center gap-2 sm:justify-end">{actions}</div>
      </div>
    </div>
  );
}

/** Taller on phones for easier tapping; the main action takes the spare width. */
const actionClass = "h-11 sm:h-9 sm:min-w-24";

function scrollToTop() {
  document.getElementById("main")?.scrollTo({ top: 0, behavior: "auto" });
}

type CreateStepId = "vehicle" | "acquisition" | "photos" | "review";
type EditStepId = "vehicle" | "acquisition" | "photos";

function CreateVehicle() {
  const t = useTranslations();
  const router = useRouter();
  const { can } = usePermission();
  const { create } = useVehicleMutations();
  const { create: createAcquisition } = useAcquisitionMutations();
  const errors = useSubmitErrors();
  const vehicleRef = useRef<VehicleFormHandle | null>(null);
  const acquisitionRef = useRef<AcquisitionFormHandle | null>(null);
  const [pendingPhotos, setPendingPhotos] = useState<PendingVehiclePhoto[]>([]);
  const [pendingDocuments, setPendingDocuments] = useState<PendingAcquisitionDocument[]>([]);
  const [acquisitionDirty, setAcquisitionDirty] = useState(false);
  const [acquisitionSkipped, setAcquisitionSkipped] = useState(false);
  const [vehicleSnapshot, setVehicleSnapshot] = useState<VehicleFormValues | null>(null);
  const [acquisitionSnapshot, setAcquisitionSnapshot] = useState<AcquisitionFormValues | null>(
    null,
  );
  const [stepId, setStepId] = useState<CreateStepId>("vehicle");
  const [createdVehicleId, setCreatedVehicleId] = useState<string | null>(null);
  const [createdAcquisitionId, setCreatedAcquisitionId] = useState<string | null>(null);
  const [failedPhotos, setFailedPhotos] = useState<PendingVehiclePhoto[]>([]);
  const [failedDocuments, setFailedDocuments] = useState<PendingAcquisitionDocument[]>([]);
  const [uploadingMedia, setUploadingMedia] = useState(false);
  const submitLock = useRef(false);
  // Selling price renders on the acquisition step, next to the purchase price.
  const [pricingSlot, setPricingSlot] = useState<HTMLDivElement | null>(null);
  const [vehicleTotals, setVehicleTotals] = useState<VehicleTotalsValues | null>(null);
  const [purchase, setPurchase] = useState<PurchaseValues | null>(null);
  useRevokePendingDocuments(pendingDocuments);

  const showAcquisition = can("acquisition.create");
  const pricingOnAcquisition = Boolean(pricingSlot);

  useEffect(scrollToTop, [stepId]);

  useEffect(() => {
    if (stepId !== "review") return;
    let cancelled = false;

    void (async () => {
      const vehicle = await vehicleRef.current?.validate();
      if (!cancelled && vehicle) setVehicleSnapshot(vehicle);

      if (
        showAcquisition &&
        !acquisitionSkipped &&
        (acquisitionDirty || pendingDocuments.length > 0)
      ) {
        const acquisition = await acquisitionRef.current?.validate();
        if (!cancelled && acquisition) setAcquisitionSnapshot(acquisition);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [stepId, showAcquisition, acquisitionSkipped, acquisitionDirty, pendingDocuments.length]);

  const steps: FormStepperStep[] = [
    {
      id: "vehicle",
      label: t("inventory.stepper.steps.vehicle"),
      description: t("inventory.stepper.hints.vehicle"),
    },
    ...(showAcquisition
      ? [
          {
            id: "acquisition" as const,
            label: t("inventory.stepper.steps.acquisition"),
            description: t("inventory.stepper.hints.acquisition"),
            optional: !pricingOnAcquisition,
          },
        ]
      : []),
    {
      id: "photos",
      label: t("inventory.stepper.steps.photos"),
      description: t("inventory.stepper.hints.photos"),
      optional: true,
    },
    {
      id: "review",
      label: t("inventory.stepper.steps.review"),
      description: t("inventory.stepper.hints.review"),
    },
  ];

  const stepIndex = Math.max(
    0,
    steps.findIndex((step) => step.id === stepId),
  );
  const isFirst = stepIndex <= 0;
  const isLast = stepIndex >= steps.length - 1;

  async function uploadDocuments(
    acquisitionId: string,
    vehicleId: string,
    documents: PendingAcquisitionDocument[],
  ) {
    return uploadPendingAcquisitionDocuments(
      acquisitionId,
      vehicleId,
      documents,
      async (body) => {
        const result = await addAcquisitionDocumentRequest(acquisitionId, body);
        if (result.status === "error") throw new Error(result.message);
        return result.data;
      },
      (localId, progress, status, errorMessage) => {
        setPendingDocuments((current) =>
          current.map((doc) =>
            doc.localId === localId
              ? {
                  ...doc,
                  progress,
                  status,
                  errorMessage: status === "error" ? errorMessage : undefined,
                }
              : doc,
          ),
        );
      },
    );
  }

  async function saveAll(values: VehicleFormValues) {
    if (create.isPending || uploadingMedia || submitLock.current) return;
    submitLock.current = true;
    errors.reset();

    const wantsAcquisition =
      showAcquisition && !acquisitionSkipped && (acquisitionDirty || pendingDocuments.length > 0);

    let acquisitionValues: AcquisitionFormValues | null = null;
    if (wantsAcquisition) {
      acquisitionValues = (await acquisitionRef.current?.validate()) ?? null;
      if (!acquisitionValues) {
        submitLock.current = false;
        setStepId("acquisition");
        toast.error(t("inventory.acquisition.purchasePriceRequired"));
        return;
      }
    }

    try {
      let vehicleId = createdVehicleId;
      let acquisitionId = createdAcquisitionId;

      if (!vehicleId) {
        const vehicle = await create.mutateAsync(values);
        vehicleId = vehicle.id;
        setCreatedVehicleId(vehicleId);
        if (vehicle.pricingWarning) toast.error(t("inventory.toasts.pricingNotSaved"));
      }

      if (wantsAcquisition && acquisitionValues && !acquisitionId) {
        const acquisition = await createAcquisition.mutateAsync(
          withVehicleLink(acquisitionValues, vehicleId, values),
        );
        acquisitionId = acquisition.id;
        setCreatedAcquisitionId(acquisitionId);
      }

      const needsMedia =
        pendingPhotos.length > 0 || (acquisitionId != null && pendingDocuments.length > 0);

      if (needsMedia) {
        setUploadingMedia(true);
        try {
          let docsFailed: PendingAcquisitionDocument[] = [];
          if (acquisitionId && pendingDocuments.length > 0) {
            docsFailed = await uploadDocuments(acquisitionId, vehicleId, pendingDocuments);
            setFailedDocuments(docsFailed);
            if (docsFailed.length === 0) setPendingDocuments([]);
            else setPendingDocuments(docsFailed);
          }

          let photosFailed: PendingVehiclePhoto[] = [];
          if (pendingPhotos.length > 0) {
            photosFailed = await uploadPendingVehiclePhotos(
              vehicleId,
              pendingPhotos,
              async (bodies) => {
                const result = await addVehiclePhotosRequest(vehicleId, bodies);
                if (result.status === "error") throw new Error(result.message);
                return result.data;
              },
            );
            setFailedPhotos(photosFailed);
            if (photosFailed.length === 0) setPendingPhotos([]);
            else setPendingPhotos(photosFailed);
          }

          if (docsFailed.length > 0 || photosFailed.length > 0) {
            toast.error(t("inventory.acquisition.partialUpload"));
            return;
          }
        } finally {
          setUploadingMedia(false);
        }
      }

      toast.success(t("inventory.toasts.created"));
      router.push(`/inventory/${vehicleId}`);
    } catch (error) {
      errors.handle(error);
    } finally {
      submitLock.current = false;
    }
  }

  async function retryFailedUploads() {
    if (!createdVehicleId) return;
    setUploadingMedia(true);
    try {
      if (createdAcquisitionId && failedDocuments.length > 0) {
        const failed = await uploadDocuments(
          createdAcquisitionId,
          createdVehicleId,
          failedDocuments,
        );
        setFailedDocuments(failed);
        setPendingDocuments(failed);
        if (failed.length > 0) {
          toast.error(t("acquisitions.documents.toasts.partialUpload"));
          return;
        }
      }

      if (failedPhotos.length > 0) {
        const failed = await uploadPendingVehiclePhotos(
          createdVehicleId,
          failedPhotos,
          async (bodies) => {
            const result = await addVehiclePhotosRequest(createdVehicleId, bodies);
            if (result.status === "error") throw new Error(result.message);
            return result.data;
          },
        );
        setFailedPhotos(failed);
        setPendingPhotos(failed);
        if (failed.length > 0) {
          toast.error(t("inventory.photos.retryFailed"));
          return;
        }
      }

      toast.success(t("inventory.acquisition.retrySuccess"));
      router.push(`/inventory/${createdVehicleId}`);
    } finally {
      setUploadingMedia(false);
    }
  }

  async function goNext() {
    if (stepId === "vehicle") {
      if (pricingOnAcquisition) {
        if (!(await vehicleRef.current?.validateScope("vehicle"))) {
          toast.error(t("inventory.stepper.fixVehicle"));
          return;
        }
      } else {
        const values = await vehicleRef.current?.validate();
        if (!values) {
          toast.error(t("inventory.stepper.fixVehicle"));
          return;
        }
        setVehicleSnapshot(values);
      }
      setStepId(showAcquisition ? "acquisition" : "photos");
      return;
    }

    if (stepId === "acquisition") {
      if (pricingOnAcquisition && !(await vehicleRef.current?.validateScope("pricing"))) {
        toast.error(t("inventory.stepper.fixPricing"));
        return;
      }
      if (acquisitionDirty || pendingDocuments.length > 0) {
        const values = await acquisitionRef.current?.validate();
        if (!values) {
          toast.error(t("inventory.acquisition.purchasePriceRequired"));
          return;
        }
        setAcquisitionSnapshot(values);
        setAcquisitionSkipped(false);
      } else {
        setAcquisitionSnapshot(null);
      }
      setStepId("photos");
      return;
    }

    if (stepId === "photos") {
      setStepId("review");
    }
  }

  async function skipAcquisition() {
    // Skipping the purchase details still requires the selling price on this step.
    if (pricingOnAcquisition && !(await vehicleRef.current?.validateScope("pricing"))) {
      toast.error(t("inventory.stepper.fixPricing"));
      return;
    }
    setAcquisitionSkipped(true);
    setAcquisitionDirty(false);
    setPendingDocuments([]);
    setAcquisitionSnapshot(null);
    setStepId("photos");
  }

  function goBack() {
    if (isFirst) {
      router.push("/inventory");
      return;
    }
    const prev = steps[stepIndex - 1];
    if (prev) setStepId(prev.id as CreateStepId);
  }

  async function finish() {
    const values = (await vehicleRef.current?.validate()) ?? vehicleSnapshot;
    if (!values) {
      const onPricing = pricingOnAcquisition && vehicleRef.current?.errorScope() === "pricing";
      setStepId(onPricing ? "acquisition" : "vehicle");
      toast.error(t(onPricing ? "inventory.stepper.fixPricing" : "inventory.stepper.fixVehicle"));
      return;
    }
    await saveAll(values);
  }

  const busy = create.isPending || createAcquisition.isPending || uploadingMedia;
  const hasFailedMedia = failedPhotos.length > 0 || failedDocuments.length > 0;
  const acquisitionIncluded =
    showAcquisition && !acquisitionSkipped && (acquisitionDirty || pendingDocuments.length > 0);

  const reviewVehicle = vehicleSnapshot;

  return (
    <StepLayout
      header={
        <FormStepBar
          title={t("modules.inventoryNew.title")}
          closeHref="/inventory"
          closeLabel={t("common.cancel")}
          steps={steps}
          currentId={stepId}
          onStepSelect={(id) => setStepId(id as CreateStepId)}
        />
      }
      actions={
        <>
          <Button
            type="button"
            variant="outline"
            className={actionClass}
            onClick={goBack}
            disabled={busy}
          >
            <ChevronLeftIcon aria-hidden className="rtl:rotate-180" />
            {t("inventory.stepper.back")}
          </Button>
          {stepId === "acquisition" || stepId === "photos" ? (
            <Button
              type="button"
              variant="ghost"
              className={actionClass}
              onClick={
                stepId === "acquisition" ? () => void skipAcquisition() : () => setStepId("review")
              }
              disabled={busy}
            >
              {t("inventory.stepper.skip")}
            </Button>
          ) : null}
          {isLast ? (
            <LoadingButton
              type="button"
              className={cn(actionClass, "flex-1 sm:min-w-32 sm:flex-none")}
              loading={busy}
              onClick={() => void finish()}
            >
              {uploadingMedia ? (
                t("inventory.acquisition.uploadingMedia")
              ) : (
                <>
                  {t("inventory.actions.createSubmit")}
                  <CheckIcon aria-hidden />
                </>
              )}
            </LoadingButton>
          ) : (
            <Button
              type="button"
              className={cn(actionClass, "flex-1 sm:min-w-32 sm:flex-none")}
              onClick={() => void goNext()}
              disabled={busy}
            >
              {t("inventory.stepper.continue")}
              <ChevronRightIcon aria-hidden className="rtl:rotate-180" />
            </Button>
          )}
        </>
      }
    >
      {uploadingMedia ? (
        <div
          className="bg-muted/40 flex items-center gap-3 rounded-xl border px-4 py-3 text-sm"
          role="status"
          aria-live="polite"
        >
          <Loader2Icon className="text-primary size-5 shrink-0 animate-spin" aria-hidden />
          <p className="font-medium">{t("inventory.acquisition.uploadingMedia")}</p>
        </div>
      ) : null}
      {createdVehicleId && hasFailedMedia && !uploadingMedia ? (
        <div className="border-destructive/40 bg-destructive/5 flex flex-wrap items-center justify-between gap-3 rounded-xl border p-4 text-sm">
          <p>{t("inventory.acquisition.partialUpload")}</p>
          <Button type="button" onClick={() => void retryFailedUploads()} disabled={busy}>
            {t("inventory.photos.retryUpload")}
          </Button>
        </div>
      ) : null}

      {errors.formError ? (
        <div className="border-destructive/40 bg-destructive/5 rounded-xl border px-4 py-3 text-sm">
          {errors.formError}
        </div>
      ) : null}

      <div className={cn(stepId === "vehicle" ? "block" : "hidden")}>
        <VehicleForm
          ref={vehicleRef}
          mode="create"
          submitting={busy}
          fieldErrors={errors.fieldErrors}
          formError={null}
          cancelHref="/inventory"
          hideActions
          onSubmit={async () => undefined}
          pricingContainer={pricingSlot}
          onTotalsChange={setVehicleTotals}
        />
      </div>

      {showAcquisition ? (
        <div className={cn(stepId === "acquisition" ? "block" : "hidden")}>
          <AcquisitionForm
            ref={acquisitionRef}
            embedded
            mode="create"
            afterPurchase={
              <AfterPurchase
                showPricing={can("vehicle.price.edit")}
                onPricingSlot={setPricingSlot}
                vehicle={vehicleTotals}
                purchase={purchase}
              />
            }
            onPurchaseChange={setPurchase}
            unitCount={vehicleTotals?.quantity ?? 1}
            submitting={busy}
            fieldErrors={errors.fieldErrors}
            formError={null}
            onDirtyChange={(dirty) => {
              setAcquisitionDirty(dirty);
              if (dirty) setAcquisitionSkipped(false);
            }}
            extraSections={
              can("document.create") || can("document.view") ? (
                createdAcquisitionId && createdVehicleId ? (
                  <AcquisitionDocumentsManager
                    mode="manage"
                    acquisitionId={createdAcquisitionId}
                    vehicleId={createdVehicleId}
                    readOnly={busy || !can("document.create")}
                  />
                ) : can("document.create") ? (
                  <AcquisitionDocumentsManager
                    mode="draft"
                    documents={pendingDocuments}
                    onChange={(docs) => {
                      setPendingDocuments(docs);
                      if (docs.length > 0) setAcquisitionSkipped(false);
                    }}
                    disabled={busy}
                  />
                ) : null
              ) : null
            }
          />
        </div>
      ) : null}

      <div className={cn(stepId === "photos" ? "block" : "hidden")}>
        <VehicleImageManager
          mode="draft"
          photos={pendingPhotos}
          onChange={setPendingPhotos}
          disabled={busy}
        />
      </div>

      {stepId === "review" ? (
        <CreateVehicleReview
          vehicle={reviewVehicle}
          acquisition={acquisitionSnapshot}
          acquisitionIncluded={acquisitionIncluded}
          documents={pendingDocuments}
          photos={pendingPhotos}
          showAcquisition={showAcquisition}
          onEditVehicle={() => setStepId("vehicle")}
          onEditAcquisition={() => setStepId("acquisition")}
          onEditPhotos={() => setStepId("photos")}
        />
      ) : null}
    </StepLayout>
  );
}

function EditVehicle({ vehicleId }: { vehicleId: string }) {
  const t = useTranslations();
  const router = useRouter();
  const { can } = usePermission();
  const query = useVehicle(vehicleId);
  const { update } = useVehicleMutations(vehicleId);
  const errors = useSubmitErrors();
  const vehicleRef = useRef<VehicleFormHandle | null>(null);
  const acquisitionRef = useRef<AcquisitionFormHandle | null>(null);
  const [stepId, setStepId] = useState<EditStepId>("vehicle");
  const [acquisitionDirty, setAcquisitionDirty] = useState(false);
  const [savingAcquisition, setSavingAcquisition] = useState(false);
  const [localAcquisitionId, setLocalAcquisitionId] = useState<string | null>(null);
  const [pendingDocuments, setPendingDocuments] = useState<PendingAcquisitionDocument[]>([]);
  const [pricingSlot, setPricingSlot] = useState<HTMLDivElement | null>(null);
  const [vehicleTotals, setVehicleTotals] = useState<VehicleTotalsValues | null>(null);
  const [purchase, setPurchase] = useState<PurchaseValues | null>(null);
  useRevokePendingDocuments(pendingDocuments);
  const pricingOnAcquisition = Boolean(pricingSlot);

  const linkedAcquisitionId = query.data?.acquisition?.id ?? null;
  const resolvedAcquisitionId = localAcquisitionId ?? linkedAcquisitionId;
  const acquisitionQuery = useAcquisition(resolvedAcquisitionId ?? "");
  const { create: createAcquisition, update: updateAcquisition } = useAcquisitionMutations(
    resolvedAcquisitionId ?? undefined,
  );

  const canManageAcquisition = can("acquisition.create") || can("acquisition.edit");
  const showAcquisition = canManageAcquisition || Boolean(linkedAcquisitionId);

  const steps = useMemo(() => {
    const items: FormStepperStep[] = [
      {
        id: "vehicle",
        label: t("inventory.stepper.steps.vehicle"),
        description: t("inventory.stepper.hints.vehicle"),
      },
    ];
    if (showAcquisition) {
      items.push({
        id: "acquisition",
        label: t("inventory.stepper.steps.acquisition"),
        description: t("inventory.stepper.hints.acquisition"),
        optional: !linkedAcquisitionId && !pricingOnAcquisition,
      });
    }
    items.push({
      id: "photos",
      label: t("inventory.stepper.steps.photos"),
      description: t("inventory.stepper.hints.photos"),
      optional: true,
    });
    return items;
  }, [linkedAcquisitionId, showAcquisition, pricingOnAcquisition, t]);

  const stepIndex = steps.findIndex((step) => step.id === stepId);
  const isFirst = stepIndex <= 0;
  const isLast = stepIndex >= steps.length - 1;

  useEffect(scrollToTop, [stepId]);

  async function saveAll() {
    errors.reset();
    const values = await vehicleRef.current?.validate();
    if (!values) {
      const onPricing = pricingOnAcquisition && vehicleRef.current?.errorScope() === "pricing";
      setStepId(onPricing ? "acquisition" : "vehicle");
      toast.error(t(onPricing ? "inventory.stepper.fixPricing" : "inventory.stepper.fillVehicle"));
      return;
    }

    const wantsAcquisition =
      canManageAcquisition && (acquisitionDirty || pendingDocuments.length > 0);

    let acquisitionValues: AcquisitionFormValues | null = null;
    if (wantsAcquisition) {
      acquisitionValues = (await acquisitionRef.current?.validate()) ?? null;
      if (!acquisitionValues) {
        if (showAcquisition) setStepId("acquisition");
        toast.error(t("inventory.acquisition.purchasePriceRequired"));
        return;
      }
    }

    try {
      await update.mutateAsync(values);

      if (wantsAcquisition && acquisitionValues) {
        setSavingAcquisition(true);
        try {
          if (resolvedAcquisitionId && can("acquisition.edit")) {
            await updateAcquisition.mutateAsync(acquisitionValues);
          } else if (can("acquisition.create")) {
            const created = await createAcquisition.mutateAsync(
              withVehicleLink(acquisitionValues, vehicleId, values),
            );
            setLocalAcquisitionId(created.id);

            if (pendingDocuments.length > 0) {
              const failed = await uploadPendingAcquisitionDocuments(
                created.id,
                vehicleId,
                pendingDocuments,
                async (body) => {
                  const result = await addAcquisitionDocumentRequest(created.id, body);
                  if (result.status === "error") throw new Error(result.message);
                  return result.data;
                },
              );
              if (failed.length > 0) {
                setPendingDocuments(failed);
                toast.error(t("acquisitions.documents.toasts.partialUpload"));
                return;
              }
              setPendingDocuments([]);
            }
          }
        } finally {
          setSavingAcquisition(false);
        }
      }

      toast.success(t("inventory.toasts.updated"));
      router.push(`/inventory/${vehicleId}`);
    } catch (error) {
      errors.handle(error);
    }
  }

  async function goNext() {
    if (stepId === "vehicle") {
      const valid = pricingOnAcquisition
        ? await vehicleRef.current?.validateScope("vehicle")
        : Boolean(await vehicleRef.current?.validate());
      if (!valid) {
        toast.error(t("inventory.stepper.fillVehicle"));
        return;
      }
      setStepId(showAcquisition ? "acquisition" : "photos");
      return;
    }
    if (stepId === "acquisition") {
      if (pricingOnAcquisition && !(await vehicleRef.current?.validateScope("pricing"))) {
        toast.error(t("inventory.stepper.fixPricing"));
        return;
      }
      if (acquisitionDirty || pendingDocuments.length > 0) {
        const values = await acquisitionRef.current?.validate();
        if (!values) {
          toast.error(t("inventory.acquisition.purchasePriceRequired"));
          return;
        }
      }
      setStepId("photos");
    }
  }

  function goBack() {
    if (isFirst) {
      router.push(`/inventory/${vehicleId}`);
      return;
    }
    if (stepId === "photos") {
      setStepId(showAcquisition ? "acquisition" : "vehicle");
      return;
    }
    if (stepId === "acquisition") setStepId("vehicle");
  }

  if (query.isPending || (linkedAcquisitionId && acquisitionQuery.isPending)) {
    return <VehicleFormSkeleton />;
  }

  if (query.isError) {
    return (
      <EmptyState
        title={t("inventory.empty.notFound")}
        description={t("inventory.empty.notFoundHint")}
        action={
          <div className="flex flex-wrap justify-center gap-2">
            <Button variant="outline" onClick={() => void query.refetch()}>
              {t("common.retry")}
            </Button>
            <Link href="/inventory" className={cn(buttonVariants())}>
              {t("inventory.actions.back")}
            </Link>
          </div>
        }
      />
    );
  }

  const busy = update.isPending || savingAcquisition;
  const acquisitionMode = resolvedAcquisitionId && acquisitionQuery.data ? "edit" : "create";

  return (
    <StepLayout
      header={
        <FormStepBar
          title={t("inventory.editTitle")}
          subtitle={query.data.stockNumber}
          closeHref={`/inventory/${vehicleId}`}
          closeLabel={t("common.cancel")}
          steps={steps}
          currentId={stepId}
          onStepSelect={(id) => setStepId(id as EditStepId)}
        />
      }
      actions={
        <>
          <Button
            type="button"
            variant="outline"
            className={actionClass}
            onClick={goBack}
            disabled={busy}
          >
            <ChevronLeftIcon aria-hidden className="rtl:rotate-180" />
            {t("inventory.stepper.back")}
          </Button>
          {isLast ? (
            <LoadingButton
              type="button"
              className={cn(actionClass, "flex-1 sm:min-w-32 sm:flex-none")}
              loading={busy}
              onClick={() => void saveAll()}
            >
              {savingAcquisition
                ? t("inventory.acquisition.savingAcquisition")
                : t("inventory.actions.updateSubmit")}
              <CheckIcon aria-hidden />
            </LoadingButton>
          ) : (
            <Button
              type="button"
              className={cn(actionClass, "flex-1 sm:min-w-32 sm:flex-none")}
              onClick={() => void goNext()}
              disabled={busy}
            >
              {t("inventory.stepper.continue")}
              <ChevronRightIcon aria-hidden className="rtl:rotate-180" />
            </Button>
          )}
        </>
      }
    >
      {errors.formError ? (
        <div className="border-destructive/40 bg-destructive/5 rounded-xl border px-4 py-3 text-sm">
          {errors.formError}
        </div>
      ) : null}

      <div className={cn(stepId === "vehicle" ? "block" : "hidden")}>
        <VehicleForm
          ref={vehicleRef}
          mode="edit"
          vehicle={query.data}
          submitting={busy}
          fieldErrors={errors.fieldErrors}
          formError={null}
          cancelHref={`/inventory/${vehicleId}`}
          hideActions
          onSubmit={async () => undefined}
          allowSubmitWhenClean
          pricingContainer={pricingSlot}
          onTotalsChange={setVehicleTotals}
        />
      </div>

      {showAcquisition ? (
        <div className={cn(stepId === "acquisition" ? "grid gap-6" : "hidden")}>
          {query.data.acquisitionSharedFrom ? (
            <Alert>
              <AlertDescription>
                {t("inventory.acquisition.sharedEdit", {
                  stock: query.data.acquisitionSharedFrom.stockNumber,
                })}
              </AlertDescription>
            </Alert>
          ) : null}
          {acquisitionMode === "edit" && acquisitionQuery.data ? (
            <AcquisitionForm
              key={acquisitionQuery.data.id}
              ref={acquisitionRef}
              embedded
              mode="edit"
              acquisition={acquisitionQuery.data}
              afterPurchase={
                <AfterPurchase
                  showPricing={can("vehicle.price.edit")}
                  onPricingSlot={setPricingSlot}
                  vehicle={vehicleTotals}
                  purchase={purchase}
                />
              }
              onPurchaseChange={setPurchase}
              unitCount={vehicleTotals?.quantity ?? 1}
              branchId={query.data.branchId}
              submitting={busy}
              fieldErrors={errors.fieldErrors}
              formError={null}
              onDirtyChange={setAcquisitionDirty}
              extraSections={
                can("document.view") || can("document.create") ? (
                  <AcquisitionDocumentsManager
                    mode="manage"
                    acquisitionId={acquisitionQuery.data.id}
                    vehicleId={vehicleId}
                    readOnly={busy || !can("document.create")}
                  />
                ) : null
              }
            />
          ) : can("acquisition.create") ? (
            <AcquisitionForm
              ref={acquisitionRef}
              embedded
              mode="create"
              branchId={query.data.branchId}
              afterPurchase={
                <AfterPurchase
                  showPricing={can("vehicle.price.edit")}
                  onPricingSlot={setPricingSlot}
                  vehicle={vehicleTotals}
                  purchase={purchase}
                />
              }
              onPurchaseChange={setPurchase}
              unitCount={vehicleTotals?.quantity ?? 1}
              submitting={busy}
              fieldErrors={errors.fieldErrors}
              formError={null}
              onDirtyChange={setAcquisitionDirty}
              extraSections={
                can("document.create") ? (
                  <AcquisitionDocumentsManager
                    mode="draft"
                    documents={pendingDocuments}
                    onChange={setPendingDocuments}
                    disabled={busy}
                  />
                ) : null
              }
            />
          ) : null}
        </div>
      ) : null}

      <div className={cn(stepId === "photos" ? "block" : "hidden")}>
        <VehicleImageManager mode="manage" vehicleId={vehicleId} />
      </div>
    </StepLayout>
  );
}

export function VehicleFormPage({
  mode,
  vehicleId,
}: {
  mode: "create" | "edit";
  vehicleId?: string;
}) {
  if (mode === "create") return <CreateVehicle />;
  return <EditVehicle key={vehicleId} vehicleId={vehicleId!} />;
}
