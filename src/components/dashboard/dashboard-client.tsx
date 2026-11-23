"use client";

import {
  BanknoteIcon,
  BuildingIcon,
  CalendarCheckIcon,
  CalendarIcon,
  CalendarPlusIcon,
  CarFrontIcon,
  ChevronRightIcon,
  CircleAlertIcon,
  CircleXIcon,
  HandCoinsIcon,
  PackagePlusIcon,
  ShipIcon,
  TagIcon,
  TrendingDownIcon,
  TrendingUpIcon,
  UsersIcon,
} from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { useSearchParams } from "next/navigation";
import { useTransition } from "react";

import {
  HorizontalBars,
  OutcomeDonut,
  SalesBars,
  StockPipeline,
} from "@/components/dashboard/dashboard-charts";
import { EmptyState } from "@/components/feedback/empty-state";
import { PageHeader } from "@/components/layout/page-header";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { AppLocale } from "@/config/app";
import { quickActions } from "@/config/routes";
import { usePermission } from "@/hooks/use-permission";
import { useViewerTimeZone } from "@/hooks/use-viewer-time-zone";
import { bookingHref } from "@/lib/bookings/routes";
import type { ActivityItem, DashboardData } from "@/lib/dashboard/service";
import { Link, usePathname, useRouter } from "@/lib/i18n/navigation";
import { cn } from "@/lib/utils";
import { formatCurrency, formatNumber } from "@/lib/utils/currency";
import { formatDate } from "@/lib/utils/date";

const AGE_BARS = {
  fresh: "bg-success",
  mid: "bg-gold",
  aging: "bg-warning",
  old: "bg-destructive",
} as const;

const ACTIVITY_STYLE: Record<
  ActivityItem["kind"],
  { icon: typeof CalendarPlusIcon; className: string }
> = {
  created: {
    icon: CalendarPlusIcon,
    className: "bg-info-soft text-info-foreground",
  },
  sold: {
    icon: TagIcon,
    className: "bg-success-soft text-success-foreground",
  },
  cancelled: {
    icon: CircleXIcon,
    className: "bg-danger-soft text-danger-foreground",
  },
};

export function DashboardClient({ data, userName }: { data: DashboardData; userName: string }) {
  const t = useTranslations("dashboard");
  const tRoot = useTranslations();
  const locale = useLocale() as AppLocale;
  const timeZone = useViewerTimeZone();
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [pending, startTransition] = useTransition();
  const intlLocale = locale === "ar" ? "ar-AE" : "en-AE";
  const money = (value: number) => formatCurrency(value, locale, data.currency);
  const compactMoney = (value: number) =>
    new Intl.NumberFormat(intlLocale, {
      style: "currency",
      currency: data.currency,
      notation: "compact",
      // Explicit minimum: Node pads "320.0K" while browsers print "320K" (hydration mismatch).
      minimumFractionDigits: 0,
      maximumFractionDigits: 1,
    }).format(value);
  const monthLabel = (key: string, style: "short" | "long" = "short") => {
    const [y, m] = key.split("-").map(Number);
    if (!y || !m) return "";
    return new Intl.DateTimeFormat(intlLocale, {
      month: style,
      year: "numeric",
      timeZone: "UTC",
    }).format(new Date(Date.UTC(y, m - 1, 15)));
  };
  const selectedMonth = monthLabel(data.monthKey, "long");
  const isCurrentMonth = data.monthKey === data.months[0];

  const selectMonth = (key: string | null) => {
    if (!key || key === data.monthKey) return;
    const params = new URLSearchParams(searchParams.toString());
    if (key === data.months[0]) params.delete("month");
    else params.set("month", key);
    const query = params.toString();
    startTransition(() =>
      router.replace(query ? `${pathname}?${query}` : pathname, { scroll: false }),
    );
  };

  const { stock, month, bookings, outcomes } = data;
  const change =
    month.previousRevenue > 0
      ? (month.revenue - month.previousRevenue) / month.previousRevenue
      : null;
  const closed = outcomes.sold + outcomes.cancelled;
  const conversion = closed > 0 ? Math.round((outcomes.sold / closed) * 100) : null;
  const firstName = userName.split(" ")[0] || userName;
  const stockUnits = stock.inTransit + stock.readyForSale + stock.booked;

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title={t("greeting", { name: firstName })}
        description={data.ownOnly ? t("descriptionOwn") : t("description")}
        actions={
          <div className="grid w-full grid-cols-2 gap-2 sm:flex sm:w-auto sm:flex-wrap sm:items-center">
            <div className="col-span-2 sm:col-span-1">
              <Select value={data.monthKey} onValueChange={selectMonth}>
                <SelectTrigger
                  className="w-full font-medium sm:w-48"
                  aria-label={t("monthFilter.label")}
                >
                  <CalendarIcon className="text-muted-foreground" aria-hidden />
                  <SelectValue>
                    {(value: string | null) => (value ? monthLabel(value, "long") : "")}
                  </SelectValue>
                </SelectTrigger>
                <SelectContent
                  align="end"
                  alignItemWithTrigger={false}
                  className="max-h-80 min-w-56 p-1"
                >
                  {data.months.map((key, index) => (
                    <SelectItem key={key} value={key} className="py-1.5">
                      <span className="flex-1">{monthLabel(key, "long")}</span>
                      {index === 0 ? (
                        <span className="bg-brand-soft text-brand border-brand/25 rounded-full border px-1.5 py-0.5 text-[10px] font-medium">
                          {t("monthFilter.thisMonth")}
                        </span>
                      ) : null}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
        }
      />

      <div
        className={cn(
          "flex flex-col gap-6 transition-opacity",
          pending && "pointer-events-none opacity-60",
        )}
        aria-busy={pending}
      >
        {/* Hero band: the month's headline figure, then the booking ribbon. */}
        <section className="bg-brand-panel animate-rise grid overflow-hidden rounded-2xl lg:grid-cols-[minmax(0,1.1fr)_minmax(0,2fr)]">
          <div className="grid content-between gap-6 p-5 sm:p-7">
            <div className="flex items-center justify-between gap-3">
              <p className="eyebrow text-sidebar-primary">
                {data.ownOnly
                  ? t("kpis.mySales", { month: selectedMonth })
                  : t("kpis.sales", { month: selectedMonth })}
              </p>
              {change != null ? (
                <span
                  className={cn(
                    "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-semibold tabular-nums",
                    change < 0 ? "bg-destructive/20 text-[#f0a3a3]" : "bg-white/10 text-[#e8d5a9]",
                  )}
                >
                  {change < 0 ? (
                    <TrendingDownIcon className="size-3.5" aria-hidden />
                  ) : (
                    <TrendingUpIcon className="size-3.5" aria-hidden />
                  )}
                  {`${change >= 0 ? "+" : ""}${Math.round(change * 100)}%`}
                </span>
              ) : null}
            </div>
            <div>
              <p className="figure text-gold pb-1 text-[2.5rem] sm:text-[3.25rem]">
                {compactMoney(month.revenue)}
              </p>
              <p className="text-sidebar-foreground/65 mt-1 text-sm">
                {change == null
                  ? t("kpis.soldUnits", { count: month.soldUnits })
                  : t("kpis.soldChange", {
                      count: month.soldUnits,
                      change: `${change >= 0 ? "+" : ""}${Math.round(change * 100)}%`,
                    })}
              </p>
            </div>
          </div>
          <dl className="grid border-white/10 max-lg:border-t sm:grid-cols-3 lg:border-s">
            <HeroMetric
              icon={CalendarPlusIcon}
              label={t("kpis.newBookings")}
              value={formatNumber(month.newBookings, locale)}
              hint={t("kpis.newBookingsHint", {
                value: compactMoney(month.newBookingsValue),
                cancelled: month.cancelled,
              })}
            />
            <HeroMetric
              icon={CalendarCheckIcon}
              label={t("kpis.activeBookings")}
              value={formatNumber(bookings.active, locale)}
              hint={t("kpis.activeValue", { value: compactMoney(bookings.activeValue) })}
            />
            <HeroMetric
              icon={BanknoteIcon}
              label={t("kpis.toCollect")}
              value={compactMoney(bookings.toCollect)}
              alert={
                bookings.balanceOverdue > 0
                  ? "danger"
                  : bookings.awaitingDeposit > 0
                    ? "warning"
                    : null
              }
              hint={
                bookings.balanceOverdue > 0
                  ? t("kpis.overdueCount", { count: bookings.balanceOverdue })
                  : t("kpis.awaitingDeposit", { count: bookings.awaitingDeposit })
              }
            />
          </dl>
        </section>

        <div className="grid items-start gap-6 xl:grid-cols-12">
          {/* Main column: trend, follow-ups, stock, people. */}
          <div className="grid min-w-0 gap-6 xl:col-span-8">
            <Card>
              <CardHeader>
                <CardTitle>{data.ownOnly ? t("sales.titleOwn") : t("sales.title")}</CardTitle>
                <CardDescription>
                  {t("sales.description", { month: selectedMonth })}
                </CardDescription>
              </CardHeader>
              <CardContent>
                <SalesBars
                  points={data.salesByMonth}
                  formatValue={money}
                  formatMonth={monthLabel}
                  unitsLabel={(count) => t("sales.units", { count })}
                />
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <CircleAlertIcon className="text-warning size-4" />
                  {t("attention.title")}
                </CardTitle>
                <CardDescription>{t("attention.description")}</CardDescription>
                <CardAction>
                  <Button
                    variant="ghost"
                    size="sm"
                    nativeButton={false}
                    render={<Link href="/bookings" />}
                  >
                    {t("viewAll")}
                    <ChevronRightIcon className="rtl:rotate-180" />
                  </Button>
                </CardAction>
              </CardHeader>
              <CardContent>
                {data.attention.length === 0 ? (
                  <p className="text-muted-foreground rounded-lg border border-dashed px-4 py-6 text-center text-sm">
                    {t("attention.empty")}
                  </p>
                ) : (
                  <ul className="divide-divider -my-1 divide-y">
                    {data.attention.map((item) => (
                      <li key={`${item.kind}-${item.number}`}>
                        <Link
                          href={bookingHref(item.number)}
                          className="group hover:bg-muted/50 -mx-2 flex items-center gap-3 rounded-lg px-2 py-3 transition-colors"
                        >
                          <span
                            className={cn(
                              "h-9 w-1 shrink-0 rounded-full",
                              item.kind === "balance_overdue" ? "bg-destructive" : "bg-warning",
                            )}
                            aria-hidden
                          />
                          <span
                            className={cn(
                              "flex size-9 shrink-0 items-center justify-center rounded-lg",
                              item.kind === "balance_overdue"
                                ? "bg-danger-soft text-danger-foreground"
                                : "bg-warning-soft text-warning-foreground",
                            )}
                          >
                            {item.kind === "deposit_due" ? (
                              <HandCoinsIcon className="size-4" />
                            ) : (
                              <BanknoteIcon className="size-4" />
                            )}
                          </span>
                          <span className="grid min-w-0 flex-1 gap-0.5">
                            <span className="flex flex-wrap items-baseline gap-x-2">
                              <span className="truncate text-sm font-medium">{item.vehicle}</span>
                              <span className="text-muted-foreground font-mono text-[11px]">
                                {item.number}
                              </span>
                            </span>
                            <span className="text-muted-foreground truncate text-xs">
                              {t(`attention.${item.kind}`, {
                                date: formatDate(item.at, locale, "dateTimeZone", timeZone),
                              })}
                              {" · "}
                              {item.customer}
                              {item.salesperson && !data.ownOnly ? ` · ${item.salesperson}` : ""}
                            </span>
                          </span>
                          {item.amount != null ? (
                            <span
                              className={cn(
                                "figure hidden shrink-0 text-sm sm:block",
                                item.kind === "balance_overdue"
                                  ? "text-destructive"
                                  : "text-warning-foreground",
                              )}
                            >
                              {money(item.amount)}
                            </span>
                          ) : null}
                          <ChevronRightIcon className="text-muted-foreground size-4 shrink-0 transition-transform group-hover:translate-x-0.5 rtl:rotate-180" />
                        </Link>
                      </li>
                    ))}
                  </ul>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <BuildingIcon className="text-muted-foreground size-4" />
                  {t("company.title")}
                </CardTitle>
                <CardDescription>
                  {t("company.description", { month: selectedMonth })}
                </CardDescription>
              </CardHeader>
              <CardContent className="grid gap-6">
                <dl className="divide-divider border-divider grid grid-cols-2 rounded-xl border md:grid-cols-4 md:divide-x rtl:md:divide-x-reverse max-md:[&>*:nth-child(-n+2)]:border-b max-md:[&>*:nth-child(odd)]:border-e">
                  <Stat
                    label={t("company.inStock")}
                    value={formatNumber(stockUnits, locale)}
                    hint={t("company.inStockHint")}
                    icon={CarFrontIcon}
                  />
                  <Stat
                    label={t("company.stockValue")}
                    value={compactMoney(stock.askingValue)}
                    hint={t("company.stockValueHint")}
                    icon={BanknoteIcon}
                  />
                  <Stat
                    label={t("company.added")}
                    value={formatNumber(month.addedUnits, locale)}
                    hint={t("company.addedHint", { month: monthLabel(data.monthKey) })}
                    icon={PackagePlusIcon}
                  />
                  <Stat
                    label={t("company.averagePrice")}
                    value={month.averagePrice == null ? "—" : compactMoney(month.averagePrice)}
                    hint={t("company.averagePriceHint", { count: month.soldUnits })}
                    icon={TagIcon}
                  />
                </dl>
                <StockPipeline
                  parts={[
                    {
                      key: "inTransit",
                      label: tRoot("inventory.status.acquired"),
                      units: stock.inTransit,
                      href: "/inventory?status=acquired",
                    },
                    {
                      key: "readyForSale",
                      label: tRoot("inventory.status.ready_for_sale"),
                      units: stock.readyForSale,
                      href: "/inventory?status=ready_for_sale",
                    },
                    {
                      key: "booked",
                      label: tRoot("inventory.status.reserved"),
                      units: stock.booked,
                      href: "/inventory?status=reserved",
                    },
                  ]}
                />
                {data.branches.length > 0 ? (
                  <div className="-mx-2 overflow-x-auto px-2">
                    <table className="w-full min-w-[34rem] text-sm">
                      <thead>
                        <tr className="text-muted-foreground border-b text-[0.6875rem] tracking-[0.1em] uppercase">
                          <th className="py-2.5 pe-3 text-start font-semibold">
                            {t("company.columns.branch")}
                          </th>
                          <th className="px-3 py-2.5 text-end font-semibold">
                            {tRoot("inventory.status.acquired")}
                          </th>
                          <th className="px-3 py-2.5 text-end font-semibold">
                            {tRoot("inventory.status.ready_for_sale")}
                          </th>
                          <th className="px-3 py-2.5 text-end font-semibold">
                            {tRoot("inventory.status.reserved")}
                          </th>
                          <th className="px-3 py-2.5 text-end font-semibold">
                            {t("company.columns.sold")}
                          </th>
                          {data.ownOnly ? null : (
                            <th className="py-2.5 ps-3 text-end font-semibold">
                              {t("company.columns.revenue")}
                            </th>
                          )}
                        </tr>
                      </thead>
                      <tbody className="divide-divider divide-y tabular-nums">
                        {data.branches.map((branch) => (
                          <tr key={branch.id}>
                            <td className="py-3 pe-3 font-medium">{branch.name}</td>
                            <td className="px-3 py-3 text-end">
                              {formatNumber(branch.inTransit, locale)}
                            </td>
                            <td className="px-3 py-3 text-end">
                              {formatNumber(branch.readyForSale, locale)}
                            </td>
                            <td className="px-3 py-3 text-end">
                              {formatNumber(branch.booked, locale)}
                            </td>
                            <td className="px-3 py-3 text-end">
                              {formatNumber(branch.soldUnits, locale)}
                            </td>
                            {data.ownOnly ? null : (
                              <td className="py-3 ps-3 text-end font-semibold">
                                {branch.revenue > 0 ? money(branch.revenue) : "—"}
                              </td>
                            )}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                ) : null}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <UsersIcon className="text-muted-foreground size-4" />
                  {data.ownOnly ? t("team.titleOwn") : t("team.title")}
                </CardTitle>
                <CardDescription>{t("team.description", { month: selectedMonth })}</CardDescription>
                <CardAction>
                  <Button
                    variant="ghost"
                    size="sm"
                    nativeButton={false}
                    render={<Link href="/bookings?filter=all" />}
                  >
                    {t("viewAll")}
                    <ChevronRightIcon className="rtl:rotate-180" />
                  </Button>
                </CardAction>
              </CardHeader>
              <CardContent>
                {data.team.length === 0 ? (
                  <p className="text-muted-foreground rounded-lg border border-dashed px-4 py-6 text-center text-sm">
                    {t("team.empty")}
                  </p>
                ) : (
                  <div className="-mx-2 overflow-x-auto px-2">
                    <table className="w-full min-w-[40rem] text-sm">
                      <thead>
                        <tr className="text-muted-foreground border-b text-[0.6875rem] tracking-[0.1em] uppercase">
                          <th className="py-2.5 pe-3 text-start font-semibold">
                            {t("team.columns.person")}
                          </th>
                          <th className="px-3 py-2.5 text-end font-semibold">
                            {t("team.columns.newBookings")}
                          </th>
                          <th className="px-3 py-2.5 text-end font-semibold">
                            {t("team.columns.sold")}
                          </th>
                          <th className="px-3 py-2.5 text-end font-semibold">
                            {t("team.columns.revenue")}
                          </th>
                          <th className="px-3 py-2.5 text-end font-semibold">
                            {t("team.columns.cancelled")}
                          </th>
                          <th className="px-3 py-2.5 text-end font-semibold">
                            {t("team.columns.active")}
                          </th>
                          <th className="py-2.5 ps-3 text-end font-semibold">
                            {t("team.columns.toCollect")}
                          </th>
                        </tr>
                      </thead>
                      <tbody className="divide-divider divide-y">
                        {data.team.map((row, index) => {
                          const top = !data.ownOnly && index === 0 && row.revenue > 0;
                          return (
                            <tr key={row.id} className="tabular-nums">
                              <td className="py-3 pe-3">
                                <span className="flex items-center gap-2.5">
                                  <span
                                    className={cn(
                                      "inline-flex size-8 shrink-0 items-center justify-center rounded-full text-[11px] font-semibold",
                                      top
                                        ? "bg-gold text-gold-foreground"
                                        : "bg-muted text-foreground/70",
                                    )}
                                  >
                                    {initials(row.name)}
                                  </span>
                                  <span className="truncate font-medium">{row.name}</span>
                                </span>
                              </td>
                              <td className="px-3 py-3 text-end">
                                {formatNumber(row.newBookings, locale)}
                              </td>
                              <td className="px-3 py-3 text-end">
                                {formatNumber(row.soldUnits, locale)}
                              </td>
                              <td className="px-3 py-3 text-end font-semibold">
                                {row.revenue > 0 ? money(row.revenue) : "—"}
                              </td>
                              <td
                                className={cn(
                                  "px-3 py-3 text-end",
                                  row.cancelled > 0 && "text-destructive",
                                )}
                              >
                                {formatNumber(row.cancelled, locale)}
                              </td>
                              <td className="px-3 py-3 text-end">
                                {formatNumber(row.active, locale)}
                              </td>
                              <td
                                className={cn(
                                  "py-3 ps-3 text-end",
                                  row.toCollect > 0 && "text-warning-foreground",
                                )}
                              >
                                {row.toCollect > 0 ? money(row.toCollect) : "—"}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                )}
              </CardContent>
            </Card>
          </div>

          {/* Side column: shortcuts, how bookings ended, what happened, how old the stock is. */}
          <div className="grid min-w-0 gap-6 xl:col-span-4">
            <QuickActions />
            <Card>
              <CardHeader>
                <CardTitle>{t("outcomes.title")}</CardTitle>
                <CardDescription>
                  {t("outcomes.description", { month: selectedMonth })}
                </CardDescription>
              </CardHeader>
              <CardContent>
                <OutcomeDonut
                  centerValue={conversion == null ? "—" : `${conversion}%`}
                  centerLabel={t("outcomes.conversion")}
                  parts={[
                    { key: "sold", label: t("outcomes.sold"), value: outcomes.sold },
                    { key: "active", label: t("outcomes.active"), value: outcomes.active },
                    { key: "cancelled", label: t("outcomes.cancelled"), value: outcomes.cancelled },
                  ]}
                />
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>{t("activity.title")}</CardTitle>
                <CardDescription>
                  {t("activity.description", { month: selectedMonth })}
                </CardDescription>
              </CardHeader>
              <CardContent>
                {data.activity.length === 0 ? (
                  <EmptyState
                    icon={CalendarCheckIcon}
                    title={isCurrentMonth ? t("activity.emptyCurrent") : t("activity.empty")}
                    className="py-10"
                  />
                ) : (
                  // A timeline: one rail, a node per event.
                  <ol className="relative grid gap-1 before:absolute before:inset-y-3 before:start-[0.9375rem] before:w-px before:bg-[var(--divider)]">
                    {data.activity.map((item) => {
                      const style = ACTIVITY_STYLE[item.kind];
                      const Icon = style.icon;
                      return (
                        <li key={`${item.kind}-${item.number}`} className="relative">
                          <Link
                            href={bookingHref(item.number)}
                            className="hover:bg-muted/50 -mx-1.5 flex items-start gap-3 rounded-lg px-1.5 py-2 transition-colors"
                          >
                            <span
                              className={cn(
                                "ring-card relative flex size-[1.875rem] shrink-0 items-center justify-center rounded-full ring-4",
                                style.className,
                              )}
                            >
                              <Icon className="size-3.5" aria-hidden />
                            </span>
                            <span className="grid min-w-0 flex-1 gap-0.5">
                              <span className="text-sm leading-snug">
                                {t(`activity.${item.auto ? "autoCancelled" : item.kind}`, {
                                  person: item.salesperson ?? "—",
                                  vehicle: item.vehicle,
                                })}
                              </span>
                              <span className="text-muted-foreground truncate text-xs">
                                <span className="font-mono">{item.number}</span> · {item.customer} ·{" "}
                                {formatDate(item.at, locale, "short", timeZone)}
                              </span>
                            </span>
                            {item.amount != null ? (
                              <span className="figure text-muted-foreground shrink-0 text-xs">
                                {compactMoney(item.amount)}
                              </span>
                            ) : null}
                          </Link>
                        </li>
                      );
                    })}
                  </ol>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <ShipIcon className="text-muted-foreground size-4" />
                  {t("age.title")}
                </CardTitle>
                <CardDescription>{t("age.description")}</CardDescription>
              </CardHeader>
              <CardContent>
                <HorizontalBars
                  rows={stock.age.map((band) => ({
                    key: band.key,
                    label: t(`agingBands.${band.key}`),
                    value: band.units,
                    display: t("age.units", { count: band.units }),
                    barClassName: AGE_BARS[band.key],
                  }))}
                />
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    </div>
  );
}

/** Create shortcuts and section links — only the ones this user's permissions allow. */
function QuickActions() {
  const t = useTranslations();
  const { can } = usePermission();
  const creates = quickActions.filter((action) => can(action.permission));
  const links = [
    {
      href: "/inventory",
      label: t("nav.inventory"),
      icon: CarFrontIcon,
      allowed: can("vehicle.view"),
    },
    {
      href: "/bookings",
      label: t("nav.bookings"),
      icon: CalendarCheckIcon,
      allowed: can("reservation.view"),
    },
    {
      href: "/customers",
      label: t("nav.customers"),
      icon: UsersIcon,
      allowed: can("customer.view"),
    },
  ].filter((link) => link.allowed);
  if (creates.length === 0 && links.length === 0) return null;

  return (
    <Card className="gradient-card">
      <CardHeader>
        <CardTitle>{t("quick.title")}</CardTitle>
        <CardDescription>{t("quick.description")}</CardDescription>
      </CardHeader>
      <CardContent className="grid gap-4">
        {creates.length > 0 ? (
          <div className="grid grid-cols-3 gap-2">
            {creates.map((action) => (
              <Link
                key={action.href}
                href={action.href}
                className="bg-card hover:border-brand/45 focus-visible:ring-ring grid justify-items-center gap-2 rounded-xl border px-2 py-3 text-center text-xs font-medium shadow-xs transition-[border-color,box-shadow] duration-150 outline-none hover:shadow-md focus-visible:ring-2"
              >
                <span className="gradient-champagne text-gold-foreground flex size-9 items-center justify-center rounded-full">
                  <action.icon className="size-4" aria-hidden />
                </span>
                <span className="leading-tight">{t(action.labelKey)}</span>
              </Link>
            ))}
          </div>
        ) : null}
        {links.length > 0 ? (
          <ul className="divide-divider bg-card grid divide-y rounded-xl border">
            {links.map((link) => (
              <li key={link.href}>
                <Link
                  href={link.href}
                  className="group hover:bg-muted/50 flex items-center gap-3 px-3.5 py-2.5 text-sm font-medium transition-colors"
                >
                  <link.icon className="text-brand size-4 shrink-0" aria-hidden />
                  <span className="flex-1">{link.label}</span>
                  <ChevronRightIcon className="text-muted-foreground size-4 transition-transform group-hover:translate-x-0.5 rtl:rotate-180" />
                </Link>
              </li>
            ))}
          </ul>
        ) : null}
      </CardContent>
    </Card>
  );
}

function initials(name: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "—";
  return (
    parts.length > 1 ? `${parts[0][0]}${parts.at(-1)![0]}` : parts[0].slice(0, 2)
  ).toUpperCase();
}

function Stat({
  label,
  value,
  hint,
  icon: Icon,
}: {
  label: string;
  value: string;
  hint?: string;
  icon?: typeof TagIcon;
}) {
  return (
    <div className="grid min-w-0 content-start gap-1.5 p-4">
      <dt className="text-muted-foreground flex min-w-0 items-center gap-1.5 text-xs">
        {Icon ? <Icon className="size-3.5 shrink-0" aria-hidden /> : null}
        <span className="truncate">{label}</span>
      </dt>
      <dd className="figure text-xl">{value}</dd>
      {hint ? <dd className="text-subtle-foreground truncate text-[11px]">{hint}</dd> : null}
    </div>
  );
}

/** One column of the hero band's ribbon (on the obsidian panel in both themes). */
function HeroMetric({
  label,
  value,
  hint,
  icon: Icon,
  alert = null,
}: {
  label: string;
  value: string;
  hint?: string;
  icon: typeof TagIcon;
  alert?: "danger" | "warning" | null;
}) {
  return (
    <div className="grid min-w-0 grid-cols-[minmax(0,1fr)_auto] items-end gap-x-4 gap-y-1 border-white/10 px-5 py-4 not-first:max-sm:border-t sm:grid-cols-1 sm:content-between sm:items-stretch sm:gap-4 sm:p-6 sm:not-first:border-s">
      <dt className="text-sidebar-foreground/60 flex items-center gap-2 text-xs font-medium">
        <Icon className="text-sidebar-primary size-4 shrink-0" aria-hidden />
        <span className="truncate">{label}</span>
      </dt>
      <dd className="min-w-0 max-sm:row-span-2 max-sm:text-end">
        <p className="figure truncate text-[1.375rem] text-white sm:text-[1.75rem]">{value}</p>
        {hint ? (
          <p
            className={cn(
              "mt-1 flex items-center gap-1.5 truncate text-xs",
              alert === "danger"
                ? "text-[#f0a3a3]"
                : alert === "warning"
                  ? "text-[#e8c486]"
                  : "text-sidebar-foreground/55",
            )}
          >
            {alert ? (
              <span
                className={cn(
                  "size-1.5 shrink-0 rounded-full",
                  alert === "danger" ? "bg-[#dc6a6a]" : "bg-[#d9a458]",
                )}
                aria-hidden
              />
            ) : null}
            <span className="truncate">{hint}</span>
          </p>
        ) : null}
      </dd>
    </div>
  );
}
