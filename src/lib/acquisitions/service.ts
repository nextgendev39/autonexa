import { createClient } from "@/lib/supabase/server";
import { hasPermission } from "@/lib/permissions";
import { alertVehicleEvent } from "@/lib/vehicles/alerts";
import {
  canEditAcquisitionFields,
  canEditPurchaseTerms,
  isAcquisitionLocked,
  isValidAcquisitionStatusTransition,
} from "@/lib/acquisitions/status-transitions";
import type { UserContext } from "@/types/auth";
import type {
  AcquisitionActivityItem,
  AcquisitionDetail,
  AcquisitionExpense,
  AcquisitionExpenseType,
  AcquisitionListItem,
  AcquisitionListResult,
  AcquisitionMeta,
  AcquisitionStatus,
  AcquisitionStatusHistoryItem,
  AcquisitionSummary,
} from "@/types/acquisition";
import { ACQUISITION_FORM_EXPENSES } from "@/types/acquisition";
import type {
  AcquisitionExpenseValues,
  AcquisitionListQuery,
  ApproveAcquisitionValues,
  CancelAcquisitionValues,
  ChangeAcquisitionStatusValues,
  CreateAcquisitionValues,
  ReceiveAcquisitionValues,
  RejectAcquisitionValues,
  UpdateAcquisitionValues,
} from "@/lib/validation/acquisition";

export type AcquisitionServiceError = {
  code:
    | "not_found"
    | "forbidden"
    | "duplicate_vin"
    | "duplicate_chassis"
    | "duplicate_acquisition"
    | "invalid_transition"
    | "validation"
    | "conflict"
    | "unknown";
  message: string;
  existingVehicleId?: string;
  existingAcquisitionId?: string;
};

export type ServiceResult<T> =
  | { data: T; error: null }
  | { data: null; error: AcquisitionServiceError };

type AcquisitionRow = {
  id: string;
  acquisition_number: string;
  vehicle_id: string;
  supplier_id: string | null;
  customer_id: string | null;
  branch_id: string;
  source_type: AcquisitionListItem["sourceType"];
  source_name: string | null;
  source_company: string | null;
  source_phone: string | null;
  source_email: string | null;
  source_reference: string | null;
  lot_number: string | null;
  status: AcquisitionStatus;
  asking_price?: number | null;
  purchase_price?: number;
  currency: string;
  purchase_date: string | null;
  expected_arrival_date: string | null;
  received_date: string | null;
  payment_status: AcquisitionListItem["paymentStatus"];
  registration_status: AcquisitionListItem["registrationStatus"];
  document_status: AcquisitionListItem["documentStatus"];
  notes: string | null;
  created_by: string | null;
  updated_by: string | null;
  approved_by: string | null;
  approved_at: string | null;
  approval_note: string | null;
  rejected_by: string | null;
  rejected_at: string | null;
  rejection_reason: string | null;
  cancelled_at: string | null;
  cancel_reason: string | null;
  created_at: string;
  updated_at: string;
  branches?: { id: string; name: string } | { id: string; name: string }[] | null;
  vehicles?:
    | {
        id: string;
        stock_number: string;
        vin: string | null;
        make: string;
        model: string;
        variant: string | null;
        year: number;
        mileage: number;
        origin_type: string | null;
        country_of_origin: string | null;
      }
    | {
        id: string;
        stock_number: string;
        vin: string | null;
        make: string;
        model: string;
        variant: string | null;
        year: number;
        mileage: number;
        origin_type: string | null;
        country_of_origin: string | null;
      }[]
    | null;
};

type ExpenseRow = {
  id: string;
  acquisition_id: string | null;
  vehicle_id: string;
  category: AcquisitionExpenseType;
  description: string | null;
  amount: number;
  currency: string;
  expense_date: string;
  vendor_name: string | null;
  reference_number: string | null;
  created_by: string | null;
  created_at: string;
};

function asRelation<T extends { id: string }>(value: T | T[] | null | undefined): T | null {
  if (!value) return null;
  return Array.isArray(value) ? (value[0] ?? null) : value;
}

function mapDbError(error: { code?: string; message?: string }): AcquisitionServiceError {
  const message = (error.message ?? "").toLowerCase();
  if (error.code === "23505" || message.includes("acquisitions_one_active_per_vehicle")) {
    return {
      code: "duplicate_acquisition",
      message: "An active acquisition already exists for this vehicle.",
    };
  }
  if (message.includes("vehicles_vin_active_unique") || message.includes("duplicate key") && message.includes("vin")) {
    return { code: "duplicate_vin", message: "A vehicle with this VIN already exists." };
  }
  if (message.includes("vehicles_chassis_active_unique")) {
    return {
      code: "duplicate_chassis",
      message: "A vehicle with this chassis number already exists.",
    };
  }
  if (message.includes("invalid acquisition status transition")) {
    return { code: "invalid_transition", message: "That status change is not allowed." };
  }
  if (message.includes("self approval")) {
    return { code: "forbidden", message: "You cannot approve your own acquisition." };
  }
  if (message.includes("not authorized") || message.includes("permission")) {
    return { code: "forbidden", message: "You do not have permission to perform this action." };
  }
  if (message.includes("acquisition not found")) {
    return { code: "not_found", message: "Acquisition not found." };
  }
  if (message.includes("reason required") || message.includes("rejection reason")) {
    return { code: "validation", message: "A reason is required." };
  }
  if (
    message.includes("must be approved") ||
    message.includes("not pending approval") ||
    message.includes("purchase price required") ||
    message.includes("vehicle required") ||
    message.includes("branch required")
  ) {
    return { code: "conflict", message: error.message ?? "This action is not allowed." };
  }
  return { code: "unknown", message: "Unable to complete the request. Please try again." };
}

function mapListItem(row: AcquisitionRow): AcquisitionListItem {
  const branch = asRelation(row.branches);
  const vehicle = asRelation(row.vehicles);
  return {
    id: row.id,
    acquisitionNumber: row.acquisition_number,
    status: row.status,
    sourceType: row.source_type,
    sourceName: row.source_name,
    branchId: row.branch_id,
    branchName: branch?.name ?? null,
    vehicleId: row.vehicle_id,
    vehicleStockNumber: vehicle?.stock_number ?? null,
    vehicleMake: vehicle?.make ?? null,
    vehicleModel: vehicle?.model ?? null,
    vehicleYear: vehicle?.year ?? null,
    vehicleVin: vehicle?.vin ?? null,
    purchaseDate: row.purchase_date,
    expectedArrivalDate: row.expected_arrival_date,
    paymentStatus: row.payment_status,
    documentStatus: row.document_status,
    registrationStatus: row.registration_status,
    createdBy: row.created_by,
    createdByName: null,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function mapExpense(row: ExpenseRow, names?: Map<string, string>): AcquisitionExpense {
  return {
    id: row.id,
    acquisitionId: row.acquisition_id ?? "",
    vehicleId: row.vehicle_id,
    expenseType: row.category,
    description: row.description,
    amount: Number(row.amount),
    currency: row.currency,
    expenseDate: row.expense_date,
    vendor: row.vendor_name,
    reference: row.reference_number,
    createdBy: row.created_by,
    createdByName: row.created_by ? (names?.get(row.created_by) ?? null) : null,
    createdAt: row.created_at,
  };
}

const LIST_SELECT = `
  id, acquisition_number, vehicle_id, supplier_id, customer_id, branch_id,
  source_type, source_name, source_company, source_phone, source_email, source_reference, lot_number,
  status, currency, purchase_date, expected_arrival_date, received_date,
  payment_status, registration_status, document_status, notes,
  created_by, updated_by, approved_by, approved_at, approval_note,
  rejected_by, rejected_at, rejection_reason, cancelled_at, cancel_reason,
  created_at, updated_at,
  branches:branch_id ( id, name ),
  vehicles:vehicle_id (
    id, stock_number, vin, make, model, variant, year, mileage, origin_type, country_of_origin
  )
`;

async function loadProfileNames(
  supabase: Awaited<ReturnType<typeof createClient>>,
  ids: (string | null | undefined)[],
) {
  const unique = [...new Set(ids.filter(Boolean) as string[])];
  if (unique.length === 0) return new Map<string, string>();
  const { data } = await supabase.from("profiles").select("id, display_name").in("id", unique);
  return new Map(
    ((data ?? []) as { id: string; display_name: string }[]).map((p) => [p.id, p.display_name]),
  );
}

async function attachCosts(
  supabase: Awaited<ReturnType<typeof createClient>>,
  items: AcquisitionListItem[],
  context: UserContext,
) {
  const canView =
    hasPermission(context.permissions, "acquisition.cost.view", context.roles) ||
    hasPermission(context.permissions, "vehicle.cost.view", context.roles);
  if (!canView || items.length === 0) return items;

  const { data, error } = await supabase.rpc("read_acquisitions_costs", {
    p_ids: items.map((item) => item.id),
  });
  if (error || !data) return items;

  const rows = data as unknown as {
    acquisition_id: string;
    asking_price: number | null;
    purchase_price: number;
    expense_total: number;
    total_acquisition_cost: number;
  }[];

  const map = new Map(rows.map((row) => [row.acquisition_id, row]));

  return items.map((item) => {
    const costs = map.get(item.id);
    if (!costs) return item;
    return {
      ...item,
      askingPrice: costs.asking_price == null ? null : Number(costs.asking_price),
      purchasePrice: Number(costs.purchase_price),
      expenseTotal: Number(costs.expense_total),
      totalAcquisitionCost: Number(costs.total_acquisition_cost),
    };
  });
}

export async function getAcquisitionSummary(): Promise<ServiceResult<AcquisitionSummary>> {
  const supabase = await createClient();
  const { data, error } = await supabase.from("acquisitions").select("status");
  if (error) return { data: null, error: mapDbError(error) };

  const summary: AcquisitionSummary = {
    total: 0,
    draft: 0,
    pendingApproval: 0,
    approved: 0,
    purchased: 0,
    documentsPending: 0,
    received: 0,
    cancelled: 0,
  };

  for (const row of (data ?? []) as { status: AcquisitionStatus }[]) {
    summary.total += 1;
    if (row.status === "draft") summary.draft += 1;
    if (row.status === "pending_approval") summary.pendingApproval += 1;
    if (row.status === "approved") summary.approved += 1;
    if (row.status === "purchased") summary.purchased += 1;
    if (row.status === "documents_pending") summary.documentsPending += 1;
    if (row.status === "received") summary.received += 1;
    if (row.status === "cancelled" || row.status === "rejected") summary.cancelled += 1;
  }

  return { data: summary, error: null };
}

export async function listAcquisitions(
  query: AcquisitionListQuery,
  context: UserContext,
): Promise<ServiceResult<AcquisitionListResult>> {
  const supabase = await createClient();

  let builder = supabase.from("acquisitions").select(LIST_SELECT, { count: "exact" });

  if (query.status) builder = builder.eq("status", query.status);
  if (query.branchId) builder = builder.eq("branch_id", query.branchId);
  if (query.sourceType) builder = builder.eq("source_type", query.sourceType);
  if (query.paymentStatus) builder = builder.eq("payment_status", query.paymentStatus);
  if (query.documentStatus) builder = builder.eq("document_status", query.documentStatus);
  if (query.registrationStatus) {
    builder = builder.eq("registration_status", query.registrationStatus);
  }
  if (query.purchaseDateFrom) builder = builder.gte("purchase_date", query.purchaseDateFrom);
  if (query.purchaseDateTo) builder = builder.lte("purchase_date", query.purchaseDateTo);
  if (query.createdFrom) builder = builder.gte("created_at", query.createdFrom);
  if (query.createdTo) builder = builder.lte("created_at", `${query.createdTo}T23:59:59.999Z`);

  if (query.make) builder = builder.ilike("vehicles.make", `%${query.make}%`);
  if (query.model) builder = builder.ilike("vehicles.model", `%${query.model}%`);

  if (query.q) {
    const q = query.q.replace(/[%_,]/g, "");
    builder = builder.or(
      `acquisition_number.ilike.%${q}%,source_name.ilike.%${q}%,source_company.ilike.%${q}%,vehicles.stock_number.ilike.%${q}%,vehicles.vin.ilike.%${q}%,vehicles.make.ilike.%${q}%,vehicles.model.ilike.%${q}%`,
    );
  }

  const from = (query.page - 1) * query.pageSize;
  const to = from + query.pageSize - 1;

  const { data, error, count } = await builder
    .order(query.sort, { ascending: query.order === "asc" })
    .range(from, to);

  if (error) return { data: null, error: mapDbError(error) };

  const rows = (data ?? []) as unknown as AcquisitionRow[];
  let items = rows.map(mapListItem);

  const names = await loadProfileNames(
    supabase,
    items.map((item) => item.createdBy),
  );
  items = items.map((item) => ({
    ...item,
    createdByName: item.createdBy ? (names.get(item.createdBy) ?? null) : null,
  }));

  items = await attachCosts(supabase, items, context);

  // Price range filter applied after cost attach (prices withheld from base select).
  if (query.priceMin != null || query.priceMax != null) {
    items = items.filter((item) => {
      if (item.purchasePrice == null) return false;
      if (query.priceMin != null && item.purchasePrice < query.priceMin) return false;
      if (query.priceMax != null && item.purchasePrice > query.priceMax) return false;
      return true;
    });
  }

  const summary = await getAcquisitionSummary();

  return {
    data: {
      items,
      page: query.page,
      pageSize: query.pageSize,
      total: count ?? 0,
      summary: summary.data ?? {
        total: 0,
        draft: 0,
        pendingApproval: 0,
        approved: 0,
        purchased: 0,
        documentsPending: 0,
        received: 0,
        cancelled: 0,
      },
    },
    error: null,
  };
}

async function findActiveAcquisitionForVehicle(
  supabase: Awaited<ReturnType<typeof createClient>>,
  vehicleId: string,
  excludeId?: string,
) {
  let q = supabase
    .from("acquisitions")
    .select("id")
    .eq("vehicle_id", vehicleId)
    .not("status", "in", '("cancelled","rejected")')
    .limit(1);
  if (excludeId) q = q.neq("id", excludeId);
  const { data } = await q.maybeSingle();
  return data as { id: string } | null;
}

type ResolvedVehicle = {
  id: string;
  branchId: string;
};

async function resolveVehicleForCreate(
  values: CreateAcquisitionValues,
  context: UserContext,
): Promise<ServiceResult<ResolvedVehicle>> {
  const supabase = await createClient();

  if (values.vehicle.vehicleId) {
    const { data, error } = await supabase
      .from("vehicles")
      .select("id, branch_id, status")
      .eq("id", values.vehicle.vehicleId)
      .is("deleted_at", null)
      .maybeSingle();
    if (error) return { data: null, error: mapDbError(error) };
    if (!data) {
      return {
        data: null,
        error: {
          code: "not_found",
          message: "Vehicle not found or not accessible in your branch scope.",
        },
      };
    }

    const vehicle = data as { id: string; branch_id: string; status: string };
    if (vehicle.status === "archived") {
      return {
        data: null,
        error: { code: "conflict", message: "Archived vehicles cannot be linked to acquisitions." },
      };
    }

    if (
      context.branchScope !== "ALL_BRANCHES" &&
      context.accessibleBranchIds.length > 0 &&
      !context.accessibleBranchIds.includes(vehicle.branch_id)
    ) {
      return {
        data: null,
        error: {
          code: "forbidden",
          message: "You do not have access to this vehicle's branch.",
        },
      };
    }

    const active = await findActiveAcquisitionForVehicle(supabase, values.vehicle.vehicleId);
    if (active) {
      return {
        data: null,
        error: {
          code: "duplicate_acquisition",
          message: "This vehicle already has an active acquisition.",
          existingAcquisitionId: active.id,
        },
      };
    }
    return { data: { id: vehicle.id, branchId: vehicle.branch_id }, error: null };
  }

  if (values.vehicle.vin || values.vehicle.chassisNumber) {
    let existingQuery = supabase
      .from("vehicles")
      .select("id, stock_number")
      .is("deleted_at", null)
      .limit(1);
    if (values.vehicle.vin) {
      existingQuery = existingQuery.eq("vin", values.vehicle.vin);
    } else if (values.vehicle.chassisNumber) {
      existingQuery = existingQuery.eq("chassis_number", values.vehicle.chassisNumber);
    }
    const { data: existing } = await existingQuery.maybeSingle();
    if (existing) {
      const row = existing as { id: string; stock_number: string };
      return {
        data: null,
        error: {
          code: "duplicate_vin",
          message: `Vehicle ${row.stock_number} already exists with this identifier.`,
          existingVehicleId: row.id,
        },
      };
    }
  }

  if (!hasPermission(context.permissions, "vehicle.create", context.roles)) {
    return {
      data: null,
      error: {
        code: "forbidden",
        message: "You do not have permission to create vehicles for acquisitions.",
      },
    };
  }

  if (!values.vehicle.make || !values.vehicle.model || values.vehicle.year == null) {
    return {
      data: null,
      error: {
        code: "validation",
        message: "Brand, model, and year are required when creating a new vehicle.",
      },
    };
  }

  const { data, error } = await supabase
    .from("vehicles")
    .insert({
      stock_number: "",
      vin: values.vehicle.vin,
      chassis_number: values.vehicle.chassisNumber,
      make: values.vehicle.make,
      model: values.vehicle.model,
      variant: values.vehicle.variant,
      year: values.vehicle.year,
      mileage: values.vehicle.mileage,
      origin_type: values.vehicle.originType,
      country_of_origin: values.vehicle.countryOfOrigin,
      branch_id: values.branchId,
      make_id: values.vehicle.makeId,
      model_id: values.vehicle.modelId,
      status: "ready_for_sale",
      source: "other",
      purchase_date: values.purchaseDate,
      created_by: context.userId,
      updated_by: context.userId,
    })
    .select("id")
    .single();

  if (error) return { data: null, error: mapDbError(error) };
  return {
    data: { id: (data as { id: string }).id, branchId: values.branchId },
    error: null,
  };
}

/**
 * Applies the form's Shipping Cost / Other Fees to the acquisition's expense lines: adds,
 * updates or removes the one line of that type. Several lines of a type are managed from the
 * Expenses tab instead, so the form leaves them alone. Best-effort: the acquisition is saved.
 */
async function syncFormExpenses(
  supabase: Awaited<ReturnType<typeof createClient>>,
  {
    acquisitionId,
    vehicleId,
    currency,
    expenses,
    values,
    context,
  }: {
    acquisitionId: string;
    vehicleId: string;
    currency: string;
    /** Current lines; undefined when the user cannot view expenses. */
    expenses: AcquisitionExpense[] | undefined;
    values: { shippingCost?: number | null; otherFees?: number | null };
    context: UserContext;
  },
) {
  if (!expenses) return;
  const canCreate =
    hasPermission(context.permissions, "acquisition.expense.create", context.roles) ||
    hasPermission(context.permissions, "acquisition.cost.edit", context.roles) ||
    hasPermission(context.permissions, "vehicle.cost.edit", context.roles);
  const canEdit =
    hasPermission(context.permissions, "acquisition.expense.edit", context.roles) ||
    hasPermission(context.permissions, "acquisition.cost.edit", context.roles) ||
    hasPermission(context.permissions, "vehicle.cost.edit", context.roles);

  await Promise.all(
    ACQUISITION_FORM_EXPENSES.map(async ({ field, category, description }) => {
      const value = values[field];
      if (value === undefined) return;
      const amount = value ?? 0;
      const lines = expenses.filter((expense) => expense.expenseType === category);
      if (lines.length > 1) return;
      const line = lines[0];

      if (!line) {
        if (amount <= 0 || !canCreate) return;
        await supabase.from("vehicle_expenses").insert({
          vehicle_id: vehicleId,
          acquisition_id: acquisitionId,
          category,
          description,
          amount,
          currency,
          expense_date: new Date().toISOString().slice(0, 10),
          created_by: context.userId,
        });
        return;
      }

      if (!canEdit || amount === line.amount) return;
      if (amount <= 0) {
        await supabase
          .from("vehicle_expenses")
          .delete()
          .eq("id", line.id)
          .eq("acquisition_id", acquisitionId);
      } else {
        await supabase
          .from("vehicle_expenses")
          .update({ amount })
          .eq("id", line.id)
          .eq("acquisition_id", acquisitionId);
      }
    }),
  );
}

export async function createAcquisition(
  values: CreateAcquisitionValues,
  context: UserContext,
): Promise<ServiceResult<AcquisitionDetail>> {
  if (!hasPermission(context.permissions, "acquisition.create", context.roles)) {
    return { data: null, error: { code: "forbidden", message: "Not authorized." } };
  }

  const vehicleResult = await resolveVehicleForCreate(values, context);
  if (vehicleResult.error || !vehicleResult.data) {
    return { data: null, error: vehicleResult.error ?? { code: "unknown", message: "Vehicle error." } };
  }

  const branchId = values.vehicle.vehicleId
    ? vehicleResult.data.branchId
    : values.branchId;

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("acquisitions")
    .insert({
      acquisition_number: "",
      vehicle_id: vehicleResult.data.id,
      branch_id: branchId,
      source_type: values.sourceType,
      source_name: values.sourceName,
      source_company: values.sourceCompany,
      source_phone: values.sourcePhone,
      source_email: values.sourceEmail,
      source_reference: values.sourceReference,
      lot_number: values.lotNumber,
      supplier_id: values.supplierId,
      customer_id: values.customerId,
      asking_price: values.askingPrice,
      purchase_price: values.purchasePrice,
      currency: values.currency ?? "AED",
      purchase_date: values.purchaseDate,
      expected_arrival_date: values.expectedArrivalDate,
      payment_status: values.paymentStatus ?? "not_paid",
      registration_status: values.registrationStatus ?? "not_started",
      document_status: values.documentStatus ?? "pending",
      notes: values.notes,
      status: "draft",
      created_by: context.userId,
      updated_by: context.userId,
    })
    .select("id")
    .single();

  if (error) return { data: null, error: mapDbError(error) };
  await syncFormExpenses(supabase, {
    acquisitionId: (data as { id: string }).id,
    vehicleId: vehicleResult.data.id,
    currency: values.currency ?? "AED",
    expenses: [],
    values,
    context,
  });
  // A vehicle created here starts Ready for sale.
  if (!values.vehicle.vehicleId) alertVehicleEvent("ready_for_sale", vehicleResult.data.id, context.userId);

  try {
  await supabase.rpc("write_audit_log", {
    p_action: "ACQUISITION_CREATED",
    p_entity_type: "acquisitions",
    p_entity_id: (data as { id: string }).id,
    p_old_values: null,
    p_new_values: { status: "draft", vehicle_id: vehicleResult.data.id },
    p_metadata: null,
  });
  } catch {
    /* audit best-effort */
  }

  return getAcquisition((data as { id: string }).id, context);
}

export async function getAcquisition(
  id: string,
  context: UserContext,
): Promise<ServiceResult<AcquisitionDetail>> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("acquisitions")
    .select(LIST_SELECT)
    .eq("id", id)
    .maybeSingle();

  if (error) return { data: null, error: mapDbError(error) };
  if (!data) {
    return { data: null, error: { code: "not_found", message: "Acquisition not found." } };
  }

  const row = data as unknown as AcquisitionRow;
  const base = mapListItem(row);
  const vehicle = asRelation(row.vehicles);

  const names = await loadProfileNames(supabase, [
    row.created_by,
    row.updated_by,
    row.approved_by,
    row.rejected_by,
  ]);

  const withCosts = (await attachCosts(supabase, [base], context))[0]!;

  let expenses: AcquisitionExpense[] | undefined;
  const canViewExpenses =
    hasPermission(context.permissions, "acquisition.expense.view", context.roles) ||
    hasPermission(context.permissions, "acquisition.cost.view", context.roles) ||
    hasPermission(context.permissions, "vehicle.cost.view", context.roles);

  if (canViewExpenses) {
    const { data: expenseRows } = await supabase
      .from("vehicle_expenses")
      .select(
        "id, acquisition_id, vehicle_id, category, description, amount, currency, expense_date, vendor_name, reference_number, created_by, created_at",
      )
      .eq("acquisition_id", id)
      .order("expense_date", { ascending: false });

    const expenseNames = await loadProfileNames(
      supabase,
      ((expenseRows ?? []) as ExpenseRow[]).map((e) => e.created_by),
    );
    expenses = ((expenseRows ?? []) as ExpenseRow[])
      .filter((e) => e.category !== "purchase")
      .map((e) => mapExpense(e, expenseNames));
  }

  const detail: AcquisitionDetail = {
    ...withCosts,
    createdByName: row.created_by ? (names.get(row.created_by) ?? null) : null,
    vehicleVariant: vehicle?.variant ?? null,
    vehicleMileage: vehicle?.mileage ?? null,
    vehicleOriginType: vehicle?.origin_type ?? null,
    vehicleCountryOfOrigin: vehicle?.country_of_origin ?? null,
    sourceCompany: row.source_company,
    sourcePhone: row.source_phone,
    sourceEmail: row.source_email,
    sourceReference: row.source_reference,
    lotNumber: row.lot_number,
    supplierId: row.supplier_id,
    customerId: row.customer_id,
    currency: row.currency,
    receivedDate: row.received_date,
    notes: row.notes,
    approvedBy: row.approved_by,
    approvedByName: row.approved_by ? (names.get(row.approved_by) ?? null) : null,
    approvedAt: row.approved_at,
    approvalNote: row.approval_note,
    rejectedBy: row.rejected_by,
    rejectedByName: row.rejected_by ? (names.get(row.rejected_by) ?? null) : null,
    rejectedAt: row.rejected_at,
    rejectionReason: row.rejection_reason,
    cancelledAt: row.cancelled_at,
    cancelReason: row.cancel_reason,
    updatedBy: row.updated_by,
    updatedByName: row.updated_by ? (names.get(row.updated_by) ?? null) : null,
    expenses,
  };

  return { data: detail, error: null };
}

export async function updateAcquisition(
  id: string,
  values: UpdateAcquisitionValues,
  context: UserContext,
): Promise<ServiceResult<AcquisitionDetail>> {
  if (!hasPermission(context.permissions, "acquisition.edit", context.roles)) {
    return { data: null, error: { code: "forbidden", message: "Not authorized." } };
  }

  const existing = await getAcquisition(id, context);
  if (existing.error || !existing.data) return existing;

  const current = existing.data;
  if (isAcquisitionLocked(current.status)) {
    return {
      data: null,
      error: { code: "conflict", message: "Received or cancelled acquisitions cannot be edited." },
    };
  }

  if (current.status === "pending_approval") {
    return {
      data: null,
      error: {
        code: "conflict",
        message: "Acquisitions pending approval cannot be edited. Reject or approve first.",
      },
    };
  }

  if (current.status === "purchased" || current.status === "documents_pending") {
    // Limited edits: documents/registration/payment/notes only.
    const allowedKeys = new Set([
      "documentStatus",
      "registrationStatus",
      "paymentStatus",
      "notes",
      "expectedArrivalDate",
      "shippingCost",
      "otherFees",
    ]);
    const keys = Object.keys(values).filter((k) => values[k as keyof typeof values] !== undefined);
    if (keys.some((k) => !allowedKeys.has(k))) {
      return {
        data: null,
        error: {
          code: "conflict",
          message: "Only document and logistics fields can be edited after purchase.",
        },
      };
    }
  }

  const priceChanging =
    values.purchasePrice != null &&
    current.purchasePrice != null &&
    Number(values.purchasePrice) !== Number(current.purchasePrice);

  if (priceChanging && current.status === "approved") {
    const canOverride = hasPermission(
      context.permissions,
      "acquisition.cost.edit",
      context.roles,
    );
    if (!canOverride) {
      // Force re-approval via status change after price update.
    } else if (!hasPermission(context.permissions, "acquisition.cost.edit", context.roles)) {
      return {
        data: null,
        error: { code: "forbidden", message: "Not authorized to change purchase price." },
      };
    }
  }

  if (
    values.purchasePrice != null &&
    !canEditPurchaseTerms(current.status) &&
    current.status !== "purchased" &&
    current.status !== "documents_pending"
  ) {
    return {
      data: null,
      error: { code: "conflict", message: "Purchase terms cannot be edited in this status." },
    };
  }

  const supabase = await createClient();
  const patch: Record<string, unknown> = {
    updated_by: context.userId,
  };

  if (values.branchId != null) patch.branch_id = values.branchId;
  if (values.sourceType != null) patch.source_type = values.sourceType;
  if (values.sourceName !== undefined) patch.source_name = values.sourceName;
  if (values.sourceCompany !== undefined) patch.source_company = values.sourceCompany;
  if (values.sourcePhone !== undefined) patch.source_phone = values.sourcePhone;
  if (values.sourceEmail !== undefined) patch.source_email = values.sourceEmail;
  if (values.sourceReference !== undefined) patch.source_reference = values.sourceReference;
  if (values.lotNumber !== undefined) patch.lot_number = values.lotNumber;
  if (values.supplierId !== undefined) patch.supplier_id = values.supplierId;
  if (values.customerId !== undefined) patch.customer_id = values.customerId;
  if (values.askingPrice !== undefined) patch.asking_price = values.askingPrice;
  if (values.purchasePrice !== undefined) patch.purchase_price = values.purchasePrice;
  if (values.currency != null) patch.currency = values.currency;
  if (values.purchaseDate !== undefined) patch.purchase_date = values.purchaseDate;
  if (values.expectedArrivalDate !== undefined) {
    patch.expected_arrival_date = values.expectedArrivalDate;
  }
  if (values.paymentStatus != null) patch.payment_status = values.paymentStatus;
  if (values.registrationStatus != null) patch.registration_status = values.registrationStatus;
  if (values.documentStatus != null) patch.document_status = values.documentStatus;
  if (values.notes !== undefined) patch.notes = values.notes;

  if (priceChanging && current.status === "approved") {
    const canOverride = hasPermission(
      context.permissions,
      "acquisition.cost.edit",
      context.roles,
    );
    if (!canOverride) {
      patch.status = "pending_approval";
      patch.approved_by = null;
      patch.approved_at = null;
      patch.approval_note = null;
    }
  }

  const { error } = await supabase.from("acquisitions").update(patch).eq("id", id);
  if (error) return { data: null, error: mapDbError(error) };

  if (values.vehicle && canEditAcquisitionFields(current.status)) {
    const v = values.vehicle;
    const vehiclePatch: Record<string, unknown> = { updated_by: context.userId };
    if (v.make != null) vehiclePatch.make = v.make;
    if (v.model != null) vehiclePatch.model = v.model;
    if (v.variant !== undefined) vehiclePatch.variant = v.variant;
    if (v.year != null) vehiclePatch.year = v.year;
    if (v.mileage != null) vehiclePatch.mileage = v.mileage;
    if (v.vin !== undefined) vehiclePatch.vin = v.vin;
    if (v.chassisNumber !== undefined) vehiclePatch.chassis_number = v.chassisNumber;
    if (v.originType != null) vehiclePatch.origin_type = v.originType;
    if (v.countryOfOrigin !== undefined) vehiclePatch.country_of_origin = v.countryOfOrigin;
    if (v.makeId !== undefined) vehiclePatch.make_id = v.makeId;
    if (v.modelId !== undefined) vehiclePatch.model_id = v.modelId;

    const { error: vehicleError } = await supabase
      .from("vehicles")
      .update(vehiclePatch)
      .eq("id", current.vehicleId);
    if (vehicleError) return { data: null, error: mapDbError(vehicleError) };
  }

  await syncFormExpenses(supabase, {
    acquisitionId: id,
    vehicleId: current.vehicleId,
    currency: values.currency ?? current.currency ?? "AED",
    expenses: current.expenses,
    values,
    context,
  });

  if (values.branchId && values.branchId !== current.branchId) {
    try {
  await supabase.rpc("write_audit_log", {
      p_action: "ACQUISITION_BRANCH_CHANGED",
      p_entity_type: "acquisitions",
      p_entity_id: id,
      p_old_values: { branch_id: current.branchId },
      p_new_values: { branch_id: values.branchId },
      p_metadata: null,
    });
  } catch {
    /* audit best-effort */
  }
  }

  try {
  await supabase.rpc("write_audit_log", {
    p_action: "ACQUISITION_UPDATED",
    p_entity_type: "acquisitions",
    p_entity_id: id,
    p_old_values: null,
    p_new_values: patch as import("@/types/database").Json,
    p_metadata: null,
  });
  } catch {
    /* audit best-effort */
  }

  return getAcquisition(id, context);
}

export async function changeAcquisitionStatus(
  id: string,
  values: ChangeAcquisitionStatusValues,
  context: UserContext,
): Promise<ServiceResult<AcquisitionDetail>> {
  if (!hasPermission(context.permissions, "acquisition.edit", context.roles)) {
    return { data: null, error: { code: "forbidden", message: "Not authorized." } };
  }

  if (values.status === "purchased") {
    return confirmAcquisitionPurchase(id, { reason: values.reason }, context);
  }
  if (values.status === "received") {
    return receiveAcquisition(id, { reason: values.reason }, context);
  }
  if (values.status === "approved") {
    return approveAcquisition(id, { note: values.reason }, context);
  }
  if (values.status === "rejected") {
    return rejectAcquisition(id, { reason: values.reason }, context);
  }
  if (values.status === "cancelled") {
    return cancelAcquisition(id, { reason: values.reason }, context);
  }

  const existing = await getAcquisition(id, context);
  if (existing.error || !existing.data) return existing;
  if (!isValidAcquisitionStatusTransition(existing.data.status, values.status)) {
    return {
      data: null,
      error: { code: "invalid_transition", message: "That status change is not allowed." },
    };
  }

  const supabase = await createClient();
  const { error } = await supabase.rpc("change_acquisition_status", {
    p_acquisition_id: id,
    p_new_status: values.status,
    p_reason: values.reason,
  });
  if (error) return { data: null, error: mapDbError(error) };
  return getAcquisition(id, context);
}

export async function approveAcquisition(
  id: string,
  values: ApproveAcquisitionValues,
  context: UserContext,
): Promise<ServiceResult<AcquisitionDetail>> {
  if (!hasPermission(context.permissions, "acquisition.approve", context.roles)) {
    return { data: null, error: { code: "forbidden", message: "Not authorized." } };
  }
  const supabase = await createClient();
  const { error } = await supabase.rpc("approve_acquisition", {
    p_acquisition_id: id,
    p_note: values.note,
  });
  if (error) return { data: null, error: mapDbError(error) };
  return getAcquisition(id, context);
}

export async function rejectAcquisition(
  id: string,
  values: RejectAcquisitionValues,
  context: UserContext,
): Promise<ServiceResult<AcquisitionDetail>> {
  if (!hasPermission(context.permissions, "acquisition.approve", context.roles)) {
    return { data: null, error: { code: "forbidden", message: "Not authorized." } };
  }
  const supabase = await createClient();
  const { error } = await supabase.rpc("reject_acquisition", {
    p_acquisition_id: id,
    p_reason: values.reason,
  });
  if (error) return { data: null, error: mapDbError(error) };
  return getAcquisition(id, context);
}

export async function cancelAcquisition(
  id: string,
  values: CancelAcquisitionValues,
  context: UserContext,
): Promise<ServiceResult<AcquisitionDetail>> {
  if (
    !hasPermission(context.permissions, "acquisition.cancel", context.roles) &&
    !hasPermission(context.permissions, "acquisition.edit", context.roles)
  ) {
    return { data: null, error: { code: "forbidden", message: "Not authorized." } };
  }
  const supabase = await createClient();
  const { error } = await supabase.rpc("cancel_acquisition", {
    p_acquisition_id: id,
    p_reason: values.reason,
  });
  if (error) return { data: null, error: mapDbError(error) };
  return getAcquisition(id, context);
}

export async function confirmAcquisitionPurchase(
  id: string,
  values: { reason?: string | null },
  context: UserContext,
): Promise<ServiceResult<AcquisitionDetail>> {
  if (!hasPermission(context.permissions, "acquisition.edit", context.roles)) {
    return { data: null, error: { code: "forbidden", message: "Not authorized." } };
  }
  const supabase = await createClient();
  const { error } = await supabase.rpc("confirm_acquisition_purchase", {
    p_acquisition_id: id,
    p_reason: values.reason ?? null,
  });
  if (error) return { data: null, error: mapDbError(error) };
  return getAcquisition(id, context);
}

export async function receiveAcquisition(
  id: string,
  values: ReceiveAcquisitionValues,
  context: UserContext,
): Promise<ServiceResult<AcquisitionDetail>> {
  if (!hasPermission(context.permissions, "acquisition.edit", context.roles)) {
    return { data: null, error: { code: "forbidden", message: "Not authorized." } };
  }
  const supabase = await createClient();
  const { error } = await supabase.rpc("receive_acquisition", {
    p_acquisition_id: id,
    p_reason: values.reason ?? null,
  });
  if (error) return { data: null, error: mapDbError(error) };
  return getAcquisition(id, context);
}

export async function addAcquisitionExpense(
  acquisitionId: string,
  values: AcquisitionExpenseValues,
  context: UserContext,
): Promise<ServiceResult<AcquisitionExpense>> {
  if (
    !hasPermission(context.permissions, "acquisition.expense.create", context.roles) &&
    !hasPermission(context.permissions, "acquisition.cost.edit", context.roles) &&
    !hasPermission(context.permissions, "vehicle.cost.edit", context.roles)
  ) {
    return { data: null, error: { code: "forbidden", message: "Not authorized." } };
  }

  const acquisition = await getAcquisition(acquisitionId, context);
  if (acquisition.error || !acquisition.data) return { data: null, error: acquisition.error };
  if (isAcquisitionLocked(acquisition.data.status)) {
    return {
      data: null,
      error: { code: "conflict", message: "Cannot add expenses to a locked acquisition." },
    };
  }

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("vehicle_expenses")
    .insert({
      vehicle_id: acquisition.data.vehicleId,
      acquisition_id: acquisitionId,
      category: values.expenseType,
      description: values.description,
      amount: values.amount,
      currency: values.currency ?? "AED",
      expense_date: values.expenseDate,
      vendor_name: values.vendor,
      reference_number: values.reference,
      created_by: context.userId,
    })
    .select(
      "id, acquisition_id, vehicle_id, category, description, amount, currency, expense_date, vendor_name, reference_number, created_by, created_at",
    )
    .single();

  if (error) return { data: null, error: mapDbError(error) };

  try {
  await supabase.rpc("write_audit_log", {
    p_action: "ACQUISITION_EXPENSE_CREATED",
    p_entity_type: "acquisitions",
    p_entity_id: acquisitionId,
    p_old_values: null,
    p_new_values: { expense_id: (data as ExpenseRow).id, amount: values.amount },
    p_metadata: null,
  });
  } catch {
    /* audit best-effort */
  }

  return { data: mapExpense(data as ExpenseRow), error: null };
}

export async function updateAcquisitionExpense(
  acquisitionId: string,
  expenseId: string,
  values: Partial<AcquisitionExpenseValues>,
  context: UserContext,
): Promise<ServiceResult<AcquisitionExpense>> {
  if (
    !hasPermission(context.permissions, "acquisition.expense.edit", context.roles) &&
    !hasPermission(context.permissions, "acquisition.cost.edit", context.roles) &&
    !hasPermission(context.permissions, "vehicle.cost.edit", context.roles)
  ) {
    return { data: null, error: { code: "forbidden", message: "Not authorized." } };
  }

  const acquisition = await getAcquisition(acquisitionId, context);
  if (acquisition.error || !acquisition.data) return { data: null, error: acquisition.error };
  if (isAcquisitionLocked(acquisition.data.status)) {
    return {
      data: null,
      error: { code: "conflict", message: "Cannot edit expenses on a locked acquisition." },
    };
  }

  const patch: Record<string, unknown> = {};
  if (values.expenseType != null) patch.category = values.expenseType;
  if (values.description !== undefined) patch.description = values.description;
  if (values.amount != null) patch.amount = values.amount;
  if (values.currency != null) patch.currency = values.currency;
  if (values.expenseDate != null) patch.expense_date = values.expenseDate;
  if (values.vendor !== undefined) patch.vendor_name = values.vendor;
  if (values.reference !== undefined) patch.reference_number = values.reference;

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("vehicle_expenses")
    .update(patch)
    .eq("id", expenseId)
    .eq("acquisition_id", acquisitionId)
    .select(
      "id, acquisition_id, vehicle_id, category, description, amount, currency, expense_date, vendor_name, reference_number, created_by, created_at",
    )
    .maybeSingle();

  if (error) return { data: null, error: mapDbError(error) };
  if (!data) return { data: null, error: { code: "not_found", message: "Expense not found." } };

  try {
  await supabase.rpc("write_audit_log", {
    p_action: "ACQUISITION_EXPENSE_UPDATED",
    p_entity_type: "acquisitions",
    p_entity_id: acquisitionId,
    p_old_values: null,
    p_new_values: { expense_id: expenseId, ...patch },
    p_metadata: null,
  });
  } catch {
    /* audit best-effort */
  }

  return { data: mapExpense(data as ExpenseRow), error: null };
}

export async function removeAcquisitionExpense(
  acquisitionId: string,
  expenseId: string,
  context: UserContext,
): Promise<ServiceResult<{ id: string }>> {
  if (
    !hasPermission(context.permissions, "acquisition.expense.edit", context.roles) &&
    !hasPermission(context.permissions, "acquisition.cost.edit", context.roles) &&
    !hasPermission(context.permissions, "vehicle.cost.edit", context.roles)
  ) {
    return { data: null, error: { code: "forbidden", message: "Not authorized." } };
  }

  const acquisition = await getAcquisition(acquisitionId, context);
  if (acquisition.error || !acquisition.data) return { data: null, error: acquisition.error };
  if (isAcquisitionLocked(acquisition.data.status)) {
    return {
      data: null,
      error: { code: "conflict", message: "Cannot remove expenses from a locked acquisition." },
    };
  }

  const supabase = await createClient();
  const { error } = await supabase
    .from("vehicle_expenses")
    .delete()
    .eq("id", expenseId)
    .eq("acquisition_id", acquisitionId);

  if (error) return { data: null, error: mapDbError(error) };

  try {
  await supabase.rpc("write_audit_log", {
    p_action: "ACQUISITION_EXPENSE_REMOVED",
    p_entity_type: "acquisitions",
    p_entity_id: acquisitionId,
    p_old_values: { expense_id: expenseId },
    p_new_values: null,
    p_metadata: null,
  });
  } catch {
    /* audit best-effort */
  }

  return { data: { id: expenseId }, error: null };
}

export async function getAcquisitionHistory(
  id: string,
): Promise<ServiceResult<AcquisitionStatusHistoryItem[]>> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("acquisition_status_history")
    .select("id, acquisition_id, old_status, new_status, reason, changed_by, created_at")
    .eq("acquisition_id", id)
    .order("created_at", { ascending: false });

  if (error) return { data: null, error: mapDbError(error) };

  const rows = (data ?? []) as {
    id: string;
    acquisition_id: string;
    old_status: AcquisitionStatus | null;
    new_status: AcquisitionStatus;
    reason: string | null;
    changed_by: string | null;
    created_at: string;
  }[];

  const names = await loadProfileNames(
    supabase,
    rows.map((r) => r.changed_by),
  );

  return {
    data: rows.map((row) => ({
      id: row.id,
      acquisitionId: row.acquisition_id,
      oldStatus: row.old_status,
      newStatus: row.new_status,
      reason: row.reason,
      changedBy: row.changed_by,
      changedByName: row.changed_by ? (names.get(row.changed_by) ?? null) : null,
      createdAt: row.created_at,
    })),
    error: null,
  };
}

export async function getAcquisitionActivity(
  id: string,
): Promise<ServiceResult<AcquisitionActivityItem[]>> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("audit_logs")
    .select("id, action, user_id, old_values, new_values, metadata, created_at")
    .eq("entity_type", "acquisitions")
    .eq("entity_id", id)
    .order("created_at", { ascending: false })
    .limit(50);

  if (error) return { data: null, error: mapDbError(error) };

  const rows = (data ?? []) as {
    id: string;
    action: string;
    user_id: string | null;
    old_values: Record<string, unknown> | null;
    new_values: Record<string, unknown> | null;
    metadata: Record<string, unknown> | null;
    created_at: string;
  }[];

  const names = await loadProfileNames(
    supabase,
    rows.map((r) => r.user_id),
  );

  return {
    data: rows.map((row) => ({
      id: row.id,
      action: row.action,
      actorId: row.user_id,
      actorName: row.user_id ? (names.get(row.user_id) ?? null) : null,
      oldValues: row.old_values,
      newValues: row.new_values,
      metadata: row.metadata,
      createdAt: row.created_at,
    })),
    error: null,
  };
}

export async function getAcquisitionMeta(
  branchId?: string,
  makeId?: string,
): Promise<ServiceResult<AcquisitionMeta>> {
  const supabase = await createClient();

  const { data: branches } = await supabase
    .from("branches")
    .select("id, name, code")
    .eq("is_active", true)
    .order("name");

  const { data: makes } = await supabase
    .from("vehicle_makes")
    .select("id, name")
    .eq("is_active", true)
    .order("sort_order")
    .order("name");

  let modelsQuery = supabase
    .from("vehicle_models")
    .select("id, make_id, name")
    .eq("is_active", true)
    .order("name");
  if (makeId) modelsQuery = modelsQuery.eq("make_id", makeId);
  const { data: models } = await modelsQuery;

  void branchId;

  return {
    data: {
      branches: ((branches ?? []) as { id: string; name: string; code: string | null }[]).map(
        (b) => ({ id: b.id, name: b.name, code: b.code }),
      ),
      makes: ((makes ?? []) as { id: string; name: string }[]).map((m) => ({
        id: m.id,
        name: m.name,
      })),
      models: ((models ?? []) as { id: string; make_id: string; name: string }[]).map((m) => ({
        id: m.id,
        makeId: m.make_id,
        name: m.name,
      })),
      sourceTypes: [
        "individual_owner",
        "dealer",
        "auction",
        "trade_in",
        "fleet",
        "importer",
        "company",
        "broker",
        "other",
      ],
      expenseTypes: [
        "transportation",
        "auction",
        "broker_fee",
        "registration",
        "insurance",
        "import_duty",
        "clearance",
        "inspection",
        "customs",
        "other",
      ],
      statuses: [
        "draft",
        "sourcing",
        "negotiating",
        "pending_approval",
        "approved",
        "purchased",
        "documents_pending",
        "received",
        "cancelled",
        "rejected",
      ],
    },
    error: null,
  };
}

export async function getAcquisitionForVehicle(
  vehicleId: string,
  context: UserContext,
): Promise<ServiceResult<AcquisitionListItem | null>> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("acquisitions")
    .select(LIST_SELECT)
    .eq("vehicle_id", vehicleId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) return { data: null, error: mapDbError(error) };
  if (!data) return { data: null, error: null };

  const items = await attachCosts(supabase, [mapListItem(data as unknown as AcquisitionRow)], context);
  return { data: items[0] ?? null, error: null };
}
