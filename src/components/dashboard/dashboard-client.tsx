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

import { KpiCard } from "@/components/cards/kpi-card";
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
import { useViewerTimeZone } from "@/hooks/use-viewer-time-zone";
import { bookingHref } from "@/lib/bookings/routes";
import type { ActivityItem, DashboardData } from "@/lib/dashboard/service";
import { Link, usePathname, useRouter } from "@/lib/i18n/navigation";
import { cn } from "@/lib/utils";
import { formatCurrency, formatNumber } from "@/lib/utils/currency";
import { formatDate } from "@/lib/utils/date";

const AGE_BARS = {
  fresh: "bg-emerald-500",
  mid: "bg-gold",
  aging: "bg-orange-500",
  old: "bg-rose-500",
} as const;

const ACTIVITY_STYLE: Record<
  ActivityItem["kind"],
  { icon: typeof CalendarPlusIcon; className: string }
> = {
  created: {
    icon: CalendarPlusIcon,
    className: "bg-sky-600/10 text-sky-700 dark:bg-sky-400/12 dark:text-sky-300",
  },
  sold: {
    icon: TagIcon,
    className: "bg-emerald-600/10 text-emerald-700 dark:bg-emerald-400/12 dark:text-emerald-300",
  },
  cancelled: {
    icon: CircleXIcon,
    className: "bg-rose-600/10 text-rose-700 dark:bg-rose-400/12 dark:text-rose-300",
  },
};

export function DashboardClient({
  data,
  userName,
}: {
  data: DashboardData;
  userName: string;
}) {
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
                        <span className="bg-brand-soft text-brand rounded-full px-1.5 py-0.5 text-[10px] font-medium">
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
        {/* Headline numbers for the selected month */}
        <div className="stagger grid grid-cols-2 gap-3 [--stagger:60ms] xl:grid-cols-4">
          <KpiCard
            label={
              data.ownOnly
                ? t("kpis.mySales", { month: selectedMonth })
                : t("kpis.sales", { month: selectedMonth })
            }
            value={compactMoney(month.revenue)}
            icon={change != null && change < 0 ? TrendingDownIcon : TrendingUpIcon}
            tone="brand"
            hint={
              change == null
                ? t("kpis.soldUnits", { count: month.soldUnits })
                : t("kpis.soldChange", {
                    count: month.soldUnits,
                    change: `${change >= 0 ? "+" : ""}${Math.round(change * 100)}%`,
                  })
            }
          />
          <KpiCard
            label={t("kpis.newBookings")}
            value={formatNumber(month.newBookings, locale)}
            icon={CalendarPlusIcon}
            tone="info"
            hint={t("kpis.newBookingsHint", {
              value: compactMoney(month.newBookingsValue),
              cancelled: month.cancelled,
            })}
          />
          <KpiCard
            label={t("kpis.activeBookings")}
            value={formatNumber(bookings.active, locale)}
            icon={CalendarCheckIcon}
            tone="violet"
            hint={t("kpis.activeValue", { value: compactMoney(bookings.activeValue) })}
          />
          <KpiCard
            label={t("kpis.toCollect")}
            value={compactMoney(bookings.toCollect)}
            icon={BanknoteIcon}
            tone={
              bookings.balanceOverdue > 0
                ? "danger"
                : bookings.awaitingDeposit > 0
                  ? "warning"
                  : "neutral"
            }
            hint={
              bookings.balanceOverdue > 0
                ? t("kpis.overdueCount", { count: bookings.balanceOverdue })
                : t("kpis.awaitingDeposit", { count: bookings.awaitingDeposit })
            }
          />
        </div>

        {/* Sales trend and how the month's bookings ended */}
        <div className="grid gap-4 lg:grid-cols-3">
          <Card className="lg:col-span-2">
            <CardHeader>
              <CardTitle>{data.ownOnly ? t("sales.titleOwn") : t("sales.title")}</CardTitle>
              <CardDescription>{t("sales.description", { month: selectedMonth })}</CardDescription>
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
        </div>

        {/* Sales executives' activity */}
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
                    <tr className="text-muted-foreground border-b text-xs">
                      <th className="py-2 pe-3 text-start font-medium">
                        {t("team.columns.person")}
                      </th>
                      <th className="px-3 py-2 text-end font-medium">
                        {t("team.columns.newBookings")}
                      </th>
                      <th className="px-3 py-2 text-end font-medium">{t("team.columns.sold")}</th>
                      <th className="px-3 py-2 text-end font-medium">
                        {t("team.columns.revenue")}
                      </th>
                      <th className="px-3 py-2 text-end font-medium">
                        {t("team.columns.cancelled")}
                      </th>
                      <th className="px-3 py-2 text-end font-medium">{t("team.columns.active")}</th>
                      <th className="py-2 ps-3 text-end font-medium">
                        {t("team.columns.toCollect")}
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y">
                    {data.team.map((row, index) => {
                      const top = !data.ownOnly && index === 0 && row.revenue > 0;
                      return (
                        <tr key={row.id} className="tabular-nums">
                          <td className="py-2.5 pe-3">
                            <span className="flex items-center gap-2">
                              <span
                                className={cn(
                                  "inline-flex size-7 shrink-0 items-center justify-center rounded-full text-[11px] font-semibold",
                                  top
                                    ? "bg-brand text-brand-foreground"
                                    : "bg-muted text-foreground/70",
                                )}
                              >
                                {initials(row.name)}
                              </span>
                              <span className="truncate font-medium">{row.name}</span>
                            </span>
                          </td>
                          <td className="px-3 py-2.5 text-end">
                            {formatNumber(row.newBookings, locale)}
                          </td>
                          <td className="px-3 py-2.5 text-end">
                            {formatNumber(row.soldUnits, locale)}
                          </td>
                          <td className="px-3 py-2.5 text-end font-semibold">
                            {row.revenue > 0 ? money(row.revenue) : "—"}
                          </td>
                          <td
                            className={cn(
                              "px-3 py-2.5 text-end",
                              row.cancelled > 0 && "text-destructive",
                            )}
                          >
                            {formatNumber(row.cancelled, locale)}
                          </td>
                          <td className="px-3 py-2.5 text-end">
                            {formatNumber(row.active, locale)}
                          </td>
                          <td
                            className={cn(
                              "py-2.5 ps-3 text-end",
                              row.toCollect > 0 && "text-amber-700 dark:text-amber-400",
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

        {/* Company stock and sales */}
        <div className="grid gap-4 lg:grid-cols-3">
          <Card className="lg:col-span-2">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <BuildingIcon className="text-muted-foreground size-4" />
                {t("company.title")}
              </CardTitle>
              <CardDescription>
                {t("company.description", { month: selectedMonth })}
              </CardDescription>
            </CardHeader>
            <CardContent className="grid gap-5">
              <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
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
              </div>
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
                      <tr className="text-muted-foreground border-b text-xs">
                        <th className="py-2 pe-3 text-start font-medium">
                          {t("company.columns.branch")}
                        </th>
                        <th className="px-3 py-2 text-end font-medium">
                          {tRoot("inventory.status.acquired")}
                        </th>
                        <th className="px-3 py-2 text-end font-medium">
                          {tRoot("inventory.status.ready_for_sale")}
                        </th>
                        <th className="px-3 py-2 text-end font-medium">
                          {tRoot("inventory.status.reserved")}
                        </th>
                        <th className="px-3 py-2 text-end font-medium">
                          {t("company.columns.sold")}
                        </th>
                        {data.ownOnly ? null : (
                          <th className="py-2 ps-3 text-end font-medium">
                            {t("company.columns.revenue")}
                          </th>
                        )}
                      </tr>
                    </thead>
                    <tbody className="divide-y tabular-nums">
                      {data.branches.map((branch) => (
                        <tr key={branch.id}>
                          <td className="py-2.5 pe-3 font-medium">{branch.name}</td>
                          <td className="px-3 py-2.5 text-end">
                            {formatNumber(branch.inTransit, locale)}
                          </td>
                          <td className="px-3 py-2.5 text-end">
                            {formatNumber(branch.readyForSale, locale)}
                          </td>
                          <td className="px-3 py-2.5 text-end">
                            {formatNumber(branch.booked, locale)}
                          </td>
                          <td className="px-3 py-2.5 text-end">
                            {formatNumber(branch.soldUnits, locale)}
                          </td>
                          {data.ownOnly ? null : (
                            <td className="py-2.5 ps-3 text-end font-semibold">
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
                <ol className="grid gap-3">
                  {data.activity.map((item) => {
                    const style = ACTIVITY_STYLE[item.kind];
                    const Icon = style.icon;
                    return (
                      <li key={`${item.kind}-${item.number}`}>
                        <Link
                          href={bookingHref(item.number)}
                          className="hover:bg-muted/40 -mx-2 flex items-start gap-3 rounded-lg px-2 py-1.5 transition-colors"
                        >
                          <span
                            className={cn(
                              "mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-lg",
                              style.className,
                            )}
                          >
                            <Icon className="size-4" aria-hidden />
                          </span>
                          <span className="grid min-w-0 flex-1 gap-0.5">
                            <span className="text-sm">
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
                            <span className="text-muted-foreground shrink-0 text-xs font-medium tabular-nums">
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
        </div>

        {/* Follow-ups and stock age */}
        <div className="grid gap-4 lg:grid-cols-3">
          <Card className="lg:col-span-2">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <CircleAlertIcon className="size-4 text-amber-600 dark:text-amber-400" />
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
                </Button>
              </CardAction>
            </CardHeader>
            <CardContent>
              {data.attention.length === 0 ? (
                <p className="text-muted-foreground rounded-lg border border-dashed px-4 py-6 text-center text-sm">
                  {t("attention.empty")}
                </p>
              ) : (
                <ul className="grid gap-2">
                  {data.attention.map((item) => (
                    <li key={`${item.kind}-${item.number}`}>
                      <Link
                        href={bookingHref(item.number)}
                        className="group hover:border-foreground/20 hover:bg-muted/40 flex items-center gap-3 rounded-xl border px-3 py-2.5 transition-colors"
                      >
                        <span
                          className={cn(
                            "flex size-9 shrink-0 items-center justify-center rounded-lg",
                            item.kind === "balance_overdue"
                              ? "bg-destructive/12 text-destructive"
                              : "bg-amber-500/15 text-amber-700 dark:text-amber-400",
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
                              "hidden shrink-0 text-sm font-semibold tabular-nums sm:block",
                              item.kind === "balance_overdue"
                                ? "text-destructive"
                                : "text-amber-700 dark:text-amber-400",
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
    <div className="bg-muted/40 grid min-w-0 content-start gap-1 rounded-lg border px-3 py-2.5">
      <span className="text-muted-foreground flex min-w-0 items-center gap-1.5 text-xs">
        {Icon ? <Icon className="size-3.5 shrink-0" aria-hidden /> : null}
        <span className="truncate">{label}</span>
      </span>
      <span className="font-heading text-lg font-semibold tabular-nums">{value}</span>
      {hint ? <span className="text-muted-foreground truncate text-[11px]">{hint}</span> : null}
    </div>
  );
}
