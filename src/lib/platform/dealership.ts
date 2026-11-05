import "server-only";

import { createClient } from "@/lib/supabase/server";

export type DealershipPlan = {
  plan: string;
  status: string;
  periodEnd: string | null;
  limits: { users: number | null; branches: number | null; vehicles: number | null; storageMb: number | null };
  usage: { users: number; branches: number; vehicles: number; storageBytes: number };
};

/** The signed-in dealership's own plan. The function takes no ID, so it can't be aimed elsewhere. */
export async function getDealershipPlan() {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("current_tenant_plan" as never);
  return error ? null : ((data as unknown as DealershipPlan | null) ?? null);
}

/** RLS limits these to this dealership, and hides drafts. */
export async function listOwnInvoices() {
  const supabase = await createClient();
  const { data } = await supabase
    .from("subscription_invoices" as never)
    .select("id, invoice_number, amount, currency, status, due_at")
    .order("issued_at", { ascending: false })
    .limit(10);
  return (data ?? []) as unknown as {
    id: string;
    invoice_number: string;
    amount: number;
    currency: string;
    status: string;
    due_at: string | null;
  }[];
}
