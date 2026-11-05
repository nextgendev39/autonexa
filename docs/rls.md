# AutoNexa — Row Level Security (Phase 4)

## Default posture

RLS is enabled on all business tables (Phase 3). Phase 4 replaces bootstrap-only policies with permission-aware policies. Unmatched operations are **denied**.

Never use `USING (true)` on sensitive tables.

## Helper functions (`00025_auth_helpers.sql`)

| Function | Purpose |
| --- | --- |
| `is_active_staff()` | Active, non-deleted profile |
| `current_profile_id()` | `auth.uid()` |
| `current_branch_id()` | Home branch from profile |
| `is_super_admin()` | Has `super_admin` role |
| `has_role(key)` | Role membership |
| `has_permission(key)` | Any matching role permission |
| `has_permission_for_branch(key, branch_id)` | Permission with global or branch scope |
| `has_permission_for_optional_branch(key, branch_id)` | Nullable branch rows |
| `can_access_branch(branch_id)` | Branch reachable via roles/home |
| `current_user_permissions()` | Permission key array for the JWT user |
| `activate_invited_profile()` | Invite → active |
| `assign_user_role` / `revoke_user_role` | Controlled role changes + audit |
| `read_vehicle_costs` / `read_vehicle_profit` / `update_vehicle_costs` | Financial field access |

All authorization helpers are `SECURITY DEFINER` with `search_path = public` to avoid RLS recursion on `profiles` / `user_roles`.

## Policy strategy by domain

| Domain | SELECT | WRITE |
| --- | --- | --- |
| Profiles | Self or `user.manage` | Self (guarded fields) or `user.manage` |
| Roles / permissions | Active staff | `role.manage` (system roles protected) |
| user_roles | Self or manage | Prefer RPC; direct only for super admin |
| Vehicles | `vehicle.view` + branch | create/edit/delete permissions + branch |
| Vehicle expenses | `vehicle.cost.view` | `vehicle.cost.edit` |
| Acquisitions / inspections / workshop | Module permission + branch | Matching mutate permission |
| Customers / leads | Permission + branch (leads also assigned_to) | Matching mutate permission |
| Sales / reservations | Permission + branch (sales also salesperson) | Matching mutate permission |
| Payments / invoices | Financial permissions + branch | create/refund/edit as mapped |
| Documents | `document.*` + optional branch | Matching mutate permission |
| Notifications | Own rows + `notification.view` | Own update |
| Audit logs | `audit.view` only | No client update/delete |

## Storage (`00028_storage_security.sql`)

Bucket policies call entity helpers:

- `can_access_vehicle_storage`
- `can_access_inspection_storage`
- `can_access_customer_storage`
- `can_access_sale_storage`

Object names must start with a UUID entity id.

## Testing

```bash
npx supabase db reset          # apply migrations + seed
npm run db:test:security       # RLS / mapping assertions (rollback)
```

Also verify with a user JWT (not service role):

1. Unauthenticated SELECT on `vehicles` → fail
2. Sales executive SELECT `payments` → fail
3. Sales executive SELECT `vehicle_expenses` → fail
4. Viewer UPDATE `vehicles` → fail
5. Non-admin `assign_user_role(..., 'super_admin')` → fail
6. Suspended profile → `is_active_staff()` false → business policies deny

## Migrations

```text
00024_rls_foundation.sql   # enable RLS + bootstrap
00025_auth_helpers.sql     # helpers + RPCs
00026_role_permission_mappings.sql
00027_rls_policies.sql     # business policies + cost column protection
00028_storage_security.sql
```
