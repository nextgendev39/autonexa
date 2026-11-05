import type { PGlite } from "@electric-sql/pglite";
import { exists, rows } from "./harness";

/** Fixed ID of the first tenant; the tenancy migration must register Zohaan Motors with it. */
export const ZOHAAN_TENANT_ID = "00000000-0000-4000-8000-000000000001";
export const SECOND_TENANT_ID = "00000000-0000-4000-8000-000000000002";

export type TenantKey = "a" | "b";

const nib = { a: "a", b: "b" } as const;
const tableCode: Record<string, string> = {
  profile: "01",
  branch: "02",
  location: "03",
  customer: "04",
  supplier: "05",
  vehicle: "06",
  photo: "07",
  expense: "08",
  pricing: "09",
  pricingHistory: "10",
  statusHistory: "11",
  shareLink: "12",
  acquisition: "13",
  acquisitionHistory: "14",
  reservation: "15",
  sale: "16",
  document: "17",
  staffDocument: "18",
  notification: "19",
  push: "20",
  userRole: "21",
  plainUser: "22",
  storageObject: "23",
  auditLog: "24",
  staffRole: "25",
  looseExpense: "26",
};

/** Deterministic IDs: id("a", "vehicle") is always tenant A's vehicle. */
export function id(tenant: TenantKey, entity: keyof typeof tableCode) {
  return `${nib[tenant].repeat(8)}-0000-4000-8000-0000000000${tableCode[entity]}`;
}

export const tenantIdOf = (tenant: TenantKey) =>
  tenant === "a" ? ZOHAAN_TENANT_ID : SECOND_TENANT_ID;

async function hasTenantColumn(db: PGlite, table: string) {
  const [row] = await rows<{ found: boolean }>(
    db,
    `select exists (select 1 from information_schema.columns
       where table_schema = 'public' and table_name = $1 and column_name = 'tenant_id') as found`,
    [table],
  );
  return row.found;
}

/** Inserts as superuser, stating the tenant explicitly when the table has the column yet. */
async function insert(
  db: PGlite,
  tenant: TenantKey,
  table: string,
  values: Record<string, unknown>,
) {
  const row = { ...values };
  if (await hasTenantColumn(db, table)) row.tenant_id = tenantIdOf(tenant);
  const columns = Object.keys(row);
  await db.query(
    `insert into public.${table} (${columns.join(", ")})
     values (${columns.map((_, i) => `$${i + 1}`).join(", ")})`,
    Object.values(row),
  );
}

async function ensureTenants(db: PGlite) {
  if (!(await exists(db, "public.tenants"))) return;
  await db.query(
    `insert into public.tenants (id, name, slug, status, number_prefix)
     values ($1, 'Second Dealership', 'second-dealership', 'active', 'SD')
     on conflict (id) do nothing`,
    [SECOND_TENANT_ID],
  );
}

async function addMember(db: PGlite, tenant: TenantKey, userId: string) {
  if (!(await exists(db, "public.tenant_members"))) return;
  await db.query(
    `insert into public.tenant_members (tenant_id, user_id, status) values ($1, $2, 'active')
     on conflict do nothing`,
    [tenantIdOf(tenant), userId],
  );
}

/** One row in every tenant-owned table, owned by a super_admin of that dealership. */
export async function seedTenant(db: PGlite, t: TenantKey) {
  await db.exec(`set app.bypass_vehicle_cost_guard = 'true'`);
  await ensureTenants(db);
  const unique = t === "a" ? "1" : "2";
  const userId = id(t, "profile");

  await db.query(`insert into auth.users (id, email) values ($1, $2), ($3, $4)`, [
    userId,
    `owner-${t}@example.test`,
    id(t, "plainUser"),
    `staff-${t}@example.test`,
  ]);
  await insert(db, t, "branches", {
    id: id(t, "branch"),
    name: `Branch ${t}`,
    code: `BR-${t}`,
    emirate: "dubai",
    address_line_1: "Road",
    city: "Dubai",
  });
  // Tenant and branch change together: a profile's branch must be in the profile's tenant.
  const scoped = await hasTenantColumn(db, "profiles");
  await db.query(
    `update public.profiles set status = 'active', branch_id = $1${scoped ? ", tenant_id = $4" : ""}
     where id in ($2, $3)`,
    [id(t, "branch"), userId, id(t, "plainUser"), ...(scoped ? [tenantIdOf(t)] : [])],
  );
  await addMember(db, t, userId);
  await addMember(db, t, id(t, "plainUser"));

  await db.exec(`insert into public.roles (key, name, is_system) values ('super_admin', 'Super Admin', true)
    on conflict (key) do nothing`);
  const [role] = await rows<{ id: string }>(
    db,
    `select id from public.roles where key = 'super_admin'`,
  );
  await insert(db, t, "user_roles", { id: id(t, "userRole"), user_id: userId, role_id: role.id });

  // A removable assignment on a staff user, for role-management tests.
  await db.exec(`insert into public.roles (key, name) values ('test_staff', 'Test Staff')
    on conflict (key) do nothing`);
  const [staffRole] = await rows<{ id: string }>(
    db,
    `select id from public.roles where key = 'test_staff'`,
  );
  await insert(db, t, "user_roles", {
    id: id(t, "staffRole"),
    user_id: id(t, "plainUser"),
    role_id: staffRole.id,
  });

  await insert(db, t, "branch_locations", {
    id: id(t, "location"),
    branch_id: id(t, "branch"),
    name: `Yard ${t}`,
  });
  await insert(db, t, "customers", {
    id: id(t, "customer"),
    customer_code: `CUS-${t}`,
    first_name: "Cust",
    last_name: t,
    display_name: `Customer ${t}`,
    phone: `+97150000000${unique}`,
    created_by: userId,
  });
  await insert(db, t, "suppliers", { id: id(t, "supplier"), name: `Supplier ${t}` });
  await insert(db, t, "vehicles", {
    id: id(t, "vehicle"),
    stock_number: `STK-${t}`,
    make: "Toyota",
    model: "Camry",
    year: 2024,
    mileage: 100,
    branch_id: id(t, "branch"),
    source: "other",
    status: "ready_for_sale",
    vin: `1HGCM82633A00000${unique}`,
    chassis_number: `CHS-${t}`,
    total_acquisition_cost: 1000,
    minimum_selling_price: 5000,
  });
  await insert(db, t, "vehicle_photos", {
    id: id(t, "photo"),
    vehicle_id: id(t, "vehicle"),
    storage_path: `${id(t, "vehicle")}/gallery/p.jpg`,
    category: "front",
    file_name: "p.jpg",
  });
  await insert(db, t, "vehicle_pricing", { id: id(t, "pricing"), vehicle_id: id(t, "vehicle") });
  await insert(db, t, "vehicle_pricing_history", {
    id: id(t, "pricingHistory"),
    vehicle_id: id(t, "vehicle"),
  });
  await insert(db, t, "vehicle_status_history", {
    id: id(t, "statusHistory"),
    vehicle_id: id(t, "vehicle"),
    new_status: "ready_for_sale",
  });
  await insert(db, t, "vehicle_share_links", {
    id: id(t, "shareLink"),
    token: `token-for-tenant-${t}-000000`,
    vehicle_id: id(t, "vehicle"),
    created_by: userId,
  });
  await insert(db, t, "acquisitions", {
    id: id(t, "acquisition"),
    vehicle_id: id(t, "vehicle"),
    branch_id: id(t, "branch"),
    purchase_price: 1000,
    source_type: "dealer",
    acquisition_number: `ACQ-${t}`,
    status: "draft",
  });
  await insert(db, t, "vehicle_expenses", {
    id: id(t, "expense"),
    vehicle_id: id(t, "vehicle"),
    category: "other",
    amount: 250,
    acquisition_id: id(t, "acquisition"),
    expense_date: "2026-01-01",
  });
  await insert(db, t, "vehicle_expenses", {
    id: id(t, "looseExpense"),
    vehicle_id: id(t, "vehicle"),
    category: "other",
    amount: 75,
    expense_date: "2026-01-01",
  });
  await insert(db, t, "acquisition_status_history", {
    id: id(t, "acquisitionHistory"),
    acquisition_id: id(t, "acquisition"),
    new_status: "draft",
  });
  await insert(db, t, "reservations", {
    id: id(t, "reservation"),
    reservation_number: `BK-${t}`,
    vehicle_id: id(t, "vehicle"),
    customer_id: id(t, "customer"),
    branch_id: id(t, "branch"),
    amount: 0,
    status: "active",
    reserved_at: "2020-01-01T00:00:00Z",
    salesperson_id: userId,
  });
  await insert(db, t, "sales", {
    id: id(t, "sale"),
    sale_number: `SL-${t}`,
    vehicle_id: id(t, "vehicle"),
    customer_id: id(t, "customer"),
    branch_id: id(t, "branch"),
    status: "quotation",
    vehicle_price: 5000,
    final_amount: 5000,
  });
  await db.exec(`insert into public.document_types (key, name) values ('test', 'Test')
    on conflict (key) do nothing`);
  const [docType] = await rows<{ id: string }>(
    db,
    `select id from public.document_types where key = 'test'`,
  );
  await insert(db, t, "documents", {
    id: id(t, "document"),
    document_type_id: docType.id,
    entity_type: "vehicle",
    entity_id: id(t, "vehicle"),
    storage_path: `${id(t, "vehicle")}/d.pdf`,
    file_name: "d.pdf",
    branch_id: id(t, "branch"),
  });
  await insert(db, t, "staff_documents", {
    id: id(t, "staffDocument"),
    user_id: userId,
    category: "other",
    title: "ID",
    file_name: "i.pdf",
    storage_path: `${userId}/i.pdf`,
  });
  await insert(db, t, "notifications", {
    id: id(t, "notification"),
    user_id: userId,
    type: "test",
    title: "T",
    message: `Note ${t}`,
  });
  await insert(db, t, "push_subscriptions", {
    id: id(t, "push"),
    user_id: userId,
    endpoint: `https://push.test/${t}`,
    p256dh: "k",
    auth: "a",
  });
  await insert(db, t, "audit_logs", {
    id: id(t, "auditLog"),
    action: "seed",
    entity_type: "test",
  });
  if (await hasTenantColumn(db, "system_settings")) {
    // Until 00074 makes the key per-tenant, the second tenant's marker simply cannot exist.
    await db.query(
      `insert into public.system_settings (tenant_id, key, value) values ($1, 'test.marker', $2)
       on conflict do nothing`,
      [tenantIdOf(t), JSON.stringify(`secret-${t}`)],
    );
  } else if (t === "a") {
    await insert(db, t, "system_settings", {
      key: "test.marker",
      value: JSON.stringify("secret-a"),
    });
  }
  await db.query(`insert into storage.objects (bucket_id, name) values ('vehicle-photos', $1)`, [
    `${id(t, "vehicle")}/gallery/p.jpg`,
  ]);
}
