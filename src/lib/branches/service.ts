import { currentTenantClient } from "@/lib/server/privileged";
import { createClient } from "@/lib/supabase/server";

export type BranchListItem = {
  id: string;
  name: string;
  code: string;
  emirate: string;
  city: string;
  addressLine1: string;
  phone: string | null;
  email: string | null;
  isActive: boolean;
  stats: BranchStats;
};

/** Live numbers for a branch card. Car counts are units, so a 5-unit record counts 5. */
export type BranchStats = {
  inTransit: number;
  ready: number;
  booked: number;
  /** Everything not sold yet: in transit, in the workshop, ready and booked. */
  inStock: number;
  /** Active staff whose home branch this is. */
  team: number;
};

const emptyStats = (): BranchStats => ({ inTransit: 0, ready: 0, booked: 0, inStock: 0, team: 0 });
const OUT_OF_STOCK = new Set(["sold", "delivered", "archived", "returned"]);

type BranchRow = {
  id: string;
  name: string;
  code: string;
  emirate: string;
  city: string;
  address_line_1: string;
  phone: string | null;
  email: string | null;
  is_active: boolean;
};

// Uses the caller's session so RLS limits results to branches they can access.
export async function listBranchesForUser(): Promise<BranchListItem[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("branches")
    .select("id, name, code, emirate, city, address_line_1, phone, email, is_active")
    .order("name");

  const rows = (data ?? []) as BranchRow[];
  const stats = await branchStats(rows.map((b) => b.id));
  return rows.map((b) => ({
    id: b.id,
    name: b.name,
    code: b.code,
    emirate: b.emirate,
    city: b.city,
    addressLine1: b.address_line_1,
    phone: b.phone,
    email: b.email,
    isActive: b.is_active,
    stats: stats.get(b.id) ?? emptyStats(),
  }));
}

async function branchStats(branchIds: string[]) {
  const stats = new Map(branchIds.map((id) => [id, emptyStats()]));
  if (branchIds.length === 0) return stats;

  // Cars through the caller's session (RLS); staff as bare counts with the service role,
  // since people can't read every profile themselves. Only branch ids are read.
  const [{ data: vehicles }, { data: staff }] = await Promise.all([
    (await createClient())
      .from("vehicles")
      .select("branch_id, status, quantity")
      .in("branch_id", branchIds)
      .is("deleted_at", null),
    (await currentTenantClient())
      .from("profiles")
      .select("branch_id")
      .in("branch_id", branchIds)
      .eq("status", "active")
      .is("deleted_at", null),
  ]);

  for (const v of (vehicles ?? []) as {
    branch_id: string;
    status: string;
    quantity: number | null;
  }[]) {
    const entry = stats.get(v.branch_id);
    if (!entry || OUT_OF_STOCK.has(v.status)) continue;
    const units = v.quantity ?? 1;
    entry.inStock += units;
    if (v.status === "acquired") entry.inTransit += units;
    if (v.status === "ready_for_sale") entry.ready += units;
    if (v.status === "reserved") entry.booked += units;
  }
  for (const p of (staff ?? []) as { branch_id: string }[]) {
    const entry = stats.get(p.branch_id);
    if (entry) entry.team += 1;
  }
  return stats;
}
