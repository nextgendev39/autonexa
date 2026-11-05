import "server-only";

import { createClient } from "@/lib/supabase/server";
import {
  DEFAULT_PAYMENT_TERMS,
  MAX_TERM_MINUTES,
  PAYMENT_TERM_KEYS,
  type PaymentTerms,
  type PaymentTermsValues,
} from "@/lib/validation/payment-terms";

const toMinutes = (value: unknown, fallback: number) => {
  const n = typeof value === "number" ? value : Number.NaN;
  return Number.isInteger(n) && n >= 1 && n <= MAX_TERM_MINUTES ? n : fallback;
};

export const PAYMENT_TERM_KEY_LIST = [
  PAYMENT_TERM_KEYS.depositMinutes,
  PAYMENT_TERM_KEYS.balanceMinutes,
] as const;

export function paymentTermsFromSettings(rows: { key: string; value: unknown }[]): PaymentTerms {
  const values = new Map(rows.map((row) => [row.key, row.value]));
  return {
    depositMinutes: toMinutes(values.get(PAYMENT_TERM_KEYS.depositMinutes), DEFAULT_PAYMENT_TERMS.depositMinutes),
    balanceMinutes: toMinutes(values.get(PAYMENT_TERM_KEYS.balanceMinutes), DEFAULT_PAYMENT_TERMS.balanceMinutes),
  };
}

/**
 * The signed-in dealership's booking payment deadlines from Settings (same fallbacks as
 * public.tenant_term_minutes()). RLS limits the rows to their own dealership.
 */
export async function getPaymentTerms(): Promise<PaymentTerms> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("system_settings")
    .select("key, value")
    .in("key", [...PAYMENT_TERM_KEY_LIST]);
  return paymentTermsFromSettings((data ?? []) as { key: string; value: unknown }[]);
}

/**
 * RLS limits writes to settings.manage. Update-then-insert instead of an upsert: it works both
 * before and after system_settings changes from one row per key to one row per dealership.
 */
export async function updatePaymentTerms(values: PaymentTermsValues, userId: string) {
  const supabase = await createClient();
  const entries = [
    { key: PAYMENT_TERM_KEYS.depositMinutes, value: values.depositMinutes },
    { key: PAYMENT_TERM_KEYS.balanceMinutes, value: values.balanceMinutes },
  ];
  for (const { key, value } of entries) {
    const { data, error } = await supabase
      .from("system_settings")
      .update({ value, updated_by: userId })
      .eq("key", key)
      .select("key");
    if (error) return error.message;
    if ((data ?? []).length > 0) continue;
    const { error: insertError } = await supabase
      .from("system_settings")
      .insert({ key, value, updated_by: userId });
    if (insertError) return insertError.message;
  }
  return null;
}
