"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { keepPreviousData, useQuery, useQueryClient } from "@tanstack/react-query";
import { useLocale, useTranslations } from "next-intl";
import { useSearchParams } from "next/navigation";
import type { LucideIcon } from "lucide-react";
import {
  BadgeCheckIcon,
  BanIcon,
  CalendarCheckIcon,
  CalendarClockIcon,
  CircleAlertIcon,
  EllipsisVerticalIcon,
  HourglassIcon,
  PencilIcon,
  PhoneIcon,
  PlusIcon,
  SearchIcon,
  ShieldCheckIcon,
  ShieldEllipsisIcon,
  ShieldXIcon,
  WalletIcon,
  XCircleIcon,
  XIcon,
} from "lucide-react";

import {
  CancelBookingDialog,
  MarkSoldDialog,
  RequestHoldDialog,
  ReviewHoldDialog,
} from "@/components/bookings/booking-action-dialogs";
import { BookingRowsSkeleton } from "@/components/bookings/booking-list-skeleton";
import { EditBookingDialog } from "@/components/bookings/edit-booking-dialog";
import { NewBookingDialog } from "@/components/bookings/new-booking-dialog";
import { EmptyState } from "@/components/feedback/empty-state";
import { TabCount } from "@/components/shared/tab-count";
import { useNotifications } from "@/components/providers/notification-provider";
import { PageHeader } from "@/components/layout/page-header";
import { PAYMENT_COLORS } from "@/components/bookings/booking-charts";
import { VehiclePhotoPlaceholder } from "@/components/inventory/vehicle-photo-placeholder";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { ListPagination } from "@/components/tables/list-pagination";
import { InputGroup, InputGroupAddon, InputGroupButton, InputGroupInput } from "@/components/ui/input-group";
import type { AppLocale } from "@/config/app";
import {
  BOOKING_FILTERS,
  DEFAULT_BOOKING_PAGE_SIZE,
  bookingToCollect as toCollect,
  type BookingFilter,
  type BookingListPage,
  type BookingListQuery,
} from "@/lib/bookings/list-query";
import type { BookingListItem } from "@/lib/bookings/service";
import { Link } from "@/lib/i18n/navigation";
import { cn } from "@/lib/utils";
import { formatCurrency, formatNumber } from "@/lib/utils/currency";
import { useFormatDuration } from "@/hooks/use-format-duration";
import { useNow } from "@/hooks/use-now";
import { useViewerTimeZone } from "@/hooks/use-viewer-time-zone";
import { formatDate } from "@/lib/utils/date";
import { formatUaePhone } from "@/lib/utils/phone";
import { bookingHref } from "@/lib/bookings/routes";
import { vehicleHref } from "@/lib/vehicles/routes";

type Filter = BookingFilter;
type BookingAction = "edit" | "sold" | "cancel" | "requestHold" | "reviewHold";
const FILTERS = BOOKING_FILTERS;

/** The list as the server returns it; keyed by everything that changes the page. */
const bookingListKey = (query: BookingListQuery) => ["bookings", "list", query] as const;

async function fetchBookingPage(query: BookingListQuery): Promise<BookingListPage> {
  const params = new URLSearchParams({
    filter: query.filter,
    page: String(query.page),
    pageSize: String(query.pageSize),
  });
  if (query.q) params.set("q", query.q);
  const res = await fetch(`/api/bookings?${params}`, { credentials: "same-origin", cache: "no-store" });
  const json = await res.json().catch(() => null);
  if (json?.status !== "success") throw new Error(json?.message ?? "Could not load bookings.");
  return json.data;
}

export function BookingsPageClient({
  initialPage,
  initialQuery,
  canCreate,
  canCreateCustomer,
  ownOnly = false,
  depositMinutes,
}: {
  /** The first page, rendered on the server for the query in the URL. */
  initialPage: BookingListPage;
  initialQuery: BookingListQuery;
  canCreate: boolean;
  canCreateCustomer: boolean;
  /** Everyone but Super Admins and Accountants sees only their own bookings ("My bookings"). */
  ownOnly?: boolean;
  /** Payment terms from Settings. */
  depositMinutes: number;
}) {
  const t = useTranslations("bookings");
  const locale = useLocale() as AppLocale;
  const searchParams = useSearchParams();
  const initialVehicleId = searchParams.get("vehicleId") ?? undefined;
  const initialCustomerId = searchParams.get("customerId") ?? undefined;

  const queryClient = useQueryClient();

  const [filter, setFilterState] = useState<Filter>(initialQuery.filter);
  const [query, setQuery] = useState(initialQuery.q);
  // Search waits for a pause in typing before asking the server.
  const [searchTerm, setSearchTerm] = useState(initialQuery.q);
  const [page, setPage] = useState(initialPage.page);
  const [pageSize, setPageSize] = useState(initialQuery.pageSize);
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

  const listQuery: BookingListQuery = { filter, q: searchTerm, page, pageSize };
  const isInitialQuery =
    filter === initialQuery.filter &&
    searchTerm === initialQuery.q &&
    page === initialPage.page &&
    pageSize === initialQuery.pageSize;
  const { data = initialPage, isFetching, isPlaceholderData } = useQuery({
    queryKey: bookingListKey(listQuery),
    queryFn: () => fetchBookingPage(listQuery),
    initialData: isInitialQuery ? initialPage : undefined,
    placeholderData: keepPreviousData,
    staleTime: 15_000,
  });
  const bookings = data.items;
  const counts = data.counts;
  const summary = data.summary;
  // The server moves past-the-end requests to the last page; follow it.
  if (data.page !== page && !isFetching) setPage(data.page);

  // Keep the tab, search and page in the address so reloads and links land in the same place.
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const set = (key: string, value: string | null) =>
      value ? params.set(key, value) : params.delete(key);
    set("filter", filter === "active" ? null : filter);
    set("q", searchTerm || null);
    set("page", page > 1 ? String(page) : null);
    set("pageSize", pageSize === DEFAULT_BOOKING_PAGE_SIZE ? null : String(pageSize));
    const next = `${window.location.pathname}${params.size ? `?${params}` : ""}`;
    if (next !== `${window.location.pathname}${window.location.search}`) {
      window.history.replaceState(window.history.state, "", next);
    }
  }, [filter, searchTerm, page, pageSize]);
  const [dialogOpen, setDialogOpen] = useState(
    canCreate &&
      (Boolean(initialVehicleId) || Boolean(initialCustomerId) || searchParams.get("new") === "1"),
  );
  // Remounts the dialog on every open so it starts with a fresh form.
  const [dialogKey, setDialogKey] = useState(0);
  const openDialog = () => {
    setDialogKey((k) => k + 1);
    setDialogOpen(true);
  };

  // One booking at a time is acted on; the open dialog is derived from `action`.
  const [selected, setSelected] = useState<BookingListItem | null>(null);
  const [action, setAction] = useState<BookingAction | null>(null);
  const openAction = (booking: BookingListItem, next: BookingAction) => {
    setSelected(booking);
    setAction(next);
  };
  const dialogProps = (kind: BookingAction) => ({
    open: action === kind,
    onOpenChange: (open: boolean) => {
      if (!open) setAction(null);
    },
  });

  const refresh = useCallback(
    () => queryClient.invalidateQueries({ queryKey: ["bookings", "list"] }),
    [queryClient],
  );

  // Refresh the list the moment a payment deadline passes, so cancellations and
  // overdue notes appear without reloading the page.
  useEffect(() => {
    const now = Date.now();
    const upcoming = bookings
      .flatMap((b) => [b.depositDueAt, b.balanceOverdue ? null : b.balanceDueAt])
      .filter((at): at is string => !!at)
      .map((at) => new Date(at).getTime())
      .filter((at) => at > now);
    if (upcoming.length === 0) return;
    const wait = Math.min(...upcoming) - now + 3000;
    if (wait > 60 * 60 * 1000) return;
    const timer = window.setTimeout(() => void refresh(), wait);
    return () => window.clearTimeout(timer);
  }, [bookings, refresh]);

  // A new booking alert (e.g. cancelled elsewhere) also means the list changed.
  const { items: notifications } = useNotifications();
  const latestBookingAlert = notifications.find((n) => n.type.startsWith("booking_"))?.id;
  const seenAlert = useRef(latestBookingAlert);
  useEffect(() => {
    if (latestBookingAlert === seenAlert.current) return;
    seenAlert.current = latestBookingAlert;
    void refresh();
  }, [latestBookingAlert, refresh]);

  const visible = bookings;

  const currency = summary.currency;
  const total = (value: number) => formatCurrency(value, locale, currency);
  const number = (value: number) => formatNumber(value, locale);

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title={t(ownOnly ? "myTitle" : "title")}
        description={t(ownOnly ? "myDescription" : "description")}
        actions={
          canCreate ? (
            <Button variant="brand" onClick={openDialog}>
              <PlusIcon />
              {t("new")}
            </Button>
          ) : null
        }
      />

      {counts.all > 0 ? (
        <section className="stagger grid grid-cols-2 gap-3 [--stagger:60ms] xl:grid-cols-4">
          <SummaryTile
            icon={CalendarCheckIcon}
            tone="brand"
            label={t("summary.active")}
            value={number(counts.active)}
            hint={t("summary.activeHint", { amount: total(summary.activeValue) })}
            selected={filter === "active"}
            onSelect={() => setFilter("active")}
          />
          <SummaryTile
            icon={CircleAlertIcon}
            tone={counts.attention > 0 ? "danger" : "success"}
            label={t("summary.attention")}
            value={number(counts.attention)}
            hint={
              counts.attention > 0
                ? t("summary.attentionHint", {
                    deposit: number(summary.noDeposit),
                    overdue: number(summary.overdue),
                  })
                : t("summary.attentionNone")
            }
            selected={filter === "attention"}
            onSelect={() => setFilter("attention")}
          />
          <SummaryTile
            icon={BadgeCheckIcon}
            tone="success"
            label={t("summary.sold")}
            value={number(counts.sold)}
            hint={t("summary.soldHint", { amount: total(summary.soldValue) })}
            selected={filter === "sold"}
            onSelect={() => setFilter("sold")}
          />
          <SummaryTile
            icon={WalletIcon}
            tone="warning"
            label={t("summary.toCollect")}
            value={total(summary.toCollect)}
            hint={t("summary.toCollectHint")}
          />
        </section>
      ) : null}

      <div className="animate-rise flex flex-col gap-3 [animation-delay:120ms] xl:flex-row xl:items-center xl:justify-between">
        <div
          className="bg-muted flex w-full touch-pan-x touch-pan-y overflow-x-auto overflow-y-hidden overscroll-x-contain rounded-lg p-0.5 text-sm xl:w-fit"
          role="tablist"
        >
          {FILTERS.map((key) => (
            <button
              key={key}
              type="button"
              role="tab"
              aria-selected={filter === key}
              onClick={() => setFilter(key)}
              className={cn(
                "flex flex-1 items-center justify-center gap-1.5 rounded-md px-3 py-1.5 whitespace-nowrap transition-all duration-200 xl:flex-none",
                filter === key
                  ? "bg-background font-medium shadow-xs"
                  : "text-muted-foreground hover:text-foreground",
              )}
            >
              {t(`filters.${key}`)}
              <TabCount
                selected={filter === key}
                alert={key === "attention" && counts.attention > 0}
              >
                {number(counts[key])}
              </TabCount>
            </button>
          ))}
        </div>
        <InputGroup className="bg-card h-10 lg:h-9 xl:max-w-xs">
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
      </div>

      {/* A new tab, page or search is loading: the old rows belong to another list. */}
      {isPlaceholderData ? (
        <BookingRowsSkeleton count={Math.min(Math.max(visible.length, 3), pageSize)} />
      ) : visible.length === 0 ? (
        <EmptyState
          icon={query ? SearchIcon : filter === "attention" ? BadgeCheckIcon : CalendarCheckIcon}
          title={
            query ? t("noMatches") : filter === "attention" ? t("attentionEmpty") : t("empty")
          }
          action={
            canCreate && !query && filter === "active" ? (
              <Button variant="brand" onClick={openDialog}>
                <PlusIcon />
                {t("new")}
              </Button>
            ) : undefined
          }
        />
      ) : (
        <>
          <ul
            className={cn(
              "stagger grid gap-3 transition-opacity [--stagger:40ms]",
              isFetching && "opacity-70",
            )}
            aria-busy={isFetching}
          >
            {visible.map((b) => (
              <li key={b.id} className="@container">
                <BookingRow booking={b} showSalesperson={!ownOnly} onAction={openAction} />
              </li>
            ))}
          </ul>
          <ListPagination
            namespace="bookings"
            page={page}
            pageSize={pageSize}
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

      <EditBookingDialog
        booking={selected}
        depositMinutes={depositMinutes}
        onSaved={refresh}
        {...dialogProps("edit")}
      />
      <MarkSoldDialog booking={selected} onDone={refresh} {...dialogProps("sold")} />
      <CancelBookingDialog booking={selected} onDone={refresh} {...dialogProps("cancel")} />
      <RequestHoldDialog booking={selected} onDone={refresh} {...dialogProps("requestHold")} />
      <ReviewHoldDialog booking={selected} onDone={refresh} {...dialogProps("reviewHold")} />

      {canCreate ? (
        <NewBookingDialog
          key={dialogKey}
          open={dialogOpen}
          onOpenChange={setDialogOpen}
          initialVehicleId={initialVehicleId}
          initialCustomerId={initialCustomerId}
          canCreateCustomer={canCreateCustomer}
          depositMinutes={depositMinutes}
          onCreated={refresh}
        />
      ) : null}
    </div>
  );
}

const TONES = {
  brand: "bg-brand-soft text-brand",
  success: "bg-emerald-600/10 text-emerald-700 dark:bg-emerald-400/12 dark:text-emerald-300",
  warning: "bg-amber-600/12 text-amber-700 dark:bg-amber-400/12 dark:text-amber-300",
  danger: "bg-rose-600/10 text-rose-700 dark:bg-rose-400/12 dark:text-rose-300",
} as const;

/** A summary figure; the ones tied to a tab filter the list when clicked. */
function SummaryTile({
  icon: Icon,
  tone,
  label,
  value,
  hint,
  selected = false,
  onSelect,
}: {
  icon: LucideIcon;
  tone: keyof typeof TONES;
  label: string;
  value: string;
  hint: string;
  selected?: boolean;
  onSelect?: () => void;
}) {
  const tile = (className: string) => (
    <span
      className={cn("flex shrink-0 items-center justify-center rounded-lg", TONES[tone], className)}
      aria-hidden
    >
      <Icon className="size-4" />
    </span>
  );
  // Phones: a short row (icon, then label / value / hint), like the shared KPI cards.
  const content = (
    <>
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
      <span className="font-heading truncate text-xl font-semibold tracking-tight tabular-nums max-sm:hidden sm:text-2xl">
        {value}
      </span>
      <span className="text-muted-foreground truncate text-xs max-sm:hidden">{hint}</span>
    </>
  );
  const className = cn(
    "bg-card grid min-w-0 gap-1.5 rounded-xl px-3 py-2.5 text-start shadow-xs ring-1 ring-foreground/[0.07] sm:p-4",
    "transition-[box-shadow,transform] duration-300",
  );
  if (!onSelect) return <div className={className}>{content}</div>;
  return (
    <button
      type="button"
      onClick={onSelect}
      aria-pressed={selected}
      className={cn(
        className,
        "hover:ring-brand/30 outline-none hover:-translate-y-0.5 hover:shadow-md focus-visible:ring-2 focus-visible:ring-ring",
        selected && "ring-brand/60 ring-2",
      )}
    >
      {content}
    </button>
  );
}

/** Edge colour by state: open, waiting on the customer, sold, or closed. */
function accentOf(b: BookingListItem) {
  if (b.status === "converted") return "bg-emerald-500";
  if (b.status !== "active") return "bg-muted-foreground/30";
  if (b.balanceOverdue) return "bg-destructive";
  if (b.depositDueAt) return "bg-amber-500";
  return "bg-brand";
}

const STATUS_STYLE: Record<BookingListItem["status"], { icon: LucideIcon; className: string }> = {
  active: { icon: CalendarCheckIcon, className: TONES.brand },
  converted: { icon: BadgeCheckIcon, className: TONES.success },
  cancelled: { icon: BanIcon, className: "bg-muted text-muted-foreground" },
  expired: { icon: HourglassIcon, className: "bg-muted text-muted-foreground" },
};

function StatusPill({ status }: { status: BookingListItem["status"] }) {
  const t = useTranslations("bookings");
  const { icon: Icon, className } = STATUS_STYLE[status];
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-semibold whitespace-nowrap",
        className,
      )}
    >
      <Icon className="size-3.5" aria-hidden />
      {t(`statuses.${status}`)}
    </span>
  );
}

/** Rounds a countdown to its two largest units: "2 days 3 hours", "5 hours", "12 minutes". */
const roughMinutes = (minutes: number) =>
  minutes >= 1440
    ? Math.floor(minutes / 1440) * 1440 + Math.floor((minutes % 1440) / 60) * 60
    : minutes >= 60
      ? Math.floor(minutes / 60) * 60
      : Math.max(1, Math.ceil(minutes));

/** The next thing that has to happen on the booking, with a live countdown. */
function DeadlineChip({ booking: b }: { booking: BookingListItem }) {
  const t = useTranslations("bookings");
  const locale = useLocale() as AppLocale;
  const timeZone = useViewerTimeZone();
  const formatDuration = useFormatDuration();
  const now = useNow(60_000);

  const chip = (icon: LucideIcon, className: string, text: string, at?: string | null) => {
    const Icon = icon;
    return (
      <span
        className={cn(
          "inline-flex w-fit max-w-full items-center gap-1.5 rounded-lg px-2 py-1 text-xs font-medium",
          className,
        )}
        title={at ? formatDate(at, locale, "dateTimeZone", timeZone) : undefined}
      >
        <Icon className="size-3.5 shrink-0" aria-hidden />
        <span className="truncate">{text}</span>
      </span>
    );
  };
  const minutesUntil = (at: string) =>
    now == null ? null : (new Date(at).getTime() - now) / 60_000;
  const inTime = (at: string, key: "deposit" | "balance") => {
    const left = minutesUntil(at);
    return left == null
      ? t(key === "deposit" ? "depositDueBy" : "balanceDueBy", {
          date: formatDate(at, locale, "dateTime", timeZone),
        })
      : left <= 0
        ? t(`deadline.${key}Now`)
        : t(`deadline.${key}`, { duration: formatDuration(roughMinutes(left)) });
  };

  if (b.status === "active") {
    if (b.depositDueAt) {
      return chip(HourglassIcon, TONES.warning, inTime(b.depositDueAt, "deposit"), b.depositDueAt);
    }
    if (b.balanceOverdue && b.balanceDueAt) {
      const late = minutesUntil(b.balanceDueAt);
      return chip(
        CircleAlertIcon,
        TONES.danger,
        late == null
          ? t("balanceOverdueSince", { date: formatDate(b.balanceDueAt, locale, "dateTime", timeZone) })
          : t("deadline.overdue", { duration: formatDuration(roughMinutes(-late)) }),
        b.balanceDueAt,
      );
    }
    if (b.balanceDueAt) {
      return chip(
        CalendarClockIcon,
        "bg-muted text-foreground/80",
        inTime(b.balanceDueAt, "balance"),
        b.balanceDueAt,
      );
    }
    return null;
  }
  if (b.status === "converted" && b.soldAt) {
    return chip(
      BadgeCheckIcon,
      TONES.success,
      t("soldOn", { date: formatDate(b.soldAt, locale, "short", timeZone) }),
    );
  }
  if (b.status === "cancelled") {
    if (b.autoCancelled) return chip(BanIcon, TONES.danger, t("autoCancelled"));
    if (b.refund) {
      return chip(
        BanIcon,
        "bg-muted text-muted-foreground",
        t("refundedChip", { amount: formatCurrency(b.refund.amount, locale, b.currency) }),
      );
    }
    if (b.cancelReason) {
      return chip(BanIcon, "bg-muted text-muted-foreground", t("cancelReason", { reason: b.cancelReason }));
    }
  }
  return null;
}

const HOLD_STYLE: Record<
  NonNullable<BookingListItem["cancellationHold"]>["status"],
  { icon: LucideIcon; className: string }
> = {
  pending: {
    icon: ShieldEllipsisIcon,
    className: "bg-sky-600/10 text-sky-800 dark:bg-sky-400/12 dark:text-sky-300",
  },
  approved: { icon: ShieldCheckIcon, className: TONES.success },
  rejected: { icon: ShieldXIcon, className: TONES.danger },
};

/** Cancellation hold state, beside the deadline chip and styled like it; the buttons are in the actions. */
function HoldChip({ booking: b }: { booking: BookingListItem }) {
  const t = useTranslations("bookings");
  const hold = b.status === "active" && b.deposit <= 0 ? b.cancellationHold : null;
  if (!hold) return null;
  const { icon: Icon, className } = HOLD_STYLE[hold.status];
  return (
    <span
      className={cn(
        "inline-flex w-fit max-w-full items-center gap-1.5 rounded-lg px-2 py-1 text-xs font-medium",
        className,
      )}
      title={hold.reason ?? undefined}
    >
      <Icon className="size-3.5 shrink-0" aria-hidden />
      <span className="truncate">{t(`holdChip.${hold.status}`)}</span>
    </span>
  );
}

/** Collected so far (deposit, then balance) against the price, and what's left. */
function PaymentProgress({ booking: b }: { booking: BookingListItem }) {
  const t = useTranslations("bookings");
  const locale = useLocale() as AppLocale;
  const money = (value: number) => formatCurrency(value, locale, b.currency);
  if (b.totalPrice == null || b.totalPrice <= 0) {
    return (
      <p className="text-muted-foreground text-xs">
        {t("payment.deposit")}: <span className="text-foreground tabular-nums">{money(b.deposit)}</span>
      </p>
    );
  }
  const received = b.balanceReceived ?? 0;
  const outstanding = toCollect(b);
  const share = (value: number) => `${Math.min(100, (value / b.totalPrice!) * 100)}%`;
  const closed = b.status === "cancelled" || b.status === "expired";

  return (
    <div className={cn("grid gap-1.5", closed && "opacity-60")}>
      <div className="flex items-baseline justify-between gap-3 text-xs">
        <span className="text-muted-foreground truncate">
          {t.rich("progress.paidOf", {
            paid: money(b.deposit + received),
            total: money(b.totalPrice),
            strong: (chunks) => (
              <span className="text-foreground font-semibold tabular-nums">{chunks}</span>
            ),
          })}
        </span>
      </div>
      <div className="bg-muted flex h-2 gap-px overflow-hidden rounded-full" aria-hidden>
        <span style={{ width: share(b.deposit), backgroundColor: PAYMENT_COLORS.deposit }} />
        {received > 0 ? (
          <span style={{ width: share(received), backgroundColor: PAYMENT_COLORS.balance }} />
        ) : null}
      </div>
      {closed ? null : outstanding > 0 ? (
        <p className="text-xs font-medium text-amber-700 tabular-nums dark:text-amber-400">
          {t("progress.toCollect", { amount: money(outstanding) })}
        </p>
      ) : (
        <p className="text-xs font-medium text-emerald-700 dark:text-emerald-400">
          {t("progress.paidInFull")}
        </p>
      )}
    </div>
  );
}

const initials = (name: string) =>
  name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join("");

/**
 * One booking as a card: car and booking number, customer, payment progress, what's due
 * next and the actions. The whole card opens the booking; links and buttons sit above it.
 */
function BookingRow({
  booking: b,
  showSalesperson,
  onAction,
}: {
  booking: BookingListItem;
  showSalesperson: boolean;
  onAction: (booking: BookingListItem, action: BookingAction) => void;
}) {
  const t = useTranslations("bookings");
  const locale = useLocale() as AppLocale;
  const timeZone = useViewerTimeZone();
  const vehicle = b.vehicle;
  const customer = b.customer;

  return (
    <article
      className={cn(
        "group/booking bg-card relative grid gap-4 overflow-hidden rounded-xl p-4 ps-5 shadow-xs ring-1 ring-foreground/[0.07]",
        "hover:ring-brand/30 transition-[box-shadow] duration-300 hover:shadow-md",
        // Sized by the card, not the window: stacked on phones, two columns (car | customer,
        // payment | actions) on medium cards, one line on wide ones. The actions column has a
        // fixed width so rows line up whatever buttons they have.
        "@2xl:grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)] @2xl:gap-x-6",
        "@[66rem]:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)_minmax(0,1.3fr)_12rem] @[66rem]:items-center",
      )}
    >
      <span className={cn("absolute inset-y-0 start-0 w-1", accentOf(b))} aria-hidden />

      {/* Car, booking number and date */}
      <div className="flex min-w-0 items-start gap-3">
        {/* The car's main photo, or the showroom placeholder when it has none. */}
        <span
          className="bg-muted relative size-14 shrink-0 overflow-hidden rounded-lg ring-1 ring-foreground/[0.07] sm:h-16 sm:w-20"
          aria-hidden
        >
          {vehicle?.photoUrl ? (
            // eslint-disable-next-line @next/next/no-img-element -- signed storage URL
            <img
              src={vehicle.photoUrl}
              alt=""
              loading="lazy"
              decoding="async"
              className="size-full object-cover transition-transform duration-500 group-hover/booking:scale-105"
            />
          ) : (
            <VehiclePhotoPlaceholder size="sm" />
          )}
        </span>
        <div className="grid min-w-0 flex-1 gap-1">
          <div className="flex flex-wrap items-center justify-between gap-x-2 gap-y-1 @[66rem]:justify-start">
            <Link
              href={bookingHref(b.number)}
              className="font-mono text-xs font-medium whitespace-nowrap after:absolute after:inset-0 after:content-[''] hover:underline"
              aria-label={t("view", { number: b.number })}
            >
              {b.number}
            </Link>
            <StatusPill status={b.status} />
          </div>
          <p className="truncate font-semibold">{vehicle?.title ?? "—"}</p>
          <p className="text-muted-foreground flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs">
            {vehicle?.stockNumber ? (
              <Link
                href={vehicleHref(vehicle.stockNumber)}
                className="hover:text-brand relative z-10 font-mono transition-colors"
              >
                {vehicle.stockNumber}
              </Link>
            ) : null}
            {b.units > 1 ? (
              <span className="bg-brand-soft text-brand rounded-full px-1.5 py-px font-medium">
                {t("unitsBadge", { count: b.units })}
              </span>
            ) : null}
            <span>{t("bookedOn", { date: formatDate(b.reservedAt, locale, "short", timeZone) })}</span>
          </p>
        </div>
      </div>

      {/* Customer and sales executive */}
      <div className="grid min-w-0 content-start gap-1 border-t pt-3 @2xl:border-0 @2xl:pt-0">
        <p className="truncate text-sm font-medium">{customer?.name ?? "—"}</p>
        {customer?.phone ? (
          <a
            href={`tel:${customer.phone}`}
            dir="ltr"
            className="text-muted-foreground hover:text-brand relative z-10 inline-flex w-fit items-center gap-1 text-xs tabular-nums transition-colors rtl:justify-self-end"
          >
            <PhoneIcon className="size-3" aria-hidden />
            {formatUaePhone(customer.phone)}
          </a>
        ) : null}
        {showSalesperson && b.salesperson ? (
          <p className="text-muted-foreground flex items-center gap-1.5 text-xs">
            <span
              className="bg-muted text-foreground/70 flex size-5 items-center justify-center rounded-full text-[9px] font-semibold"
              aria-hidden
            >
              {initials(b.salesperson.name)}
            </span>
            <span className="truncate">{b.salesperson.name}</span>
          </p>
        ) : null}
      </div>

      {/* Payment and what's due next */}
      <div className="grid min-w-0 content-start gap-2.5 @2xl:border-t @2xl:pt-3 @[66rem]:border-0 @[66rem]:pt-0">
        <PaymentProgress booking={b} />
        <div className="flex flex-wrap items-center gap-1.5 empty:hidden">
          <DeadlineChip booking={b} />
          <HoldChip booking={b} />
        </div>
      </div>

      {b.can.sell || b.can.edit || b.can.cancel || b.can.requestHold || b.can.reviewHold ? (
        <BookingActions booking={b} onAction={onAction} />
      ) : (
        // No actions: on two-column cards, carry the divider across the right half too.
        <div className="hidden border-t @2xl:block @[66rem]:hidden" aria-hidden />
      )}
    </article>
  );
}

function BookingActions({
  booking: b,
  onAction,
}: {
  booking: BookingListItem;
  onAction: (booking: BookingListItem, action: BookingAction) => void;
}) {
  const t = useTranslations("bookings");
  const hasMenu = b.can.edit || b.can.cancel;
  const hold = b.can.reviewHold ? "reviewHold" : b.can.requestHold ? "requestHold" : null;
  if (!b.can.sell && !hasMenu && !hold) return null;

  return (
    <div className="relative z-10 grid content-start gap-1.5 border-t pt-3 @[66rem]:border-0 @[66rem]:pt-0">
      {b.can.sell || hasMenu ? (
        <div className="flex items-center justify-end gap-1.5">
          {b.can.sell ? (
            <Button
              variant="outline"
              className="hover:border-brand/50 hover:bg-brand-soft h-10 min-w-0 flex-1 whitespace-nowrap lg:h-9"
              onClick={() => onAction(b, "sold")}
            >
              <BadgeCheckIcon className="text-brand" />
              <span className="truncate">{t("markSold")}</span>
            </Button>
          ) : null}
          {hasMenu ? <BookingMenu booking={b} onAction={onAction} /> : null}
        </div>
      ) : null}
      {hold === "reviewHold" ? (
        <Button
          variant="brand"
          className="h-10 w-full lg:h-9"
          title={t("reviewHold")}
          onClick={() => onAction(b, "reviewHold")}
        >
          <ShieldEllipsisIcon />
          <span className="truncate">{t("reviewHold")}</span>
        </Button>
      ) : hold === "requestHold" ? (
        <Button
          variant="outline"
          className="hover:border-brand/50 hover:bg-brand-soft h-10 w-full lg:h-9"
          title={t("requestHoldHint")}
          onClick={() => onAction(b, "requestHold")}
        >
          <ShieldCheckIcon className="text-brand" />
          <span className="truncate">{t("requestHoldShort")}</span>
        </Button>
      ) : null}
    </div>
  );
}

function BookingMenu({
  booking: b,
  onAction,
}: {
  booking: BookingListItem;
  onAction: (booking: BookingListItem, action: BookingAction) => void;
}) {
  const t = useTranslations("bookings");
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <Button
            variant="outline"
            size="icon"
            className="size-10 shrink-0 lg:size-9"
            aria-label={t("moreActions", { number: b.number })}
          />
        }
      >
        <EllipsisVerticalIcon />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-48">
        {b.can.edit ? (
          <DropdownMenuItem onClick={() => onAction(b, "edit")}>
            <PencilIcon />
            {t("editAction")}
          </DropdownMenuItem>
        ) : null}
        {b.can.edit && b.can.cancel ? <DropdownMenuSeparator /> : null}
        {b.can.cancel ? (
          <DropdownMenuItem variant="destructive" onClick={() => onAction(b, "cancel")}>
            <XCircleIcon />
            {t("cancelAction")}
          </DropdownMenuItem>
        ) : null}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
