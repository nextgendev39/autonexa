import "server-only";

import { appConfig } from "@/config/app";
import { listBookings, listSalesExecutives, type BookingListItem } from "@/lib/bookings/service";
import { canViewAllBookings } from "@/lib/permissions/roles";
import { createClient } from "@/lib/supabase/server";
import type { UserContext } from "@/types/auth";

export type MonthPoint = { month: string; revenue: number; units: number };
export type AgeBand = { key: "fresh" | "mid" | "aging" | "old"; units: number };
export type AttentionItem = {
  number: string;
  vehicle: string;
  customer: string;
  salesperson: string | null;
  kind: "deposit_due" | "balance_overdue" | "balance_due_soon";
  at: string;
  amount: number | null;
  currency: string;
};
/** One sales executive's activity in the selected month. */
export type TeamMember = {
  id: string;
  name: string;
  newBookings: number;
  soldUnits: number;
  revenue: number;
  cancelled: number;
  /** Current, not limited to the month. */
  active: number;
  toCollect: number;
};
export type ActivityItem = {
  kind: "created" | "sold" | "cancelled";
  at: string;
  number: string;
  vehicle: string;
  customer: string;
  salesperson: string | null;
  amount: number | null;
  currency: string;
  /** Cancelled by the system because no deposit arrived. */
  auto: boolean;
};
export type BranchSummary = {
  id: string;
  name: string;
  inTransit: number;
  readyForSale: number;
  booked: number;
  soldUnits: number;
  revenue: number;
};

export type DashboardData = {
  /** True when the sales numbers cover only the signed-in user's own bookings. */
  ownOnly: boolean;
  currency: string;
  /** Selected month ("2026-10") and the months that can be picked, newest first. */
  monthKey: string;
  months: string[];
  stock: {
    inTransit: number;
    readyForSale: number;
    booked: number;
    /** Asking price × units for unsold stock (in transit + ready + booked). */
    askingValue: number;
    age: AgeBand[];
  };
  month: {
    soldUnits: number;
    revenue: number;
    /** Same figures for the month before, for the change badge. */
    previousRevenue: number;
    previousUnits: number;
    newBookings: number;
    newBookingsValue: number;
    cancelled: number;
    /** Units that entered stock this month. */
    addedUnits: number;
    /** Revenue ÷ units sold. */
    averagePrice: number | null;
  };
  bookings: {
    active: number;
    activeValue: number;
    /** Still to collect on active and sold bookings. */
    toCollect: number;
    awaitingDeposit: number;
    balanceOverdue: number;
  };
  /** Bookings made in the selected month, by what happened to them. */
  outcomes: { sold: number; active: number; cancelled: number };
  /** Six months ending with the selected one. */
  salesByMonth: MonthPoint[];
  attention: AttentionItem[];
  /** Bookings created, sold and cancelled in the selected month, newest first. */
  activity: ActivityItem[];
  team: TeamMember[];
  branches: BranchSummary[];
};

const monthFormat = new Intl.DateTimeFormat("en-CA", {
  timeZone: appConfig.timezone,
  year: "numeric",
  month: "2-digit",
});
/** "2026-10" in the dealership's time zone. */
const keyOf = (date: Date | string) =>
  monthFormat.format(typeof date === "string" ? new Date(date) : date).slice(0, 7);

/** `count` month keys ending with `last`, oldest first. */
function monthsEnding(last: string, count: number) {
  const [year, month] = last.split("-").map(Number);
  return Array.from({ length: count }, (_, i) => {
    const d = new Date(Date.UTC(year, month - 1 - (count - 1 - i), 1));
    return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
  });
}

const outstandingOf = (b: BookingListItem) =>
  b.totalPrice == null ? 0 : Math.max(0, b.totalPrice - b.deposit - (b.balanceReceived ?? 0));

const DAY = 86_400_000;
const PICKABLE_MONTHS = 12;

/** The month to show: `requested` when it's one of the last 12 months, else the current month. */
export function resolveDashboardMonth(requested?: string | null) {
  const months = monthsEnding(keyOf(new Date()), PICKABLE_MONTHS).reverse();
  const monthKey = requested && months.includes(requested) ? requested : months[0];
  return { monthKey, months };
}

type VehicleRow = {
  id: string;
  split_from_id: string | null;
  status: string;
  quantity: number | null;
  current_selling_price: number | string | null;
  purchase_date: string | null;
  created_at: string;
  branch_id: string;
};

export async function getDashboard(context: UserContext, requestedMonth?: string | null): Promise<DashboardData> {
  const { monthKey, months } = resolveDashboardMonth(requestedMonth);
  const allBookings = canViewAllBookings(context.roles);
  const supabase = await createClient();
  const [bookingsResult, vehiclesResult, branchesResult, salesExecutives] = await Promise.all([
    listBookings(context),
    supabase
      .from("vehicles")
      .select("id, split_from_id, status, quantity, current_selling_price, purchase_date, created_at, branch_id")
      .is("deleted_at", null),
    supabase.from("branches").select("id, name").order("name"),
    allBookings ? listSalesExecutives() : Promise.resolve([]),
  ]);
  // Sales executives only see their own figures: a booking they created for a colleague's
  // customer belongs to that colleague, so it stays off this dashboard.
  const bookings = (bookingsResult.data ?? []).filter(
    (b) =>
      allBookings ||
      b.salesperson?.id === context.userId ||
      (!b.salesperson && b.createdBy === context.userId),
  );
  const vehicles = (vehiclesResult.data ?? []) as VehicleRow[];
  const branchNames = new Map(
    ((branchesResult.data ?? []) as { id: string; name: string }[]).map((b) => [b.id, b.name]),
  );
  const inMonth = (at: string | null | undefined) => !!at && keyOf(at) === monthKey;

  // ---- Stock and branches ---------------------------------------------------
  const now = Date.now();
  const stock = { inTransit: 0, readyForSale: 0, booked: 0, askingValue: 0 };
  const age: Record<AgeBand["key"], number> = { fresh: 0, mid: 0, aging: 0, old: 0 };
  const branches = new Map<string, BranchSummary>();
  const branchRow = (id: string) => {
    if (!branches.has(id)) {
      branches.set(id, {
        id,
        name: branchNames.get(id) ?? "—",
        inTransit: 0,
        readyForSale: 0,
        booked: 0,
        soldUnits: 0,
        revenue: 0,
      });
    }
    return branches.get(id)!;
  };
  // Split records (units moved off a multi-unit record) entered stock with the original.
  const byId = new Map(vehicles.map((v) => [v.id, v]));
  const rootOf = (v: VehicleRow) => {
    let current = v;
    for (let depth = 0; current.split_from_id && depth < 50; depth++) {
      const parent = byId.get(current.split_from_id);
      if (!parent) break;
      current = parent;
    }
    return current;
  };
  let addedUnits = 0;
  for (const row of vehicles) {
    const units = row.quantity ?? 1;
    const root = rootOf(row);
    if (inMonth(root.purchase_date ?? root.created_at)) addedUnits += units;
    if (!["acquired", "ready_for_sale", "reserved"].includes(row.status)) continue;
    const branch = branchRow(row.branch_id);
    if (row.status === "acquired") {
      stock.inTransit += units;
      branch.inTransit += units;
    }
    if (row.status === "ready_for_sale") {
      stock.readyForSale += units;
      branch.readyForSale += units;
    }
    if (row.status === "reserved") {
      stock.booked += units;
      branch.booked += units;
    }
    if (row.current_selling_price != null) stock.askingValue += Number(row.current_selling_price) * units;
    const days = (now - new Date(root.purchase_date ?? root.created_at).getTime()) / DAY;
    age[days <= 30 ? "fresh" : days <= 60 ? "mid" : days <= 90 ? "aging" : "old"] += units;
  }

  // ---- Sales by month (by the date the booking was marked sold) -------------
  const chartMonths = monthsEnding(monthKey, 6);
  const byMonth = new Map(chartMonths.map((m) => [m, { month: m, revenue: 0, units: 0 }]));
  const sold = bookings.filter((b) => b.status === "converted" && b.soldAt);
  for (const b of sold) {
    const point = byMonth.get(keyOf(b.soldAt!));
    if (!point) continue;
    point.revenue += b.totalPrice ?? 0;
    point.units += b.units;
  }
  const salesByMonth = [...byMonth.values()];
  const thisMonth = salesByMonth.at(-1)!;
  const lastMonth = salesByMonth.at(-2)!;
  const soldInMonth = sold.filter((b) => inMonth(b.soldAt));
  for (const b of soldInMonth) {
    const branch = branchRow(b.branchId);
    branch.soldUnits += b.units;
    branch.revenue += b.totalPrice ?? 0;
  }

  // ---- Bookings ------------------------------------------------------------
  const active = bookings.filter((b) => b.status === "active");
  const createdInMonth = bookings.filter((b) => inMonth(b.reservedAt));
  const cancelledInMonth = bookings.filter((b) => b.status === "cancelled" && inMonth(b.cancelledAt));

  const attention: AttentionItem[] = [];
  for (const b of bookings) {
    const base = {
      number: b.number,
      vehicle: b.vehicle?.title ?? "—",
      customer: b.customer?.name ?? "—",
      salesperson: b.salesperson?.name ?? null,
      currency: b.currency,
    };
    if (b.depositDueAt) {
      attention.push({ ...base, kind: "deposit_due", at: b.depositDueAt, amount: null });
    } else if (b.balanceOverdue && b.balanceDueAt) {
      attention.push({ ...base, kind: "balance_overdue", at: b.balanceDueAt, amount: outstandingOf(b) });
    } else if (b.balanceDueAt && new Date(b.balanceDueAt).getTime() - now < 2 * DAY) {
      attention.push({ ...base, kind: "balance_due_soon", at: b.balanceDueAt, amount: outstandingOf(b) });
    }
  }
  // Overdue first, then whatever is due soonest.
  const rank = { balance_overdue: 0, deposit_due: 1, balance_due_soon: 2 } as const;
  attention.sort((a, b) => rank[a.kind] - rank[b.kind] || a.at.localeCompare(b.at));

  // ---- Activity feed ----------------------------------------------------------
  const activity: ActivityItem[] = [];
  for (const b of bookings) {
    const base = {
      number: b.number,
      vehicle: b.vehicle?.title ?? "—",
      customer: b.customer?.name ?? "—",
      salesperson: b.salesperson?.name ?? null,
      amount: b.totalPrice,
      currency: b.currency,
      auto: false,
    };
    if (inMonth(b.reservedAt)) activity.push({ ...base, kind: "created", at: b.reservedAt });
    if (b.status === "converted" && inMonth(b.soldAt)) activity.push({ ...base, kind: "sold", at: b.soldAt! });
    if (b.status === "cancelled" && inMonth(b.cancelledAt)) {
      activity.push({ ...base, kind: "cancelled", at: b.cancelledAt!, auto: b.autoCancelled });
    }
  }
  activity.sort((a, b) => b.at.localeCompare(a.at));

  // ---- Sales team (selected month) -------------------------------------------
  const team = new Map<string, TeamMember>();
  const member = (id: string, name: string) => {
    if (!team.has(id)) {
      team.set(id, { id, name, newBookings: 0, soldUnits: 0, revenue: 0, cancelled: 0, active: 0, toCollect: 0 });
    }
    return team.get(id)!;
  };
  // Everyone on the team is listed, including those with nothing yet this month.
  for (const person of salesExecutives) member(person.id, person.name);
  if (!allBookings) member(context.userId, context.displayName);
  for (const b of bookings) {
    const owner = b.salesperson ?? (allBookings ? null : { id: context.userId, name: context.displayName });
    if (!owner) continue;
    const row = member(owner.id, owner.name);
    if (inMonth(b.reservedAt)) row.newBookings += 1;
    if (b.status === "converted" && inMonth(b.soldAt)) {
      row.soldUnits += b.units;
      row.revenue += b.totalPrice ?? 0;
    }
    if (b.status === "cancelled" && inMonth(b.cancelledAt)) row.cancelled += 1;
    if (b.status === "active") row.active += 1;
    if (b.status === "active" || b.status === "converted") row.toCollect += outstandingOf(b);
  }

  return {
    ownOnly: !allBookings,
    currency: bookings[0]?.currency ?? appConfig.currency,
    monthKey,
    months,
    stock: {
      ...stock,
      age: (["fresh", "mid", "aging", "old"] as const).map((key) => ({ key, units: age[key] })),
    },
    month: {
      soldUnits: thisMonth.units,
      revenue: thisMonth.revenue,
      previousRevenue: lastMonth.revenue,
      previousUnits: lastMonth.units,
      newBookings: createdInMonth.length,
      newBookingsValue: createdInMonth.reduce((sum, b) => sum + (b.totalPrice ?? 0), 0),
      cancelled: cancelledInMonth.length,
      addedUnits,
      averagePrice: thisMonth.units > 0 ? thisMonth.revenue / thisMonth.units : null,
    },
    bookings: {
      active: active.length,
      activeValue: active.reduce((sum, b) => sum + (b.totalPrice ?? 0), 0),
      toCollect: bookings
        .filter((b) => b.status === "active" || b.status === "converted")
        .reduce((sum, b) => sum + outstandingOf(b), 0),
      awaitingDeposit: active.filter((b) => b.depositDueAt).length,
      balanceOverdue: bookings.filter((b) => b.balanceOverdue).length,
    },
    outcomes: {
      sold: createdInMonth.filter((b) => b.status === "converted").length,
      active: createdInMonth.filter((b) => b.status === "active").length,
      cancelled: createdInMonth.filter((b) => b.status === "cancelled" || b.status === "expired").length,
    },
    salesByMonth,
    attention: attention.slice(0, 6),
    activity: activity.slice(0, 8),
    team: [...team.values()].sort(
      (a, b) => b.revenue - a.revenue || b.soldUnits - a.soldUnits || b.newBookings - a.newBookings || a.name.localeCompare(b.name),
    ),
    branches: [...branches.values()].sort((a, b) => a.name.localeCompare(b.name)),
  };
}
