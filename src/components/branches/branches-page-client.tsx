"use client";

import { useCallback, useMemo, useState } from "react";
import { useTranslations } from "next-intl";
import {
  ArrowRightIcon,
  BadgeCheckIcon,
  Building2Icon,
  CarFrontIcon,
  MailIcon,
  MapPinIcon,
  PhoneIcon,
  SearchIcon,
  UsersIcon,
  XIcon,
} from "lucide-react";

import { BranchFormDialog } from "@/components/branches/branch-form-dialog";
import { KpiCard } from "@/components/cards/kpi-card";
import { EmptyState } from "@/components/feedback/empty-state";
import { useAppLocale } from "@/components/inventory/inventory-utils";
import { PageHeader } from "@/components/layout/page-header";
import {
  InputGroup,
  InputGroupAddon,
  InputGroupButton,
  InputGroupInput,
} from "@/components/ui/input-group";
import type { BranchListItem } from "@/lib/branches/service";
import { Link } from "@/lib/i18n/navigation";
import { cn } from "@/lib/utils";
import { formatNumber } from "@/lib/utils/currency";

type Props = {
  initialBranches: BranchListItem[];
  /** Super Admins can add and edit branches. */
  canManage: boolean;
};

type Filter = "all" | "active" | "inactive";

/** Search and the Active / Inactive tabs only help once there are a few branches. */
const SEARCH_FROM = 4;

export function BranchesPageClient({ initialBranches, canManage }: Props) {
  const t = useTranslations("modules.branches");
  const locale = useAppLocale();
  const [branches, setBranches] = useState(initialBranches);
  const [filter, setFilter] = useState<Filter>("all");
  const [query, setQuery] = useState("");

  const refresh = useCallback(async () => {
    const res = await fetch("/api/branches", { credentials: "same-origin" });
    if (res.ok) setBranches(await res.json());
  }, []);

  const totals = useMemo(
    () =>
      branches.reduce(
        (sum, b) => ({
          active: sum.active + (b.isActive ? 1 : 0),
          inStock: sum.inStock + b.stats.inStock,
          ready: sum.ready + b.stats.ready,
          team: sum.team + b.stats.team,
        }),
        { active: 0, inStock: 0, ready: 0, team: 0 },
      ),
    [branches],
  );

  const visible = useMemo(() => {
    const term = query.trim().toLowerCase();
    return branches.filter((b) => {
      if (filter === "active" && !b.isActive) return false;
      if (filter === "inactive" && b.isActive) return false;
      if (!term) return true;
      return [
        b.name,
        b.code,
        b.city,
        b.addressLine1,
        t(`emirates.${b.emirate}` as Parameters<typeof t>[0]),
      ]
        .join(" ")
        .toLowerCase()
        .includes(term);
    });
  }, [branches, filter, query, t]);

  const number = (value: number) => formatNumber(value, locale);
  const counts: Record<Filter, number> = {
    all: branches.length,
    active: totals.active,
    inactive: branches.length - totals.active,
  };

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title={t("title")}
        description={t("description")}
        actions={canManage ? <BranchFormDialog onSuccess={refresh} /> : null}
      />

      {branches.length === 0 ? (
        <EmptyState icon={Building2Icon} title={t("empty")} description={t("emptyHint")} />
      ) : (
        <>
          <section className="stagger grid grid-cols-2 gap-3 [--stagger:70ms] lg:grid-cols-4 lg:gap-4">
            <KpiCard
              label={t("summary.branches")}
              value={number(branches.length)}
              hint={t("summary.branchesHint", { count: number(totals.active) })}
              icon={Building2Icon}
              tone="brand"
            />
            <KpiCard
              label={t("summary.inStock")}
              value={number(totals.inStock)}
              hint={t("summary.inStockHint")}
              icon={CarFrontIcon}
              tone="info"
            />
            <KpiCard
              label={t("summary.ready")}
              value={number(totals.ready)}
              icon={BadgeCheckIcon}
              tone="success"
            />
            <KpiCard
              label={t("summary.team")}
              value={number(totals.team)}
              icon={UsersIcon}
              tone="neutral"
            />
          </section>

          {branches.length >= SEARCH_FROM ? (
            <div className="animate-rise flex flex-col gap-3 [animation-delay:160ms] md:flex-row md:items-center md:justify-between">
              <div
                className="bg-muted flex w-full touch-pan-x touch-pan-y overflow-x-auto overflow-y-hidden overscroll-x-contain rounded-lg p-0.5 text-sm md:w-fit"
                role="tablist"
              >
                {(["all", "active", "inactive"] as const).map((key) => (
                  <button
                    key={key}
                    type="button"
                    role="tab"
                    aria-selected={filter === key}
                    onClick={() => setFilter(key)}
                    className={cn(
                      "flex-1 rounded-md px-3 py-1.5 whitespace-nowrap transition-all duration-200 md:flex-none",
                      filter === key
                        ? "bg-background font-medium shadow-xs"
                        : "text-muted-foreground hover:text-foreground",
                    )}
                  >
                    {t(`filters.${key}`)}{" "}
                    <span className="text-muted-foreground tabular-nums">
                      ({number(counts[key])})
                    </span>
                  </button>
                ))}
              </div>
              <InputGroup className="bg-card h-10 md:h-9 md:max-w-xs">
                <InputGroupAddon>
                  <SearchIcon />
                </InputGroupAddon>
                <InputGroupInput
                  type="search"
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                  placeholder={t("searchPlaceholder")}
                  aria-label={t("searchPlaceholder")}
                />
                {query ? (
                  <InputGroupAddon align="inline-end">
                    <InputGroupButton
                      size="icon-xs"
                      onClick={() => setQuery("")}
                      aria-label={t("searchPlaceholder")}
                    >
                      <XIcon />
                    </InputGroupButton>
                  </InputGroupAddon>
                ) : null}
              </InputGroup>
            </div>
          ) : null}

          {visible.length === 0 ? (
            <EmptyState icon={SearchIcon} title={t("noMatches")} />
          ) : (
            <div className="stagger grid gap-4 [--stagger:60ms] sm:grid-cols-2 xl:grid-cols-3">
              {visible.map((branch) => (
                <BranchCard
                  key={branch.id}
                  branch={branch}
                  onEdited={canManage ? refresh : undefined}
                />
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}

function BranchCard({ branch: b, onEdited }: { branch: BranchListItem; onEdited?: () => void }) {
  const t = useTranslations("modules.branches");
  const locale = useAppLocale();
  const emirate = t(`emirates.${b.emirate}` as Parameters<typeof t>[0]);
  const { inStock, inTransit, ready, booked, team } = b.stats;
  const other = Math.max(inStock - inTransit - ready - booked, 0);
  const share = (value: number) => (inStock > 0 ? `${(value / inStock) * 100}%` : "0%");

  return (
    <article
      className={cn(
        "group/branch bg-card ring-foreground/[0.07] flex flex-col overflow-hidden rounded-xl shadow-xs ring-1",
        "hover:ring-brand/30 transition-[box-shadow,transform] duration-300 hover:-translate-y-1 hover:shadow-lg",
        !b.isActive && "opacity-75",
      )}
    >
      {/* Carbon header with the branch monogram, like a showroom sign. */}
      <div className="bg-carbon relative overflow-hidden px-5 pt-5 pb-4">
        <span
          className="bg-brand/25 pointer-events-none absolute -end-10 -top-12 size-36 rounded-full opacity-70 blur-3xl transition-opacity duration-500 group-hover/branch:opacity-100"
          aria-hidden
        />
        <div className="relative flex items-start gap-3">
          <span className="bg-gold text-brand-foreground font-heading flex size-11 shrink-0 items-center justify-center rounded-lg text-sm font-bold tracking-wide shadow-md">
            {b.code.slice(0, 3).toUpperCase()}
          </span>
          <div className="min-w-0 flex-1">
            <h2 className="text-sidebar-foreground font-heading truncate text-base font-semibold tracking-tight">
              {b.name}
            </h2>
            <p className="text-sidebar-foreground/60 mt-0.5 flex items-center gap-1 truncate text-xs">
              <MapPinIcon className="size-3.5 shrink-0" aria-hidden />
              {b.city} · {emirate}
            </p>
          </div>
          <span
            className={cn(
              "inline-flex shrink-0 items-center gap-1.5 rounded-full px-2 py-0.5 text-[11px] font-semibold ring-1 backdrop-blur",
              b.isActive
                ? "text-brand ring-brand/40 bg-white/5"
                : "text-sidebar-foreground/60 bg-white/5 ring-white/15",
            )}
          >
            <span className="relative flex size-1.5" aria-hidden>
              {b.isActive ? (
                <span className="animate-ping-soft bg-brand absolute inset-0 rounded-full motion-reduce:hidden" />
              ) : null}
              <span
                className={cn(
                  "relative size-1.5 rounded-full",
                  b.isActive ? "bg-brand" : "bg-white/40",
                )}
              />
            </span>
            {b.isActive ? t("active") : t("inactive")}
          </span>
        </div>
        <p className="text-sidebar-foreground/40 relative mt-3 font-mono text-[11px] tracking-[0.2em] uppercase">
          {b.code}
        </p>
      </div>

      {/* Stock at a glance. */}
      <div className="grid grid-cols-3 divide-x border-b rtl:divide-x-reverse">
        {[
          { label: t("stats.inStock"), value: inStock },
          { label: t("stats.ready"), value: ready },
          { label: t("stats.booked"), value: booked },
        ].map((stat) => (
          <div key={stat.label} className="grid gap-0.5 px-3 py-3 text-center">
            <span className="font-heading text-xl font-semibold tabular-nums">
              {formatNumber(stat.value, locale)}
            </span>
            <span className="text-muted-foreground text-xs">{stat.label}</span>
          </div>
        ))}
      </div>

      <div className="flex flex-1 flex-col gap-4 p-5">
        {inStock > 0 ? (
          <div className="grid gap-1.5">
            <div className="bg-muted flex h-1.5 overflow-hidden rounded-full" aria-hidden>
              <span className="bg-chrome" style={{ width: share(inTransit) }} />
              <span className="bg-gold" style={{ width: share(ready) }} />
              <span className="bg-amber-500" style={{ width: share(booked) }} />
              <span className="bg-foreground/20" style={{ width: share(other) }} />
            </div>
            <div className="text-muted-foreground flex flex-wrap gap-x-3 gap-y-1 text-[11px]">
              <Legend
                className="bg-chrome"
                label={`${t("stats.inTransit")} ${formatNumber(inTransit, locale)}`}
              />
              <Legend
                className="bg-gold"
                label={`${t("stats.ready")} ${formatNumber(ready, locale)}`}
              />
              <Legend
                className="bg-amber-500"
                label={`${t("stats.booked")} ${formatNumber(booked, locale)}`}
              />
            </div>
          </div>
        ) : (
          <p className="text-muted-foreground text-xs">{t("stats.noStock")}</p>
        )}

        <dl className="grid gap-2 text-sm">
          <div className="text-muted-foreground flex items-start gap-2">
            <dt className="sr-only">{t("address")}</dt>
            <MapPinIcon className="mt-0.5 size-4 shrink-0" aria-hidden />
            <dd className="min-w-0">{b.addressLine1}</dd>
          </div>
          <div className="text-muted-foreground flex items-center gap-2">
            <dt className="sr-only">{t("summary.team")}</dt>
            <UsersIcon className="size-4 shrink-0" aria-hidden />
            <dd>{t("stats.team", { count: team })}</dd>
          </div>
        </dl>

        <div className="mt-auto flex items-center gap-2 border-t pt-4">
          {b.phone ? (
            <a
              href={`tel:${b.phone}`}
              className="hover:border-brand/40 hover:text-brand flex size-9 items-center justify-center rounded-md border transition-colors"
              aria-label={t("call", { name: b.name })}
              title={b.phone}
            >
              <PhoneIcon className="size-4" aria-hidden />
            </a>
          ) : null}
          {b.email ? (
            <a
              href={`mailto:${b.email}`}
              className="hover:border-brand/40 hover:text-brand flex size-9 items-center justify-center rounded-md border transition-colors"
              aria-label={t("emailTo", { name: b.name })}
              title={b.email}
            >
              <MailIcon className="size-4" aria-hidden />
            </a>
          ) : null}
          {onEdited ? <BranchFormDialog key={editKey(b)} branch={b} onSuccess={onEdited} /> : null}
          <Link
            href={`/inventory?branchId=${b.id}`}
            className="text-brand-strong dark:text-brand ms-auto inline-flex items-center gap-1 text-sm font-medium hover:underline"
          >
            {t("viewInventory")}
            <ArrowRightIcon
              className="size-4 transition-transform group-hover/branch:translate-x-0.5 rtl:rotate-180 rtl:group-hover/branch:-translate-x-0.5"
              aria-hidden
            />
          </Link>
        </div>
      </div>
    </article>
  );
}

/** Remounts the edit dialog after a save so it starts from the refreshed values. */
function editKey(b: BranchListItem) {
  return [
    b.id,
    b.name,
    b.code,
    b.emirate,
    b.city,
    b.addressLine1,
    b.phone,
    b.email,
    b.isActive,
  ].join("|");
}

function Legend({ className, label }: { className: string; label: string }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <span className={cn("size-2 rounded-full", className)} aria-hidden />
      {label}
    </span>
  );
}
