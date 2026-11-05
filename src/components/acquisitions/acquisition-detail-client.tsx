"use client";

import {
  CheckIcon,
  PackageCheckIcon,
  PencilIcon,
  RefreshCwIcon,
  XIcon,
} from "lucide-react";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { toast } from "sonner";

import { AcquisitionApprovalDialog } from "@/components/acquisitions/acquisition-approval-dialog";
import { AcquisitionDocumentsManager } from "@/components/acquisitions/acquisition-documents-manager";
import { AcquisitionExpenseTable } from "@/components/acquisitions/acquisition-expense-table";
import { AcquisitionStatusBadge } from "@/components/acquisitions/acquisition-status-badge";
import { AcquisitionStatusDialog } from "@/components/acquisitions/acquisition-status-dialog";
import { AcquisitionTimeline } from "@/components/acquisitions/acquisition-timeline";
import { AcquisitionVehicleSummary } from "@/components/acquisitions/acquisition-vehicle-summary";
import { PermissionGate } from "@/components/auth/permission-gate";
import { EmptyState } from "@/components/feedback/empty-state";
import { useAppLocale } from "@/components/inventory/inventory-utils";
import { PageHeader } from "@/components/layout/page-header";
import { Button, buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  useAcquisition,
  useAcquisitionMutations,
} from "@/hooks/use-acquisitions";
import { usePermission } from "@/hooks/use-permission";
import {
  canEditAcquisitionFields,
  getAllowedNextStatuses,
} from "@/lib/acquisitions/status-transitions";
import { Link } from "@/lib/i18n/navigation";
import { cn } from "@/lib/utils";
import { formatCurrency } from "@/lib/utils/currency";
import { formatDate } from "@/lib/utils/date";
import type { AcquisitionDetail } from "@/types/acquisition";

function DetailItem({ label, value }: { label: string; value: React.ReactNode }) {
  const t = useTranslations();
  const empty = value === null || value === undefined || value === "";
  return (
    <div className="grid gap-0.5">
      <dt className="text-muted-foreground text-xs">{label}</dt>
      <dd className={cn("text-sm break-words", empty && "text-muted-foreground")}>
        {empty ? t("acquisitions.fields.notSet") : value}
      </dd>
    </div>
  );
}

function DetailCard({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>{title}</CardTitle>
      </CardHeader>
      <CardContent>
        <dl className="grid gap-4 sm:grid-cols-2">{children}</dl>
      </CardContent>
    </Card>
  );
}

function Overview({ acquisition }: { acquisition: AcquisitionDetail }) {
  const t = useTranslations();
  const locale = useAppLocale();
  const { can } = usePermission();
  const showCost = can("acquisition.cost.view") || can("vehicle.cost.view");
  const date = (value: string | null) => (value ? formatDate(value, locale, "medium") : null);
  const dateTime = (value: string | null) => (value ? formatDate(value, locale, "dateTime") : null);
  const money = (value: number | null | undefined) =>
    value == null ? null : formatCurrency(value, locale, acquisition.currency);

  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <DetailCard title={t("acquisitions.detail.overview")}>
        <DetailItem
          label={t("acquisitions.fields.number")}
          value={acquisition.acquisitionNumber}
        />
        <DetailItem
          label={t("acquisitions.fields.status")}
          value={<AcquisitionStatusBadge status={acquisition.status} />}
        />
        <DetailItem label={t("acquisitions.fields.branch")} value={acquisition.branchName} />
        <DetailItem
          label={t("acquisitions.fields.sourceType")}
          value={t(`acquisitions.sourceTypes.${acquisition.sourceType}`)}
        />
        <DetailItem label={t("acquisitions.fields.sourceName")} value={acquisition.sourceName} />
        <DetailItem
          label={t("acquisitions.fields.sourceCompany")}
          value={acquisition.sourceCompany}
        />
        <DetailItem label={t("acquisitions.fields.sourcePhone")} value={acquisition.sourcePhone} />
        <DetailItem label={t("acquisitions.fields.sourceEmail")} value={acquisition.sourceEmail} />
        <DetailItem
          label={t("acquisitions.fields.sourceReference")}
          value={acquisition.sourceReference}
        />
        <DetailItem label={t("acquisitions.fields.lotNumber")} value={acquisition.lotNumber} />
      </DetailCard>

      <DetailCard title={t("acquisitions.detail.purchase")}>
        <DetailItem
          label={t("acquisitions.fields.purchaseDate")}
          value={date(acquisition.purchaseDate)}
        />
        <DetailItem
          label={t("acquisitions.fields.expectedArrivalDate")}
          value={date(acquisition.expectedArrivalDate)}
        />
        <DetailItem
          label={t("acquisitions.fields.receivedDate")}
          value={date(acquisition.receivedDate)}
        />
        <DetailItem
          label={t("acquisitions.fields.documentStatus")}
          value={t(`acquisitions.enums.documentStatus.${acquisition.documentStatus}`)}
        />
        <DetailItem
          label={t("acquisitions.fields.registrationStatus")}
          value={t(`acquisitions.enums.registrationStatus.${acquisition.registrationStatus}`)}
        />
      </DetailCard>

      {showCost ? (
        <DetailCard title={t("acquisitions.detail.financial")}>
          <DetailItem
            label={t("acquisitions.fields.askingPrice")}
            value={money(acquisition.askingPrice)}
          />
          <DetailItem
            label={t("acquisitions.fields.purchasePrice")}
            value={money(acquisition.purchasePrice)}
          />
          <DetailItem
            label={t("acquisitions.fields.expenseTotal")}
            value={money(acquisition.expenseTotal)}
          />
          <DetailItem
            label={t("acquisitions.fields.totalAcquisitionCost")}
            value={money(acquisition.totalAcquisitionCost)}
          />
          <DetailItem label={t("acquisitions.fields.currency")} value={acquisition.currency} />
        </DetailCard>
      ) : null}

      <DetailCard title={t("acquisitions.sections.notes")}>
        <div className="sm:col-span-2">
          <DetailItem
            label={t("acquisitions.fields.notes")}
            value={
              acquisition.notes ? (
                <span className="whitespace-pre-wrap">{acquisition.notes}</span>
              ) : null
            }
          />
        </div>
      </DetailCard>

      <DetailCard title={t("acquisitions.detail.approval")}>
        <DetailItem
          label={t("acquisitions.fields.approvedBy")}
          value={acquisition.approvedByName}
        />
        <DetailItem
          label={t("acquisitions.fields.approvedAt")}
          value={dateTime(acquisition.approvedAt)}
        />
        <DetailItem
          label={t("acquisitions.fields.approvalNote")}
          value={acquisition.approvalNote}
        />
        <DetailItem
          label={t("acquisitions.fields.rejectedBy")}
          value={acquisition.rejectedByName}
        />
        <DetailItem
          label={t("acquisitions.fields.rejectedAt")}
          value={dateTime(acquisition.rejectedAt)}
        />
        <DetailItem
          label={t("acquisitions.fields.rejectionReason")}
          value={acquisition.rejectionReason}
        />
        <DetailItem
          label={t("acquisitions.fields.cancelReason")}
          value={acquisition.cancelReason}
        />
      </DetailCard>

      <DetailCard title={t("acquisitions.detail.audit")}>
        <DetailItem
          label={t("acquisitions.fields.createdAt")}
          value={dateTime(acquisition.createdAt)}
        />
        <DetailItem
          label={t("acquisitions.fields.createdBy")}
          value={acquisition.createdByName}
        />
        <DetailItem
          label={t("acquisitions.fields.updatedAt")}
          value={dateTime(acquisition.updatedAt)}
        />
        <DetailItem
          label={t("acquisitions.fields.updatedBy")}
          value={acquisition.updatedByName}
        />
      </DetailCard>
    </div>
  );
}

export function AcquisitionDetailClient({ acquisitionId }: { acquisitionId: string }) {
  const t = useTranslations();
  const query = useAcquisition(acquisitionId);
  const { receive, cancel } = useAcquisitionMutations(acquisitionId);
  const { can } = usePermission();
  const [statusOpen, setStatusOpen] = useState(false);
  const [approvalMode, setApprovalMode] = useState<"approve" | "reject" | null>(null);

  if (query.isPending) {
    return (
      <div className="flex flex-col gap-6" aria-busy>
        <Skeleton className="h-16 w-full rounded-xl" />
        <Skeleton className="h-10 w-full rounded-xl" />
        <Skeleton className="h-72 w-full rounded-xl" />
      </div>
    );
  }

  if (query.isError) {
    return (
      <EmptyState
        title={t("acquisitions.empty.notFound")}
        description={t("acquisitions.empty.notFoundHint")}
        action={
          <div className="flex flex-wrap justify-center gap-2">
            <Button variant="outline" onClick={() => void query.refetch()}>
              <RefreshCwIcon aria-hidden />
              {t("common.retry")}
            </Button>
            <Link href="/acquisitions" className={buttonVariants()}>
              {t("acquisitions.actions.back")}
            </Link>
          </div>
        }
      />
    );
  }

  const acquisition = query.data;
  const title =
    [acquisition.vehicleYear, acquisition.vehicleMake, acquisition.vehicleModel]
      .filter(Boolean)
      .join(" ") || acquisition.acquisitionNumber;

  const statusOptions = getAllowedNextStatuses(acquisition.status).filter(
    (status) => status !== "approved" && status !== "rejected",
  );
  const canChangeStatus = statusOptions.length > 0 && can("acquisition.edit");
  const canApprove =
    can("acquisition.approve") && acquisition.status === "pending_approval";
  const canReceive =
    can("acquisition.edit") &&
    (acquisition.status === "purchased" || acquisition.status === "documents_pending");
  const canCancel =
    can("acquisition.cancel") &&
    getAllowedNextStatuses(acquisition.status).includes("cancelled");
  const canEdit =
    can("acquisition.edit") && canEditAcquisitionFields(acquisition.status);
  const actionClass = "h-10 md:h-8";

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title={title}
        description={[acquisition.acquisitionNumber, acquisition.vehicleStockNumber]
          .filter(Boolean)
          .join(" · ")}
        actions={
          <>
            <AcquisitionStatusBadge status={acquisition.status} />
            {canEdit ? (
              <PermissionGate permission="acquisition.edit">
                <Link
                  href={`/acquisitions/${acquisition.id}/edit`}
                  className={cn(buttonVariants({ variant: "outline" }), actionClass)}
                >
                  <PencilIcon aria-hidden />
                  {t("acquisitions.actions.edit")}
                </Link>
              </PermissionGate>
            ) : null}
            {canChangeStatus ? (
              <Button
                variant="outline"
                className={actionClass}
                onClick={() => setStatusOpen(true)}
              >
                <RefreshCwIcon aria-hidden />
                {t("acquisitions.actions.changeStatus")}
              </Button>
            ) : null}
            {canApprove ? (
              <>
                <Button
                  className={actionClass}
                  onClick={() => setApprovalMode("approve")}
                >
                  <CheckIcon aria-hidden />
                  {t("acquisitions.actions.approve")}
                </Button>
                <Button
                  variant="destructive"
                  className={actionClass}
                  onClick={() => setApprovalMode("reject")}
                >
                  <XIcon aria-hidden />
                  {t("acquisitions.actions.reject")}
                </Button>
              </>
            ) : null}
            {canReceive ? (
              <Button
                variant="outline"
                className={actionClass}
                disabled={receive.isPending}
                onClick={async () => {
                  try {
                    await receive.mutateAsync({ reason: null });
                    toast.success(t("acquisitions.toasts.received"));
                  } catch (error) {
                    toast.error(
                      error instanceof Error ? error.message : t("acquisitions.toasts.error"),
                    );
                  }
                }}
              >
                <PackageCheckIcon aria-hidden />
                {t("acquisitions.actions.receive")}
              </Button>
            ) : null}
            {canCancel ? (
              <Button
                variant="destructive"
                className={actionClass}
                disabled={cancel.isPending}
                onClick={async () => {
                  const reason = window.prompt(t("acquisitions.dialogs.cancel.reasonPrompt"));
                  if (!reason?.trim()) return;
                  try {
                    await cancel.mutateAsync({ reason: reason.trim() });
                    toast.success(t("acquisitions.toasts.cancelled"));
                  } catch (error) {
                    toast.error(
                      error instanceof Error ? error.message : t("acquisitions.toasts.error"),
                    );
                  }
                }}
              >
                {t("acquisitions.actions.cancelAcquisition")}
              </Button>
            ) : null}
          </>
        }
      />

      <Tabs defaultValue="overview">
        <div className="-mx-4 overflow-x-auto px-4 pb-1 md:mx-0 md:px-0">
          <TabsList variant="line" className="h-10 w-max min-w-full justify-start">
            <TabsTrigger value="overview">{t("acquisitions.tabs.overview")}</TabsTrigger>
            <TabsTrigger value="vehicle">{t("acquisitions.tabs.vehicle")}</TabsTrigger>
            <TabsTrigger value="documents">{t("acquisitions.tabs.documents")}</TabsTrigger>
            <TabsTrigger value="expenses">{t("acquisitions.tabs.expenses")}</TabsTrigger>
            <TabsTrigger value="timeline">{t("acquisitions.tabs.timeline")}</TabsTrigger>
          </TabsList>
        </div>

        <TabsContent value="overview" className="pt-2">
          <Overview acquisition={acquisition} />
        </TabsContent>

        <TabsContent value="vehicle" className="pt-2">
          <AcquisitionVehicleSummary acquisition={acquisition} />
        </TabsContent>

        <TabsContent value="documents" className="pt-2">
          <AcquisitionDocumentsManager
            mode="manage"
            acquisitionId={acquisition.id}
            vehicleId={acquisition.vehicleId}
          />
        </TabsContent>

        <TabsContent value="expenses" className="pt-2">
          <AcquisitionExpenseTable
            acquisitionId={acquisition.id}
            expenses={acquisition.expenses ?? []}
          />
        </TabsContent>

        <TabsContent value="timeline" className="pt-2">
          <AcquisitionTimeline acquisitionId={acquisition.id} />
        </TabsContent>
      </Tabs>

      <AcquisitionStatusDialog
        acquisition={acquisition}
        open={statusOpen}
        onOpenChange={setStatusOpen}
      />
      {approvalMode ? (
        <AcquisitionApprovalDialog
          acquisitionId={acquisition.id}
          mode={approvalMode}
          open={Boolean(approvalMode)}
          onOpenChange={(open) => {
            if (!open) setApprovalMode(null);
          }}
        />
      ) : null}
    </div>
  );
}
