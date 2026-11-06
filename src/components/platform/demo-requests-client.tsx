"use client";

import { useMemo, useState } from "react";
import { useTranslations } from "next-intl";
import { MailIcon, MailWarningIcon, MessageCircleIcon, PhoneIcon, UserCheckIcon } from "lucide-react";

import { FormField } from "@/components/forms/form-field";
import { DataTable } from "@/components/platform/data-table";
import { ActionDialog, PlatformStatus, SimpleSelect, usePlatformAction } from "@/components/platform/platform-ui";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import type { AppLocale } from "@/config/app";
import { Link } from "@/lib/i18n/navigation";
import { demoRequestStatuses, type DemoRequestRow, type DemoRequestStatus } from "@/lib/platform/demo-requests";
import { cn } from "@/lib/utils";
import { formatDate } from "@/lib/utils/date";

type Filter = "all" | "open" | DemoRequestStatus;
const OPEN: DemoRequestStatus[] = ["new", "contacted", "demo_booked"];
const NO_DEALERSHIP = "none";

const whatsapp = (phone: string) => phone.replace(/\D/g, "");

export function DemoRequestsTable({
  requests,
  dealerships,
  canManage,
  locale,
}: {
  requests: DemoRequestRow[];
  dealerships: { id: string; name: string }[];
  canManage: boolean;
  locale: AppLocale;
}) {
  const t = useTranslations("platform");
  const [filter, setFilter] = useState<Filter>("open");

  const counts = useMemo(() => {
    const by = (status: DemoRequestStatus) => requests.filter((r) => r.status === status).length;
    return {
      all: requests.length,
      open: requests.filter((r) => OPEN.includes(r.status)).length,
      ...Object.fromEntries(demoRequestStatuses.map((s) => [s, by(s)])),
    } as Record<Filter, number>;
  }, [requests]);

  const shown = requests.filter((r) =>
    filter === "all" ? true : filter === "open" ? OPEN.includes(r.status) : r.status === filter,
  );
  const filters: Filter[] = ["open", "all", ...demoRequestStatuses];

  return (
    <div className="grid gap-4">
      <div role="tablist" aria-label={t("demoRequests.filter")} className="flex flex-wrap gap-1.5">
        {filters.map((key) => (
          <button
            key={key}
            type="button"
            role="tab"
            aria-selected={filter === key}
            onClick={() => setFilter(key)}
            className={cn(
              "rounded-full border px-3 py-1 text-sm font-medium transition-colors",
              filter === key
                ? "border-foreground bg-foreground text-background"
                : "text-muted-foreground hover:text-foreground border-border",
            )}
          >
            {key === "all" || key === "open" ? t(`demoRequests.${key}`) : t(`status.${key}`)}
            <span className="ms-1.5 tabular-nums opacity-70">{counts[key]}</span>
          </button>
        ))}
      </div>

      <DataTable
        empty={t("demoRequests.none")}
        headers={[
          t("demoRequests.received"),
          t("demoRequests.contact"),
          t("demoRequests.reach"),
          t("demoRequests.account"),
          t("demoRequests.status"),
          "",
        ]}
        rows={shown.map((r) => ({
          key: r.id,
          cells: [
            <div key="w" className="grid gap-1 whitespace-nowrap">
              <span>{formatDate(r.created_at, locale, "medium")}</span>
              {r.email_sent ? null : (
                <span className="text-muted-foreground inline-flex items-center gap-1 text-xs" title={t("demoRequests.notEmailedHint")}>
                  <MailWarningIcon className="size-3.5" />
                  {t("demoRequests.notEmailed")}
                </span>
              )}
            </div>,
            <div key="c" className="grid max-w-72 gap-0.5">
              <span className="font-medium">{r.name}</span>
              {r.dealership ? <span className="text-sm">{r.dealership}</span> : null}
              {r.stock ? (
                <span className="text-muted-foreground text-xs">{t("demoRequests.stock", { stock: r.stock })}</span>
              ) : null}
              {r.notes ? (
                <span className="text-muted-foreground line-clamp-2 text-xs" title={r.notes}>
                  {r.notes}
                </span>
              ) : null}
            </div>,
            <div key="r" className="grid gap-1 text-sm">
              {r.email ? (
                <a href={`mailto:${r.email}`} className="inline-flex items-center gap-1.5 hover:underline" dir="ltr">
                  <MailIcon className="text-muted-foreground size-3.5" />
                  {r.email}
                </a>
              ) : null}
              {r.phone ? (
                <span className="inline-flex items-center gap-2" dir="ltr">
                  <a href={`tel:${r.phone.replace(/[^\d+]/g, "")}`} className="inline-flex items-center gap-1.5 hover:underline">
                    <PhoneIcon className="text-muted-foreground size-3.5" />
                    {r.phone}
                  </a>
                  {whatsapp(r.phone) ? (
                    <a
                      href={`https://wa.me/${whatsapp(r.phone)}`}
                      target="_blank"
                      rel="noreferrer"
                      aria-label="WhatsApp"
                      className="text-muted-foreground hover:text-foreground"
                    >
                      <MessageCircleIcon className="size-3.5" />
                    </a>
                  ) : null}
                </span>
              ) : null}
            </div>,
            r.account_user_id ? (
              <div key="a" className="grid gap-0.5 text-sm">
                <span className="inline-flex items-center gap-1.5 font-medium text-emerald-700 dark:text-emerald-400">
                  <UserCheckIcon className="size-3.5" />
                  {t("demoRequests.hasAccount")}
                </span>
                {r.account_tenant_id ? (
                  <Link href={`/platform/tenants/${r.account_tenant_id}`} className="hover:underline">
                    {r.account_tenant_name}
                  </Link>
                ) : null}
                <span className="text-muted-foreground text-xs">
                  {r.account_last_sign_in_at
                    ? t("demoRequests.lastSignIn", { date: formatDate(r.account_last_sign_in_at, locale, "medium") })
                    : t("demoRequests.neverSignedIn")}
                </span>
              </div>
            ) : (
              <span key="a" className="text-muted-foreground text-sm">
                {t("demoRequests.noAccount")}
              </span>
            ),
            <div key="s" className="grid justify-items-start gap-1">
              <PlatformStatus status={r.status} />
              {r.tenant_id ? (
                <Link href={`/platform/tenants/${r.tenant_id}`} className="text-xs hover:underline">
                  {r.tenant_name}
                </Link>
              ) : null}
              {r.staff_notes ? (
                <span className="text-muted-foreground line-clamp-2 max-w-48 text-xs" title={r.staff_notes}>
                  {r.staff_notes}
                </span>
              ) : null}
            </div>,
            canManage ? <FollowUpAction key="x" request={r} dealerships={dealerships} /> : null,
          ],
        }))}
      />
    </div>
  );
}

function FollowUpAction({
  request,
  dealerships,
}: {
  request: DemoRequestRow;
  dealerships: { id: string; name: string }[];
}) {
  const t = useTranslations("platform");
  const { run, pending, error } = usePlatformAction();
  const [status, setStatus] = useState<DemoRequestStatus>(request.status);
  const [notes, setNotes] = useState(request.staff_notes ?? "");
  // Suggest the dealership their login already belongs to.
  const [tenant, setTenant] = useState(request.tenant_id ?? request.account_tenant_id ?? NO_DEALERSHIP);

  return (
    <ActionDialog
      trigger={
        <Button variant="outline" size="sm">
          {t("demoRequests.followUp")}
        </Button>
      }
      title={request.dealership || request.name}
      description={t("demoRequests.followUpHint")}
      submitLabel={t("common.save")}
      error={error}
      pending={pending}
      onSubmit={() =>
        run(`/api/platform/demo-requests/${request.id}`, "PATCH", {
          status,
          staffNotes: notes,
          // Staff who can't see dealerships leave the link alone.
          ...(dealerships.length ? { dealershipId: tenant === NO_DEALERSHIP ? null : tenant } : {}),
        })
      }
    >
      {request.notes ? (
        <div className="bg-muted/60 rounded-md p-3 text-sm">
          <p className="text-muted-foreground mb-1 text-xs font-medium">{t("demoRequests.theirNotes")}</p>
          <p className="whitespace-pre-wrap">{request.notes}</p>
        </div>
      ) : null}
      <FormField label={t("demoRequests.status")} htmlFor={`dr-status-${request.id}`}>
        <SimpleSelect
          id={`dr-status-${request.id}`}
          value={status}
          onChange={(value) => setStatus(value as DemoRequestStatus)}
          options={demoRequestStatuses.map((value) => ({ value, label: t(`status.${value}`) }))}
        />
      </FormField>
      {dealerships.length ? (
        <FormField label={t("demoRequests.dealership")} htmlFor={`dr-tenant-${request.id}`}>
          <SimpleSelect
            id={`dr-tenant-${request.id}`}
            value={tenant}
            onChange={setTenant}
            options={[
              { value: NO_DEALERSHIP, label: t("demoRequests.noDealership") },
              ...dealerships.map((d) => ({ value: d.id, label: d.name })),
            ]}
          />
        </FormField>
      ) : null}
      <FormField label={t("demoRequests.staffNotes")} htmlFor={`dr-notes-${request.id}`}>
        <Textarea
          id={`dr-notes-${request.id}`}
          value={notes}
          maxLength={4000}
          placeholder={t("demoRequests.staffNotesHint")}
          onChange={(event) => setNotes(event.target.value)}
        />
      </FormField>
    </ActionDialog>
  );
}
