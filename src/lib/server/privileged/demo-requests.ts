import "server-only";

import { createPrivilegedClient, hasServiceRoleKey } from "./client";

/**
 * Service-role steps for landing-page demo requests. Visitors have no session, and the table has
 * no client insert policy, so saving one only happens here.
 */
export type DemoRequestInput = {
  name: string;
  dealership: string;
  phone: string;
  email: string;
  stock: string;
  notes: string;
  locale: string;
};

const blank = (value: string) => value.trim() || null;

/** Returns the new request's id, or null when it couldn't be stored. */
export async function saveDemoRequest(input: DemoRequestInput): Promise<string | null> {
  if (!hasServiceRoleKey()) return null;
  const { data, error } = await createPrivilegedClient()
    .from("demo_requests" as never)
    .insert({
      name: input.name,
      dealership: blank(input.dealership),
      phone: blank(input.phone),
      email: blank(input.email),
      stock: blank(input.stock),
      notes: blank(input.notes),
      locale: input.locale,
    } as never)
    .select("id")
    .single();
  if (error) {
    console.error("[landing] could not store a demo request", error.message);
    return null;
  }
  return (data as unknown as { id: string }).id;
}

export async function markDemoRequestEmailed(id: string) {
  const { error } = await createPrivilegedClient()
    .from("demo_requests" as never)
    .update({ email_sent: true } as never)
    .eq("id", id);
  if (error) console.error("[landing] could not mark a demo request as emailed", error.message);
}
