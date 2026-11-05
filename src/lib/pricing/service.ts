import { createClient } from "@/lib/supabase/server";
import { hasPermission } from "@/lib/permissions";
import { seesSalesPricingOnly } from "@/lib/permissions/roles";
import type { UserContext } from "@/types/auth";
import {
  maxDiscountPercentFrom,
  type ApprovePricingValues,
  type PricingListQuery,
  type UpsertPricingValues,
} from "@/lib/validation/pricing";
import type {
  PricingListItem,
  PricingListResult,
  PricingStatus,
  VehicleCostBreakdown,
  VehiclePricing,
  VehiclePricingDetail,
  VehiclePricingHistoryItem,
  VehicleProfitability,
  PricingChangeReason,
} from "@/types/pricing";

export type PricingServiceError = {
  code: "not_found" | "forbidden" | "validation" | "conflict" | "unknown";
  message: string;
};

export type ServiceResult<T> =
  { data: T; error: null } | { data: null; error: PricingServiceError };

function mapDbError(error: { message?: string }): PricingServiceError {
  const message = (error.message ?? "").toLowerCase();
  if (message.includes("not authorized") || message.includes("permission")) {
    return { code: "forbidden", message: "You do not have permission to perform this action." };
  }
  if (message.includes("vehicle not found") || message.includes("pricing not found")) {
    return { code: "not_found", message: "Vehicle pricing was not found." };
  }
  if (
    message.includes("cannot be negative") ||
    message.includes("cannot exceed") ||
    message.includes("override reason") ||
    message.includes("must be between")
  ) {
    return { code: "validation", message: error.message ?? "Invalid pricing values." };
  }
  if (message.includes("not awaiting approval")) {
    return { code: "conflict", message: "Pricing is not awaiting approval." };
  }
  return { code: "unknown", message: "Unable to complete the pricing request." };
}

function mapPricing(row: Record<string, unknown>): VehiclePricing {
  return {
    id: String(row.id),
    vehicleId: String(row.vehicle_id),
    minimumSellingPrice:
      row.minimum_selling_price == null ? null : Number(row.minimum_selling_price),
    targetSellingPrice: row.target_selling_price == null ? null : Number(row.target_selling_price),
    advertisedPrice: row.advertised_price == null ? null : Number(row.advertised_price),
    currentSellingPrice:
      row.current_selling_price == null ? null : Number(row.current_selling_price),
    maximumDiscountAmount:
      row.maximum_discount_amount == null ? null : Number(row.maximum_discount_amount),
    maximumDiscountPercent:
      row.maximum_discount_percent == null ? null : Number(row.maximum_discount_percent),
    pricingStatus: row.pricing_status as PricingStatus,
    pricingNotes: (row.pricing_notes as string | null) ?? null,
    changeReason: (row.change_reason as PricingChangeReason | null) ?? null,
    changeNotes: (row.change_notes as string | null) ?? null,
    overrideMinimum: Boolean(row.override_minimum),
    overrideReason: (row.override_reason as string | null) ?? null,
    approvedBy: (row.approved_by as string | null) ?? null,
    approvedAt: (row.approved_at as string | null) ?? null,
    effectiveFrom: String(row.effective_from),
    createdBy: (row.created_by as string | null) ?? null,
    updatedBy: (row.updated_by as string | null) ?? null,
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at),
  };
}

function mapProfitability(raw: Record<string, unknown>): VehicleProfitability {
  return {
    vehicleId: String(raw.vehicleId ?? ""),
    currency: String(raw.currency ?? "AED"),
    purchaseCost: raw.purchaseCost == null ? null : Number(raw.purchaseCost),
    acquisitionExpenses: raw.acquisitionExpenses == null ? null : Number(raw.acquisitionExpenses),
    workshopCost: raw.workshopCost == null ? null : Number(raw.workshopCost),
    otherVehicleCosts: raw.otherVehicleCosts == null ? null : Number(raw.otherVehicleCosts),
    totalVehicleCost: raw.totalVehicleCost == null ? null : Number(raw.totalVehicleCost),
    minimumSellingPrice: raw.minimumSellingPrice == null ? null : Number(raw.minimumSellingPrice),
    targetSellingPrice: raw.targetSellingPrice == null ? null : Number(raw.targetSellingPrice),
    advertisedPrice: raw.advertisedPrice == null ? null : Number(raw.advertisedPrice),
    currentSellingPrice: raw.currentSellingPrice == null ? null : Number(raw.currentSellingPrice),
    maximumDiscountAmount:
      raw.maximumDiscountAmount == null ? null : Number(raw.maximumDiscountAmount),
    maximumDiscountPercent:
      raw.maximumDiscountPercent == null ? null : Number(raw.maximumDiscountPercent),
    discountAmount: raw.discountAmount == null ? null : Number(raw.discountAmount),
    discountPercent: raw.discountPercent == null ? null : Number(raw.discountPercent),
    expectedGrossProfit: raw.expectedGrossProfit == null ? null : Number(raw.expectedGrossProfit),
    expectedMarginPercent:
      raw.expectedMarginPercent == null ? null : Number(raw.expectedMarginPercent),
    pricingStatus: (raw.pricingStatus as PricingStatus | null) ?? null,
    pricingNotes: (raw.pricingNotes as string | null) ?? null,
    pricingId: (raw.pricingId as string | null) ?? null,
    belowMinimum: Boolean(raw.belowMinimum),
    isLoss: Boolean(raw.isLoss),
  };
}

function mapBreakdown(raw: Record<string, unknown>): VehicleCostBreakdown {
  const lines = Array.isArray(raw.acquisitionLines) ? raw.acquisitionLines : [];
  return {
    purchaseCost: Number(raw.purchaseCost ?? 0),
    acquisitionExpenses: Number(raw.acquisitionExpenses ?? 0),
    acquisitionTotal: Number(raw.acquisitionTotal ?? 0),
    workshopCost: Number(raw.workshopCost ?? 0),
    otherCosts: Number(raw.otherCosts ?? 0),
    totalVehicleCost: Number(raw.totalVehicleCost ?? 0),
    acquisitionLines: lines.map((item) => {
      const row = item as Record<string, unknown>;
      return { category: String(row.category ?? ""), amount: Number(row.amount ?? 0) };
    }),
    currency: String(raw.currency ?? "AED"),
  };
}

function salesPricingOnly(context: UserContext) {
  return seesSalesPricingOnly(context.roles, (permission) =>
    hasPermission(context.permissions, permission, context.roles),
  );
}

/** Everything but the target price and maximum discount is withheld from sales executives. */
function salesProfitability(p: VehicleProfitability): VehicleProfitability {
  return {
    vehicleId: p.vehicleId,
    currency: p.currency,
    purchaseCost: null,
    acquisitionExpenses: null,
    workshopCost: null,
    otherVehicleCosts: null,
    totalVehicleCost: null,
    minimumSellingPrice: null,
    targetSellingPrice: p.targetSellingPrice ?? p.currentSellingPrice,
    advertisedPrice: null,
    currentSellingPrice: null,
    maximumDiscountAmount: p.maximumDiscountAmount,
    maximumDiscountPercent: p.maximumDiscountPercent,
    discountAmount: null,
    discountPercent: null,
    expectedGrossProfit: null,
    expectedMarginPercent: null,
    pricingStatus: null,
    pricingNotes: null,
    pricingId: null,
    belowMinimum: false,
    isLoss: false,
  };
}

export async function getVehicleProfitability(
  vehicleId: string,
  context: UserContext,
  sellingPrice?: number | null,
): Promise<ServiceResult<VehicleProfitability>> {
  const can =
    hasPermission(context.permissions, "pricing.view", context.roles) ||
    hasPermission(context.permissions, "vehicle.price.view", context.roles) ||
    hasPermission(context.permissions, "vehicle.profit.view", context.roles) ||
    hasPermission(context.permissions, "vehicle.cost.view", context.roles);
  if (!can) {
    return { data: null, error: { code: "forbidden", message: "Not authorized to view pricing." } };
  }

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("get_vehicle_profitability", {
    p_vehicle_id: vehicleId,
    p_selling_price: sellingPrice ?? null,
  });

  if (error) return { data: null, error: mapDbError(error) };
  return { data: mapProfitability((data ?? {}) as Record<string, unknown>), error: null };
}

export async function getVehicleCostBreakdown(
  vehicleId: string,
  context: UserContext,
): Promise<ServiceResult<VehicleCostBreakdown>> {
  const can =
    hasPermission(context.permissions, "pricing.view", context.roles) ||
    hasPermission(context.permissions, "vehicle.cost.view", context.roles);
  if (!can) {
    return { data: null, error: { code: "forbidden", message: "Not authorized to view costs." } };
  }

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("get_vehicle_cost_breakdown", {
    p_vehicle_id: vehicleId,
  });

  if (error) return { data: null, error: mapDbError(error) };
  return { data: mapBreakdown((data ?? {}) as Record<string, unknown>), error: null };
}

export async function getVehiclePricingHistory(
  vehicleId: string,
  context: UserContext,
): Promise<ServiceResult<VehiclePricingHistoryItem[]>> {
  const can =
    hasPermission(context.permissions, "pricing.history.view", context.roles) ||
    hasPermission(context.permissions, "pricing.view", context.roles) ||
    hasPermission(context.permissions, "vehicle.price.view", context.roles);
  if (!can) {
    return {
      data: null,
      error: { code: "forbidden", message: "Not authorized to view pricing history." },
    };
  }

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("vehicle_pricing_history")
    .select("*")
    .eq("vehicle_id", vehicleId)
    .order("changed_at", { ascending: false })
    .limit(50);

  if (error) return { data: null, error: mapDbError(error) };

  const rows = (data ?? []) as Record<string, unknown>[];
  const userIds = Array.from(new Set(rows.map((r) => r.changed_by).filter(Boolean))) as string[];
  const nameMap = new Map<string, string>();
  if (userIds.length > 0) {
    const { data: profiles } = await supabase
      .from("profiles")
      .select("id, display_name")
      .in("id", userIds);
    for (const profile of (profiles ?? []) as { id: string; display_name: string }[]) {
      nameMap.set(profile.id, profile.display_name);
    }
  }

  return {
    data: rows.map((row) => ({
      id: String(row.id),
      vehicleId: String(row.vehicle_id),
      pricingId: (row.pricing_id as string | null) ?? null,
      previousMinimumPrice:
        row.previous_minimum_price == null ? null : Number(row.previous_minimum_price),
      newMinimumPrice: row.new_minimum_price == null ? null : Number(row.new_minimum_price),
      previousTargetPrice:
        row.previous_target_price == null ? null : Number(row.previous_target_price),
      newTargetPrice: row.new_target_price == null ? null : Number(row.new_target_price),
      previousAdvertisedPrice:
        row.previous_advertised_price == null ? null : Number(row.previous_advertised_price),
      newAdvertisedPrice:
        row.new_advertised_price == null ? null : Number(row.new_advertised_price),
      previousCurrentPrice:
        row.previous_current_price == null ? null : Number(row.previous_current_price),
      newCurrentPrice: row.new_current_price == null ? null : Number(row.new_current_price),
      previousDiscount: row.previous_discount == null ? null : Number(row.previous_discount),
      newDiscount: row.new_discount == null ? null : Number(row.new_discount),
      previousStatus: (row.previous_status as PricingStatus | null) ?? null,
      newStatus: (row.new_status as PricingStatus | null) ?? null,
      reason: (row.reason as PricingChangeReason | null) ?? null,
      notes: (row.notes as string | null) ?? null,
      overrideMinimum: Boolean(row.override_minimum),
      changedBy: (row.changed_by as string | null) ?? null,
      changedByName: row.changed_by ? (nameMap.get(String(row.changed_by)) ?? null) : null,
      changedAt: String(row.changed_at),
    })),
    error: null,
  };
}

export async function getVehiclePricingDetail(
  vehicleId: string,
  context: UserContext,
): Promise<ServiceResult<VehiclePricingDetail>> {
  const profitability = await getVehicleProfitability(vehicleId, context);
  if (profitability.error) return { data: null, error: profitability.error };

  const supabase = await createClient();
  const { data: vehicle, error: vehicleError } = await supabase
    .from("vehicles")
    .select("id, stock_number, make, model, year, status, branch_id")
    .eq("id", vehicleId)
    .is("deleted_at", null)
    .maybeSingle();

  if (vehicleError) return { data: null, error: mapDbError(vehicleError) };
  if (!vehicle) {
    return { data: null, error: { code: "not_found", message: "Vehicle not found." } };
  }

  const vehicleRow = vehicle as {
    id: string;
    stock_number: string;
    make: string;
    model: string;
    year: number;
    status: string;
    branch_id: string;
  };

  let branchName: string | null = null;
  const { data: branch } = await supabase
    .from("branches")
    .select("id, name")
    .eq("id", vehicleRow.branch_id)
    .maybeSingle();
  if (branch) branchName = (branch as { name: string }).name;

  const vehicleSummary = {
    id: vehicleRow.id,
    stockNumber: vehicleRow.stock_number,
    make: vehicleRow.make,
    model: vehicleRow.model,
    year: vehicleRow.year,
    status: vehicleRow.status,
    branchId: vehicleRow.branch_id,
    branchName,
  };

  // Sales executives only get the target selling price and the maximum discount.
  if (salesPricingOnly(context)) {
    return {
      data: {
        pricing: null,
        profitability: salesProfitability(profitability.data!),
        breakdown: null,
        history: [],
        vehicle: vehicleSummary,
      },
      error: null,
    };
  }

  const { data: pricingRow } = await supabase
    .from("vehicle_pricing")
    .select("*")
    .eq("vehicle_id", vehicleId)
    .maybeSingle();

  const canCost =
    hasPermission(context.permissions, "vehicle.cost.view", context.roles) ||
    hasPermission(context.permissions, "pricing.view", context.roles);
  const breakdown = canCost ? await getVehicleCostBreakdown(vehicleId, context) : null;
  const history = await getVehiclePricingHistory(vehicleId, context);

  return {
    data: {
      pricing: pricingRow ? mapPricing(pricingRow as Record<string, unknown>) : null,
      profitability: profitability.data!,
      breakdown: breakdown && !breakdown.error ? breakdown.data : null,
      history: history.error ? [] : (history.data ?? []),
      vehicle: vehicleSummary,
    },
    error: null,
  };
}

export async function upsertVehiclePricing(
  vehicleId: string,
  values: UpsertPricingValues,
  context: UserContext,
): Promise<ServiceResult<VehiclePricingDetail>> {
  const can =
    hasPermission(context.permissions, "pricing.update", context.roles) ||
    hasPermission(context.permissions, "pricing.create", context.roles) ||
    hasPermission(context.permissions, "vehicle.price.edit", context.roles);
  if (!can) {
    return {
      data: null,
      error: { code: "forbidden", message: "Not authorized to update pricing." },
    };
  }

  const supabase = await createClient();
  const { error } = await supabase.rpc("upsert_vehicle_pricing", {
    p_vehicle_id: vehicleId,
    p_minimum_selling_price: values.minimumSellingPrice,
    p_target_selling_price: values.targetSellingPrice,
    p_advertised_price: values.advertisedPrice,
    p_current_selling_price: values.currentSellingPrice,
    p_maximum_discount_amount: values.maximumDiscountAmount,
    // Derived from the amount and target price; any client-sent percentage is ignored.
    p_maximum_discount_percent: maxDiscountPercentFrom(
      values.maximumDiscountAmount,
      values.targetSellingPrice,
    ),
    p_pricing_notes: values.pricingNotes ?? null,
    p_change_reason: values.changeReason,
    p_change_notes: values.changeNotes ?? null,
    p_override_minimum: values.overrideMinimum,
    p_override_reason: values.overrideReason ?? null,
    p_submit_for_approval: values.submitForApproval,
  });

  if (error) return { data: null, error: mapDbError(error) };
  return getVehiclePricingDetail(vehicleId, context);
}

export async function approveVehiclePricing(
  vehicleId: string,
  values: ApprovePricingValues,
  context: UserContext,
): Promise<ServiceResult<VehiclePricingDetail>> {
  const can =
    hasPermission(context.permissions, "pricing.approve", context.roles) ||
    hasPermission(context.permissions, "pricing.discount.approve", context.roles);
  if (!can) {
    return {
      data: null,
      error: { code: "forbidden", message: "Not authorized to approve pricing." },
    };
  }

  const supabase = await createClient();
  const { error } = await supabase.rpc("approve_vehicle_pricing", {
    p_vehicle_id: vehicleId,
    p_note: values.note ?? null,
    p_approve: values.approve,
  });

  if (error) return { data: null, error: mapDbError(error) };
  return getVehiclePricingDetail(vehicleId, context);
}

export async function listVehiclePricing(
  query: PricingListQuery,
  context: UserContext,
): Promise<ServiceResult<PricingListResult>> {
  const can =
    hasPermission(context.permissions, "pricing.view", context.roles) ||
    hasPermission(context.permissions, "vehicle.price.view", context.roles);
  if (!can) {
    return { data: null, error: { code: "forbidden", message: "Not authorized to view pricing." } };
  }

  const supabase = await createClient();
  const from = (query.page - 1) * query.pageSize;
  const to = from + query.pageSize - 1;

  let vehicleQuery = supabase
    .from("vehicles")
    .select(
      "id, stock_number, make, model, year, status, branch_id, current_selling_price, updated_at, vehicle_pricing(id, minimum_selling_price, target_selling_price, advertised_price, current_selling_price, pricing_status, updated_at)",
      { count: "exact" },
    )
    .is("deleted_at", null)
    .order("updated_at", { ascending: false })
    .range(from, to);

  if (query.branchId) vehicleQuery = vehicleQuery.eq("branch_id", query.branchId);
  if (query.vehicleStatus) vehicleQuery = vehicleQuery.eq("status", query.vehicleStatus);
  if (query.q) {
    const term = `%${query.q}%`;
    vehicleQuery = vehicleQuery.or(
      `stock_number.ilike.${term},make.ilike.${term},model.ilike.${term},vin.ilike.${term}`,
    );
  }

  const { data, error, count } = await vehicleQuery;
  if (error) return { data: null, error: mapDbError(error) };

  const salesOnly = salesPricingOnly(context);
  const canProfit =
    !salesOnly &&
    (hasPermission(context.permissions, "vehicle.profit.view", context.roles) ||
      hasPermission(context.permissions, "pricing.view", context.roles));
  const canCost =
    !salesOnly &&
    (hasPermission(context.permissions, "vehicle.cost.view", context.roles) ||
      hasPermission(context.permissions, "pricing.view", context.roles));

  const rows = (data ?? []) as Record<string, unknown>[];
  const branchIds = Array.from(new Set(rows.map((row) => String(row.branch_id))));
  const branchNameMap = new Map<string, string>();
  if (branchIds.length > 0) {
    const { data: branches } = await supabase
      .from("branches")
      .select("id, name")
      .in("id", branchIds);
    for (const branch of (branches ?? []) as { id: string; name: string }[]) {
      branchNameMap.set(branch.id, branch.name);
    }
  }

  const items: PricingListItem[] = [];
  for (const row of rows) {
    const pricingRel = row.vehicle_pricing as
      Record<string, unknown> | Record<string, unknown>[] | null;
    const pricing = Array.isArray(pricingRel) ? pricingRel[0] : pricingRel;
    if (query.pricingStatus) {
      if ((pricing?.pricing_status as string | undefined) !== query.pricingStatus) continue;
    }

    let totalCost: number | null = null;
    let profit: number | null = null;
    let margin: number | null = null;

    if (canCost || canProfit) {
      const { data: profitData } = await supabase.rpc("get_vehicle_profitability", {
        p_vehicle_id: String(row.id),
        p_selling_price: null,
      });
      if (profitData) {
        const payload = profitData as Record<string, unknown>;
        totalCost = canCost || canProfit ? Number(payload.totalVehicleCost ?? 0) : null;
        profit = canProfit
          ? payload.expectedGrossProfit == null
            ? null
            : Number(payload.expectedGrossProfit)
          : null;
        margin = canProfit
          ? payload.expectedMarginPercent == null
            ? null
            : Number(payload.expectedMarginPercent)
          : null;
      }
    }

    items.push({
      vehicleId: String(row.id),
      stockNumber: String(row.stock_number),
      make: String(row.make),
      model: String(row.model),
      year: Number(row.year),
      vehicleStatus: String(row.status),
      branchId: String(row.branch_id),
      branchName: branchNameMap.get(String(row.branch_id)) ?? null,
      totalVehicleCost: totalCost,
      minimumSellingPrice:
        salesOnly || pricing?.minimum_selling_price == null
          ? null
          : Number(pricing.minimum_selling_price),
      targetSellingPrice:
        pricing?.target_selling_price == null ? null : Number(pricing.target_selling_price),
      advertisedPrice:
        salesOnly || pricing?.advertised_price == null ? null : Number(pricing.advertised_price),
      currentSellingPrice:
        pricing?.current_selling_price != null
          ? Number(pricing.current_selling_price)
          : row.current_selling_price == null
            ? null
            : Number(row.current_selling_price),
      expectedGrossProfit: profit,
      expectedMarginPercent: margin,
      pricingStatus: salesOnly ? null : ((pricing?.pricing_status as PricingStatus | null) ?? null),
      updatedAt: String(pricing?.updated_at ?? row.updated_at),
    });
  }

  return {
    data: {
      items,
      total: count ?? items.length,
      page: query.page,
      pageSize: query.pageSize,
    },
    error: null,
  };
}
