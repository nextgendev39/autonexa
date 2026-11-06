/** Shared by the console page, its client table and the API. Mirrors public.demo_requests. */

export const demoRequestStatuses = ["new", "contacted", "demo_booked", "converted", "lost"] as const;
export type DemoRequestStatus = (typeof demoRequestStatuses)[number];

export type DemoRequestRow = {
  id: string;
  name: string;
  dealership: string | null;
  phone: string | null;
  email: string | null;
  stock: string | null;
  notes: string | null;
  locale: string | null;
  status: DemoRequestStatus;
  tenant_id: string | null;
  tenant_name: string | null;
  staff_notes: string | null;
  email_sent: boolean;
  status_changed_at: string | null;
  created_at: string;
  updated_at: string;
  /** Set when the request's email already belongs to a login. */
  account_user_id: string | null;
  account_tenant_id: string | null;
  account_tenant_name: string | null;
  account_last_sign_in_at: string | null;
};
