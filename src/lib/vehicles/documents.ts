import type { UserContext } from "@/types/auth";
import type {
  VehicleCostSummary,
  VehicleDocumentCounts,
  VehicleDocumentItem,
  VehicleDocumentSource,
  VehicleDocumentsResult,
} from "@/types/vehicle-document";
import { createClient } from "@/lib/supabase/server";
import { getRootVehicleId } from "@/lib/vehicles/service";
import { createSignedStorageUrl, type StorageBucket } from "@/lib/storage/signed-url";
import { hasPermission, type Permission } from "@/lib/permissions";
import { seesSalesPricingOnly } from "@/lib/permissions/roles";

export type ServiceError = {
  code: "forbidden" | "not_found" | "unknown";
  message: string;
};

export type ServiceResult<T> = { data: T | null; error: ServiceError | null };

type DocRow = {
  id: string;
  entity_type: string;
  entity_id: string;
  storage_path: string;
  file_name: string;
  title: string | null;
  original_file_name: string | null;
  mime_type: string | null;
  file_size: number | null;
  reference_number: string | null;
  notes: string | null;
  uploaded_by: string | null;
  created_at: string;
  document_types?: { key: string; name: string } | { key: string; name: string }[] | null;
};

type ExpenseRow = {
  document_id: string | null;
  amount: number;
  currency: string;
  reference_number: string | null;
  category: string;
};

function canViewDocs(context: UserContext) {
  return (
    hasPermission(context.permissions, "document.view", context.roles) ||
    hasPermission(context.permissions, "vehicle.view", context.roles)
  );
}

function canViewCosts(context: UserContext) {
  // Sales executives hold pricing.view but must never see vehicle costs.
  const can = (permission: Permission) =>
    hasPermission(context.permissions, permission, context.roles);
  if (seesSalesPricingOnly(context.roles, can)) return false;
  return (
    hasPermission(context.permissions, "vehicle.cost.view", context.roles) ||
    hasPermission(context.permissions, "pricing.view", context.roles) ||
    hasPermission(context.permissions, "vehicle.profit.view", context.roles)
  );
}

function asRelation<T>(value: T | T[] | null | undefined): T | null {
  if (!value) return null;
  return Array.isArray(value) ? (value[0] ?? null) : value;
}

function sourceFromEntityType(entityType: string): VehicleDocumentSource {
  switch (entityType) {
    case "acquisitions":
      return "acquisition";
    case "vehicle_pricing":
      return "pricing";
    default:
      return "general";
  }
}

function bucketForSource(_source: VehicleDocumentSource, kind: "document" | "photo"): StorageBucket {
  return kind === "photo" ? "vehicle-photos" : "vehicle-documents";
}

async function loadNames(
  supabase: Awaited<ReturnType<typeof createClient>>,
  ids: Array<string | null>,
) {
  const unique = [...new Set(ids.filter((id): id is string => Boolean(id)))];
  const map = new Map<string, string>();
  if (unique.length === 0) return map;
  const { data } = await supabase.from("profiles").select("id, display_name").in("id", unique);
  for (const row of (data ?? []) as { id: string; display_name: string }[]) {
    map.set(row.id, row.display_name);
  }
  return map;
}

async function attachSignedUrls(items: VehicleDocumentItem[]): Promise<VehicleDocumentItem[]> {
  return Promise.all(
    items.map(async (item) => {
      const { url } = await createSignedStorageUrl(
        item.bucket as StorageBucket,
        item.storagePath,
      );
      return { ...item, url };
    }),
  );
}

function emptyCounts(): VehicleDocumentCounts {
  return {
    all: 0,
    general: 0,
    acquisition: 0,
    reconditioning: 0,
    pricing: 0,
  };
}

export async function getVehicleCostSummary(
  vehicleId: string,
  context: UserContext,
): Promise<ServiceResult<VehicleCostSummary>> {
  if (!canViewCosts(context)) {
    return {
      data: {
        purchaseCost: null,
        acquisitionExpenses: null,
        workshopCost: null,
        otherCosts: null,
        totalVehicleCost: null,
        currency: "AED",
        canView: false,
      },
      error: null,
    };
  }

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("get_vehicle_total_cost", {
    p_vehicle_id: vehicleId,
  });

  if (error) {
    return { data: null, error: { code: "unknown", message: error.message } };
  }

  const row = Array.isArray(data) ? data[0] : data;
  if (!row) {
    return {
      data: {
        purchaseCost: 0,
        acquisitionExpenses: 0,
        workshopCost: 0,
        otherCosts: 0,
        totalVehicleCost: 0,
        currency: "AED",
        canView: true,
      },
      error: null,
    };
  }

  const r = row as {
    purchase_cost: number;
    acquisition_expenses: number;
    workshop_cost: number;
    other_costs: number;
    total_vehicle_cost: number;
  };

  return {
    data: {
      purchaseCost: Number(r.purchase_cost ?? 0),
      acquisitionExpenses: Number(r.acquisition_expenses ?? 0),
      workshopCost: Number(r.workshop_cost ?? 0),
      otherCosts: Number(r.other_costs ?? 0),
      totalVehicleCost: Number(r.total_vehicle_cost ?? 0),
      currency: "AED",
      canView: true,
    },
    error: null,
  };
}

export async function getVehicleDocuments(
  vehicleId: string,
  context: UserContext,
): Promise<ServiceResult<VehicleDocumentsResult>> {
  if (!canViewDocs(context)) {
    return { data: null, error: { code: "forbidden", message: "Not authorized." } };
  }

  const supabase = await createClient();
  const { data: vehicle, error: vehicleError } = await supabase
    .from("vehicles")
    .select("id, split_from_id")
    .eq("id", vehicleId)
    .is("deleted_at", null)
    .maybeSingle();

  if (vehicleError) {
    return { data: null, error: { code: "unknown", message: vehicleError.message } };
  }
  if (!vehicle) {
    return { data: null, error: { code: "not_found", message: "Vehicle not found." } };
  }

  const errors: VehicleDocumentsResult["errors"] = {};
  const items: VehicleDocumentItem[] = [];
  const showAmounts = canViewCosts(context);

  // Split records share the acquisition (and its documents) of the record they came from.
  const acquisitionVehicleId = await getRootVehicleId(
    vehicleId,
    (vehicle as { split_from_id?: string | null }).split_from_id,
  );
  const acquisitionsRes = await supabase
    .from("acquisitions")
    .select("id")
    .in("vehicle_id", [...new Set([vehicleId, acquisitionVehicleId])]);
  const acquisitionIds = ((acquisitionsRes.data ?? []) as { id: string }[]).map((r) => r.id);

  // Generic documents for vehicle + related entities
  try {
    const entityFilters: Array<{ type: string; ids: string[] }> = [
      { type: "vehicles", ids: [vehicleId] },
      { type: "acquisitions", ids: acquisitionIds },
    ];

    for (const group of entityFilters) {
      if (group.ids.length === 0) continue;
      const { data, error } = await supabase
        .from("documents")
        .select(
          "id, entity_type, entity_id, storage_path, file_name, title, original_file_name, mime_type, file_size, reference_number, notes, uploaded_by, created_at, document_types:document_type_id ( key, name )",
        )
        .eq("entity_type", group.type)
        .in("entity_id", group.ids)
        .is("deleted_at", null)
        .eq("status", "active")
        .order("created_at", { ascending: false });

      if (error) {
        const source = sourceFromEntityType(group.type);
        errors[source] = error.message;
        continue;
      }

      const rows = (data ?? []) as DocRow[];
      const names = await loadNames(
        supabase,
        rows.map((row) => row.uploaded_by),
      );

      // Amounts from vehicle_expenses linked by document_id
      const docIds = rows.map((row) => row.id);
      const expenseMap = new Map<string, ExpenseRow>();
      if (showAmounts && docIds.length > 0) {
        const { data: expenses } = await supabase
          .from("vehicle_expenses")
          .select("document_id, amount, currency, reference_number, category")
          .eq("vehicle_id", vehicleId)
          .in("document_id", docIds);
        for (const expense of (expenses ?? []) as ExpenseRow[]) {
          if (expense.document_id) expenseMap.set(expense.document_id, expense);
        }
      }

      for (const row of rows) {
        const source = sourceFromEntityType(row.entity_type);
        const type = asRelation(row.document_types);
        const expense = expenseMap.get(row.id);
        items.push({
          id: `doc:${row.id}`,
          vehicleId,
          source,
          sourceEntityId: row.entity_id,
          category: type?.key ?? "other",
          categoryLabel: type?.name ?? "Other",
          name:
            row.title?.trim() ||
            row.original_file_name ||
            row.file_name ||
            type?.name ||
            "Document",
          mimeType: row.mime_type,
          fileSize: row.file_size,
          storagePath: row.storage_path,
          bucket: bucketForSource(source, "document"),
          createdBy: row.uploaded_by,
          createdByName: row.uploaded_by ? (names.get(row.uploaded_by) ?? null) : null,
          createdAt: row.created_at,
          amount: showAmounts && expense ? Number(expense.amount) : null,
          currency: showAmounts && expense ? expense.currency : null,
          referenceNumber: row.reference_number ?? expense?.reference_number ?? null,
          url: null,
          kind: "document",
        });
      }
    }
  } catch (error) {
    errors.general = error instanceof Error ? error.message : "Failed to load documents";
  }

  items.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  const signedItems = await attachSignedUrls(items);

  const counts = emptyCounts();
  for (const item of signedItems) {
    counts.all += 1;
    counts[item.source] += 1;
  }

  return { data: { items: signedItems, counts, errors }, error: null };
}
