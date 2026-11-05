# SaaS Phase 2: tenant-aware modules

Audit of every module against the Phase 1 tenant architecture, and the checklist for closing the
gaps. Nothing here has been deployed.

## How isolation works

| Layer | Mechanism |
|---|---|
| Who is acting | `current_tenant_id()` reads `tenant_members` only. No JWT claim, header, or setting can influence it. |
| Reads and writes in the browser session | Permissive policies decide permissions. A restrictive `tenant_isolation` policy is ANDed on top, so no permissive policy can widen past the tenant. |
| Service-role code | `tenantClient()` / `currentTenantClient()` stamp and filter `tenant_id`. `platformClient()` is limited to a reviewed allowlist. |
| Related rows | Composite foreign keys `(tenant_id, x_id) -> (tenant_id, id)` make a cross-tenant link impossible. |
| Definer functions | Bypass RLS, so each checks `can_access_branch` / `has_permission_for_branch`, both of which are tenant-bound. |
| Files | Paths start with the owning record's ID. Storage policies resolve that record and check its tenant. |
| Branches | `user_roles.branch_id` (null means all branches) through `can_access_branch` / `has_permission_for_branch`. |

## Findings

Baseline before this work: 51 of 265 tenancy tests failing.

| # | Severity | Finding | Fix |
|---|---|---|---|
| 1 | Critical | No restrictive tenant policy on any of the 23 tenant tables. The contract stage (`00074`) that Phase 1 refers to was never written, so customers, suppliers, branches, profiles, roles, settings and audit logs could be read across tenants. | `00074` |
| 2 | Critical | Definer functions were executable by `anon`, the public key. `write_audit_log` wrote a forged row into any tenant without logging in, and `split_vehicle_units` / `undo_vehicle_split` ran with no session. | `00075` |
| 3 | Critical | Composite keys from `00072` break PostgREST embeds written as `branches:branch_id (...)`, which only resolve single-column keys. Affects Inventory, Acquisitions and the public share page. Not visible to the PGlite tests. | Embeds now name the constraint |
| 4 | High | A tenant admin could set their own `profiles.tenant_id` and join another tenant. Only an unrelated foreign key stopped it, and only if they had notifications. | `00074` restrictive `WITH CHECK` |
| 5 | High | A photo or document row could name another tenant's `storage_path`. Service-role code then signs (share page) or deletes that file. | `00075` trigger |
| 6 | High | `write_audit_log` trusted a tenant from its payload for any caller with no active tenant. | `00075` |
| 7 | High | A tenant admin could edit the catalog, roles and role permissions shared by every tenant. | `00074`, platform admins only |
| 8 | Medium | `system_settings` primary key was `key` alone, so a second tenant could not save payment terms. | `00074` |
| 9 | Medium | `documents.entity_id` has no foreign key and could name another tenant's record. | `00075` trigger |
| 10 | Medium | Actor columns (`created_by`, `sold_by`, ...) were plain keys, so a row could name another tenant's person. | `00076` |
| 11 | Medium | "Run checks now" returned sweep counts covering every tenant. | Route returns no cross-tenant counts |
| 12 | Medium | Share links kept working for a suspended tenant. | `share.ts` |
| 13 | Medium | Sale and ready-for-sale alerts went to the whole tenant, including branch-limited staff of other branches. | Recipients follow branch access |
| 14 | Medium | The UI could only assign all-branch roles, so branch-level access was unreachable. | Optional branch on invite and edit |
| 15 | Low | A booking could reference a customer the caller cannot see. | RLS read first |
| 16 | Low | Recent searches survived sign-out in the same tab. | Cleared on sign-out |
| 17 | Low | The next-deadline time sent to browsers could come from another tenant's bookings. | Tracked per tenant |

## Migration checklist

| Module | Tables | RLS | Service-role paths | Files | Tests |
|---|---|---|---|---|---|
| Inventory | `vehicles`, `vehicle_photos`, `vehicle_expenses`, `vehicle_status_history`, `vehicle_share_links` | [x] | [x] scoped client, embeds fixed | [x] | [x] |
| Acquisition | `acquisitions`, `acquisition_status_history`, `suppliers` | [x] | [x] embeds fixed | [x] | [x] |
| Pricing | `vehicle_pricing`, `vehicle_pricing_history` | [x] | [x] definer RPCs | n/a | [x] |
| Customers | `customers` | [x] | [x] scoped client | [x] | [x] |
| Reservations | `reservations` | [x] | [x] scoped client, customer check | n/a | [x] |
| Sales | `sales`, plus reservations marked sold | [x] | [x] | [x] | [x] |
| Payments | Columns on `reservations` and `sales` | [x] | [x] sweeps per tenant | n/a | [x] |
| Documents | `documents`, `staff_documents` | [x] | [x] paths from rows, guard trigger | [x] | [x] |
| Notifications | `notifications`, `push_subscriptions` | [x] | [x] recipients per tenant and branch | n/a | [x] |
| Reports | Dashboard reads through RLS; `audit_logs` | [x] | [x] | n/a | [x] |
| Branches and users | `branches`, `branch_locations`, `profiles`, `user_roles` | [x] | [x] | n/a | [x] |
| Settings | `system_settings` | [x] | n/a | n/a | [x] |

## Modules with no tables

These were named in the brief but do not exist. `00063` deliberately dropped them, and no code
reads them. Nothing was recreated, because the brief says not to duplicate modules. Their permission
keys (`lead.*`, `invoice.*`, `report.*`) remain in the roles data, unused.

| Module | State |
|---|---|
| Leads | Tables dropped in `00063`. No routes or UI. |
| Inspection | Tables dropped in `00063`. Ready for sale no longer needs one. The `inspection-photos` bucket has no policies, so clients cannot reach it. |
| Payments as a table | Dropped in `00063`. Payments live on `reservations` and `sales`, and are covered there. |
| Reports as a module | None. The dashboard is the only reporting surface. |
| Exports | None. No route produces a CSV, spreadsheet, or attachment. |

## Decisions to review

- **Catalog editing.** The vehicle catalog is shared, so a tenant admin editing it changes it for
  everyone. Writes are now platform-admin only. To keep today's workflow, `00074` adds Zohaan's
  current Super Admins to `platform_admins`. This also lets them change shared roles. Remove anyone
  who should not have that.
- **Drizzle models.** `src/lib/db/schema` does not include `tenant_id`. Regenerating needs a real
  database, and only the shared catalog is read through Drizzle at runtime, so a guard test now
  fails if that changes. `db:check` will report the drift until `db:sync` runs.
- **Files stay where they are.** Existing objects were not moved under tenant folders, since that
  would change production data. Tenant is resolved from the record each path starts with.
- **Drizzle test.** `db:test:drizzle` fails on "schema matches the committed migration snapshot", and
  already did before this work. The models have drifted from the snapshot.
- **Public sign-up.** `supabase/config.toml` has `enable_signup = true`. While there is one tenant, a
  self-registered login joins it with no roles. Check that sign-up is off on the hosted project.

## Rollout

Check first whether `00070`-`00073` are already on production. If they are, Inventory, Acquisitions
and share pages are failing there now (finding 3) and the code in this change is the fix.

1. Take a database backup.
2. On staging with two dealerships: apply `00070`-`00076`, deploy the code, and run
   `db:test:tenants` plus the staging API suite. That suite is the only check here that goes through
   real PostgREST.
3. Review the `platform_admins` list `00074` created.
4. On production: apply the migrations, then deploy the code straight after. The code needs at least
   `00073`. Until `00074` and `00075` are applied, catalog edits are refused and "Run checks now"
   logs an error and reports zero. Nothing is damaged.

Rollbacks are in `supabase/rollbacks/`, newest first. `00074_down` restores the `system_settings`
primary key and fails if a second tenant has already saved a setting with the same key. That is
intended: it refuses to discard another tenant's data. `00075_down` restores the anonymous grants,
so it reopens those holes.

## Verifying

```sh
npm test                    # unit tests plus the tenant suite, on disposable PGlite

# Real sessions and real PostgREST. Needs a running app on a staging database with two dealerships.
# Never point this at production. See the header of the test file for the variables.
TENANT_TEST_NOT_PRODUCTION=yes TENANT_TEST_BASE_URL=http://localhost:3003 ... npm run db:test:tenants
```

PGlite proves SQL behaviour only. Its Auth and Storage are stand-ins, and it has no PostgREST.
`modules.test.ts` applies PostgREST's relationship rules to the real catalog, which models the API
rather than running it. Until the staging suite has run, treat API behaviour as unverified.
