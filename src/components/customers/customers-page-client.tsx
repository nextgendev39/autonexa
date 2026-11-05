"use client";

import type { LucideIcon } from "lucide-react";
import {
  ArrowUpDownIcon,
  Building2Icon,
  CalendarCheckIcon,
  CalendarPlusIcon,
  HistoryIcon,
  MailIcon,
  MessageCircleIcon,
  PencilIcon,
  PhoneIcon,
  PlusIcon,
  SearchIcon,
  UserPlusIcon,
  UserRoundXIcon,
  UsersIcon,
  XIcon,
} from "lucide-react";
import { useEffect, useState } from "react";
import { keepPreviousData, useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslations } from "next-intl";

import { EditCustomerDialog } from "@/components/customers/edit-customer-dialog";
import { EmptyState } from "@/components/feedback/empty-state";
import { TabCount } from "@/components/shared/tab-count";
import { NativeSelect } from "@/components/inventory/native-select";
import { useAppLocale } from "@/components/inventory/inventory-utils";
import { PageHeader } from "@/components/layout/page-header";
import { Button, buttonVariants } from "@/components/ui/button";
import {
  InputGroup,
  InputGroupAddon,
  InputGroupButton,
  InputGroupInput,
} from "@/components/ui/input-group";
import { ListPagination } from "@/components/tables/list-pagination";
import {
  CUSTOMER_PAGE_SIZES,
  CUSTOMER_SORTS,
  DEFAULT_CUSTOMER_PAGE_SIZE,
  monthKey,
  type CustomerFilter,
  type CustomerListPage,
  type CustomerListQuery,
  type CustomerSort,
} from "@/lib/customers/list-query";
import type { CustomerListItem } from "@/lib/customers/service";
import { Link } from "@/lib/i18n/navigation";
import { cn } from "@/lib/utils";
import { formatNumber } from "@/lib/utils/currency";
import { formatDate, formatRelativeTime } from "@/lib/utils/date";
import { formatUaePhone } from "@/lib/utils/phone";

type Filter = CustomerFilter;
type Sort = CustomerSort;

const customerListKey = (query: CustomerListQuery) => ["customers", "list", query] as const;

async function fetchCustomerPage(query: CustomerListQuery): Promise<CustomerListPage> {
  const params = new URLSearchParams({
    filter: query.filter,
    sort: query.sort,
    page: String(query.page),
    pageSize: String(query.pageSize),
  });
  if (query.q) params.set("q", query.q);
  const res = await fetch(`/api/customers?${params}`, { credentials: "same-origin", cache: "no-store" });
  const json = await res.json().catch(() => null);
  if (json?.status !== "success") throw new Error(json?.message ?? "Could not load customers.");
  return json.data;
}

export function CustomersPageClient({
  initialPage,
  initialQuery,
  canCreateBooking,
}: {
  /** The first page, rendered on the server for the query in the URL. */
  initialPage: CustomerListPage;
  initialQuery: CustomerListQuery;
  canCreateBooking: boolean;
}) {
  const t = useTranslations("customers");
  const locale = useAppLocale();
  const [query, setQuery] = useState(initialQuery.q);
  // Search waits for a pause in typing before asking the server.
  const [searchTerm, setSearchTerm] = useState(initialQuery.q);
  const [filter, setFilterState] = useState<Filter>(initialQuery.filter);
  const [sort, setSortState] = useState<Sort>(initialQuery.sort);
  const [page, setPage] = useState(initialPage.page);
  const [pageSize, setPageSize] = useState(initialQuery.pageSize);
  const [editing, setEditing] = useState<CustomerListItem | null>(null);
  const queryClient = useQueryClient();
  useEffect(() => {
    const term = query.trim();
    if (term === searchTerm) return;
    const timer = window.setTimeout(() => {
      setSearchTerm(term);
      setPage(1);
    }, 300);
    return () => window.clearTimeout(timer);
  }, [query, searchTerm]);
  const setFilter = (next: Filter) => {
    setFilterState(next);
    setPage(1);
  };
  const setSort = (next: Sort) => {
    setSortState(next);
    setPage(1);
  };

  const listQuery: CustomerListQuery = { filter, sort, q: searchTerm, page, pageSize };
  const isInitialQuery =
    filter === initialQuery.filter &&
    sort === initialQuery.sort &&
    searchTerm === initialQuery.q &&
    page === initialPage.page &&
    pageSize === initialQuery.pageSize;
  const { data = initialPage, isFetching } = useQuery({
    queryKey: customerListKey(listQuery),
    queryFn: () => fetchCustomerPage(listQuery),
    initialData: isInitialQuery ? initialPage : undefined,
    placeholderData: keepPreviousData,
    staleTime: 15_000,
  });
  const { counts, ownOnly, totalBookings } = data;
  const visible = data.items;
  // The server moves past-the-end requests to the last page; follow it.
  if (data.page !== page && !isFetching) setPage(data.page);

  // Keep the tab, sort, search and page in the address so reloads and links land here.
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const set = (key: string, value: string | null) =>
      value ? params.set(key, value) : params.delete(key);
    set("filter", filter === "all" ? null : filter);
    set("sort", sort === "newest" ? null : sort);
    set("q", searchTerm || null);
    set("page", page > 1 ? String(page) : null);
    set("pageSize", pageSize === DEFAULT_CUSTOMER_PAGE_SIZE ? null : String(pageSize));
    const next = `${window.location.pathname}${params.size ? `?${params}` : ""}`;
    if (next !== `${window.location.pathname}${window.location.search}`) {
      window.history.replaceState(window.history.state, "", next);
    }
  }, [filter, sort, searchTerm, page, pageSize]);

  // Sales executives see only their own customers, so "Unassigned" means nothing to them.
  const filters: Filter[] = ownOnly
    ? ["all", "active", "new", "none"]
    : ["all", "active", "new", "none", "unassigned"];

  const number = (value: number) => formatNumber(value, locale);
  const thisMonth = monthKey(new Date());

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title={t(ownOnly ? "myTitle" : "title")}
        description={t(ownOnly ? "myDescription" : "description")}
        actions={
          canCreateBooking ? (
            <Button variant="brand" nativeButton={false} render={<Link href="/bookings?new=1" />}>
              <PlusIcon />
              {t("newBooking")}
            </Button>
          ) : null
        }
      />

      {counts.all > 0 ? (
        <section className="stagger grid grid-cols-2 gap-3 [--stagger:60ms] lg:grid-cols-4">
          <SummaryTile
            icon={UsersIcon}
            tone="brand"
            label={t("kpis.total")}
            value={number(counts.all)}
            hint={t("kpis.totalHint", { count: totalBookings, formatted: number(totalBookings) })}
            selected={filter === "all"}
            onSelect={() => setFilter("all")}
          />
          <SummaryTile
            icon={CalendarCheckIcon}
            tone="success"
            label={t("kpis.active")}
            value={number(counts.active)}
            hint={t("kpis.activeHint")}
            selected={filter === "active"}
            onSelect={() => setFilter("active")}
          />
          <SummaryTile
            icon={UserPlusIcon}
            tone="info"
            label={t("kpis.new")}
            value={number(counts.new)}
            hint={t("kpis.newHint")}
            selected={filter === "new"}
            onSelect={() => setFilter("new")}
          />
          {ownOnly ? (
            <SummaryTile
              icon={HistoryIcon}
              tone="neutral"
              label={t("kpis.none")}
              value={number(counts.none)}
              hint={t("kpis.noneHint")}
              selected={filter === "none"}
              onSelect={() => setFilter("none")}
            />
          ) : (
            <SummaryTile
              icon={UserRoundXIcon}
              tone={counts.unassigned > 0 ? "warning" : "neutral"}
              label={t("kpis.unassigned")}
              value={number(counts.unassigned)}
              hint={t("kpis.unassignedHint")}
              selected={filter === "unassigned"}
              onSelect={() => setFilter("unassigned")}
            />
          )}
        </section>
      ) : null}

      <div className="animate-rise flex flex-col gap-3 [animation-delay:120ms] lg:flex-row lg:items-center lg:justify-between">
        <div
          className="bg-muted flex w-full touch-pan-x touch-pan-y overflow-x-auto overflow-y-hidden overscroll-x-contain rounded-lg p-0.5 text-sm lg:w-fit"
          role="tablist"
        >
          {filters.map((key) => (
            <button
              key={key}
              type="button"
              role="tab"
              aria-selected={filter === key}
              onClick={() => setFilter(key)}
              className={cn(
                "flex flex-1 items-center justify-center gap-1.5 rounded-md px-3 py-1.5 whitespace-nowrap transition-all duration-200 lg:flex-none",
                filter === key
                  ? "bg-background font-medium shadow-xs"
                  : "text-muted-foreground hover:text-foreground",
              )}
            >
              {t(`filters.${key}`)}
              <TabCount selected={filter === key}>{number(counts[key])}</TabCount>
            </button>
          ))}
        </div>
        <div className="flex gap-2">
          <InputGroup className="bg-card h-10 flex-1 lg:h-9 lg:w-72 lg:flex-none">
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
                  aria-label={t("clearSearch")}
                >
                  <XIcon />
                </InputGroupButton>
              </InputGroupAddon>
            ) : null}
          </InputGroup>
          <label className="relative flex shrink-0 items-center">
            <span className="sr-only">{t("sort.label")}</span>
            <ArrowUpDownIcon
              className="text-muted-foreground pointer-events-none absolute start-2.5 size-4"
              aria-hidden
            />
            <NativeSelect
              className="bg-card h-10 w-40 ps-8 lg:h-9"
              value={sort}
              onChange={(event) => setSort(event.target.value as Sort)}
            >
              {CUSTOMER_SORTS.map((key) => (
                <option key={key} value={key}>
                  {t(`sort.${key}`)}
                </option>
              ))}
            </NativeSelect>
          </label>
        </div>
      </div>

      {visible.length === 0 ? (
        <EmptyState
          icon={counts.all === 0 ? UsersIcon : SearchIcon}
          title={counts.all === 0 ? t("empty") : t("noMatches")}
          description={counts.all === 0 ? t("emptyHint") : t("noMatchesHint")}
        />
      ) : (
        <>
          <ul
            className={cn(
              "stagger grid gap-3 transition-opacity [--stagger:35ms] sm:grid-cols-2 xl:grid-cols-3",
              isFetching && "opacity-70",
            )}
            aria-busy={isFetching}
          >
            {visible.map((c) => (
              <li key={c.id} className="min-w-0">
                <CustomerCard
                  customer={c}
                  showSalesperson={!ownOnly}
                  canCreateBooking={canCreateBooking}
                  isNew={monthKey(c.createdAt) === thisMonth}
                  onEdit={() => setEditing(c)}
                />
              </li>
            ))}
          </ul>
          <ListPagination
            namespace="customers"
            page={page}
            pageSize={pageSize}
            pageSizes={CUSTOMER_PAGE_SIZES}
            total={data.total}
            fetching={isFetching}
            onChange={(next) => {
              if (next.pageSize) setPageSize(Number(next.pageSize));
              setPage(next.page);
              document.getElementById("main")?.scrollTo({ top: 0, behavior: "smooth" });
            }}
          />
        </>
      )}

      <EditCustomerDialog
        customer={editing}
        open={editing !== null}
        onOpenChange={(open) => {
          if (!open) setEditing(null);
        }}
        onSaved={() => queryClient.invalidateQueries({ queryKey: ["customers"] })}
      />
    </div>
  );
}

const TONES = {
  brand: "bg-brand-soft text-brand",
  success: "bg-emerald-600/10 text-emerald-700 dark:bg-emerald-400/12 dark:text-emerald-300",
  info: "bg-sky-600/10 text-sky-700 dark:bg-sky-400/12 dark:text-sky-300",
  warning: "bg-amber-600/12 text-amber-700 dark:bg-amber-400/12 dark:text-amber-300",
  neutral: "bg-muted text-foreground/70",
} as const;

/** A summary figure that filters the list when clicked (same shape as the Bookings tiles). */
function SummaryTile({
  icon: Icon,
  tone,
  label,
  value,
  hint,
  selected,
  onSelect,
}: {
  icon: LucideIcon;
  tone: keyof typeof TONES;
  label: string;
  value: string;
  hint: string;
  selected: boolean;
  onSelect: () => void;
}) {
  const tile = (className: string) => (
    <span
      className={cn("flex shrink-0 items-center justify-center rounded-lg", TONES[tone], className)}
      aria-hidden
    >
      <Icon className="size-4" />
    </span>
  );
  return (
    <button
      type="button"
      onClick={onSelect}
      aria-pressed={selected}
      className={cn(
        "bg-card grid min-w-0 gap-1.5 rounded-xl px-3 py-2.5 text-start shadow-xs ring-1 ring-foreground/[0.07] sm:p-4",
        "hover:ring-brand/30 outline-none transition-[box-shadow,transform] duration-300 hover:-translate-y-0.5 hover:shadow-md focus-visible:ring-2 focus-visible:ring-ring",
        selected && "ring-brand/60 ring-2",
      )}
    >
      {/* Phones: a short row (icon, then label / value / hint). */}
      <span className="flex items-center gap-2.5 sm:justify-between sm:gap-2">
        {tile("size-8 sm:hidden")}
        <span className="grid min-w-0 flex-1">
          <span className="text-muted-foreground truncate text-xs font-medium">{label}</span>
          <span className="font-heading truncate text-lg leading-tight font-semibold tracking-tight tabular-nums sm:hidden">
            {value}
          </span>
          <span className="text-muted-foreground truncate text-[11px] leading-tight sm:hidden">
            {hint}
          </span>
        </span>
        {tile("size-8 max-sm:hidden")}
      </span>
      <span className="font-heading truncate text-2xl font-semibold tracking-tight tabular-nums max-sm:hidden">
        {value}
      </span>
      <span className="text-muted-foreground truncate text-xs max-sm:hidden">{hint}</span>
    </button>
  );
}

const initials = (name: string) =>
  name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join("") || "?";

/** Where the customer stands: a car on hold now, bought or booked before, or not yet. */
function CustomerStatus({ customer }: { customer: CustomerListItem }) {
  const t = useTranslations("customers");
  const { total, active } = customer.bookings;
  const style =
    active > 0
      ? { className: TONES.success, label: t("status.active", { count: active }), live: true }
      : total > 0
        ? { className: TONES.neutral, label: t("status.past"), live: false }
        : { className: "bg-muted/60 text-muted-foreground", label: t("status.none"), live: false };
  return (
    <span
      className={cn(
        "inline-flex shrink-0 items-center gap-1.5 rounded-full px-2 py-0.5 text-[11px] font-semibold whitespace-nowrap",
        style.className,
      )}
    >
      {style.live ? (
        <span className="relative flex size-1.5" aria-hidden>
          <span className="animate-ping-soft absolute inset-0 rounded-full bg-current motion-reduce:hidden" />
          <span className="relative size-1.5 rounded-full bg-current" />
        </span>
      ) : null}
      {style.label}
    </span>
  );
}

/** A round icon link for the quick contact actions. */
function ContactAction({
  href,
  icon: Icon,
  label,
  external = false,
  className,
}: {
  href: string;
  icon: LucideIcon;
  label: string;
  external?: boolean;
  className?: string;
}) {
  return (
    <a
      href={href}
      aria-label={label}
      title={label}
      {...(external ? { target: "_blank", rel: "noopener noreferrer" } : {})}
      className={cn(
        buttonVariants({ variant: "outline", size: "icon" }),
        "size-10 rounded-full sm:size-9",
        className,
      )}
    >
      <Icon className="size-4" aria-hidden />
    </a>
  );
}

function CustomerCard({
  customer: c,
  showSalesperson,
  canCreateBooking,
  isNew,
  onEdit,
}: {
  customer: CustomerListItem;
  showSalesperson: boolean;
  canCreateBooking: boolean;
  isNew: boolean;
  onEdit: () => void;
}) {
  const t = useTranslations("customers");
  const locale = useAppLocale();
  const active = c.bookings.active > 0;
  const phoneDigits = c.phone.replace(/\D/g, "");
  const place = [c.city, c.branchName].filter(Boolean).join(" · ");

  return (
    <article
      className={cn(
        "bg-card flex h-full flex-col overflow-hidden rounded-xl shadow-xs ring-1 ring-foreground/[0.07]",
        "hover:ring-brand/30 transition-[box-shadow] duration-300 hover:shadow-md",
      )}
    >
      <div className="grid flex-1 content-start gap-3 p-4">
        {/* Who */}
        <div className="flex min-w-0 items-start gap-3">
          <span
            className={cn(
              "flex size-11 shrink-0 items-center justify-center rounded-full text-sm font-semibold",
              active
                ? "bg-gold text-brand-foreground shadow-sm"
                : "bg-muted text-foreground/70",
            )}
            aria-hidden
          >
            {initials(c.name)}
          </span>
          <div className="min-w-0 flex-1">
            <div className="flex items-start justify-between gap-2">
              <p className="truncate font-semibold" title={c.name}>
                {c.name}
              </p>
              <CustomerStatus customer={c} />
            </div>
            <p className="text-muted-foreground flex items-center gap-1.5 text-xs">
              <span className="font-mono">{c.code}</span>
              {isNew ? (
                <span className="rounded-full bg-sky-600/10 px-1.5 py-px font-medium text-sky-700 dark:bg-sky-400/12 dark:text-sky-300">
                  {t("newBadge")}
                </span>
              ) : null}
            </p>
          </div>
        </div>

        {/* Contact and ownership */}
        <dl className="grid gap-1.5 text-sm">
          <div className="flex items-center gap-2">
            <dt className="sr-only">{t("columns.contact")}</dt>
            <PhoneIcon className="text-muted-foreground size-3.5 shrink-0" aria-hidden />
            <dd dir="ltr" className="tabular-nums rtl:text-end">
              {formatUaePhone(c.phone)}
            </dd>
          </div>
          {c.email ? (
            <div className="flex min-w-0 items-center gap-2">
              <dt className="sr-only">{t("actions.email")}</dt>
              <MailIcon className="text-muted-foreground size-3.5 shrink-0" aria-hidden />
              <dd className="text-muted-foreground truncate" title={c.email}>
                {c.email}
              </dd>
            </div>
          ) : null}
          {place ? (
            <div className="flex min-w-0 items-center gap-2">
              <dt className="sr-only">{t("columns.branch")}</dt>
              <Building2Icon className="text-muted-foreground size-3.5 shrink-0" aria-hidden />
              <dd className="text-muted-foreground truncate">{place}</dd>
            </div>
          ) : null}
          {showSalesperson ? (
            <div className="flex min-w-0 items-center gap-2">
              <dt className="sr-only">{t("columns.salesperson")}</dt>
              <span
                className={cn(
                  "flex size-3.5 shrink-0 items-center justify-center rounded-full text-[7px] font-bold",
                  c.salesperson
                    ? "bg-foreground/10 text-foreground/70"
                    : "bg-amber-500/20 text-amber-700",
                )}
                aria-hidden
              >
                {c.salesperson ? initials(c.salesperson.name).slice(0, 1) : "!"}
              </span>
              <dd
                className={cn(
                  "truncate",
                  c.salesperson ? "text-muted-foreground" : "text-amber-700 dark:text-amber-400",
                )}
              >
                {c.salesperson
                  ? t("ownedBy", { name: c.salesperson.name })
                  : t("unassigned")}
              </dd>
            </div>
          ) : null}
        </dl>

        {/* History */}
        <p className="text-muted-foreground bg-muted/40 rounded-lg px-2.5 py-1.5 text-xs">
          {c.bookings.total > 0 ? (
            <>
              <span className="text-foreground font-medium">
                {t("totalCount", {
                  count: c.bookings.total,
                  formatted: formatNumber(c.bookings.total, locale),
                })}
              </span>
              {c.bookings.lastAt ? (
                <span title={formatDate(c.bookings.lastAt, locale)}>
                  {" · "}
                  {t("lastBooked", { when: formatRelativeTime(c.bookings.lastAt, locale) })}
                </span>
              ) : null}
            </>
          ) : (
            <span title={formatDate(c.createdAt, locale)}>
              {t("addedOn", { when: formatRelativeTime(c.createdAt, locale) })}
            </span>
          )}
        </p>
      </div>

      {/* One-tap actions */}
      <div className="bg-muted/30 flex items-center gap-2 border-t px-3 py-2.5">
        <ContactAction href={`tel:${c.phone}`} icon={PhoneIcon} label={t("actions.call")} />
        <ContactAction
          href={`https://wa.me/${phoneDigits}`}
          icon={MessageCircleIcon}
          label={t("actions.whatsapp")}
          external
          className="hover:border-emerald-500/50 hover:text-emerald-700 dark:hover:text-emerald-400"
        />
        {c.email ? (
          <ContactAction href={`mailto:${c.email}`} icon={MailIcon} label={t("actions.email")} />
        ) : null}
        {c.canEdit ? (
          <Button
            type="button"
            variant="outline"
            size="icon"
            className="size-10 rounded-full sm:size-9"
            onClick={onEdit}
            aria-label={t("actions.edit")}
            title={t("actions.edit")}
          >
            <PencilIcon className="size-4" aria-hidden />
          </Button>
        ) : null}
        <div className="ms-auto flex min-w-0 items-center gap-2">
          {c.bookings.total > 0 ? (
            <Link
              href={`/bookings?filter=all&q=${encodeURIComponent(c.phone)}`}
              className={cn(
                buttonVariants({ variant: "ghost", size: "sm" }),
                "h-10 px-2.5 sm:h-9",
                canCreateBooking && "max-sm:hidden",
              )}
            >
              {t("actions.viewBookings")}
            </Link>
          ) : null}
          {canCreateBooking ? (
            <Link
              href={`/bookings?customerId=${c.id}`}
              className={cn(buttonVariants({ variant: "brand", size: "sm" }), "h-10 sm:h-9")}
            >
              <CalendarPlusIcon aria-hidden />
              {t("actions.book")}
            </Link>
          ) : null}
        </div>
      </div>
    </article>
  );
}
