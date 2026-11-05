# AutoNexa — Security Architecture (Phase 4)

## Principles

1. **Frontend RBAC is UX only.** Hiding buttons or nav items is not security.
2. **PostgreSQL Row Level Security is the security boundary.**
3. **No public signup.** Staff are invited by administrators.
4. **Service role never ships to the browser.**

## Authentication

| Concern | Implementation |
| --- | --- |
| Identity | Supabase Auth (`auth.users`) |
| Profile | `public.profiles` (`id` = `auth.users.id`) |
| Credentials | Email + password only (no MFA in MVP) |
| Session | `@supabase/ssr` cookies via browser client, server client, and proxy middleware |
| Password reset | `/forgot-password` → email link → `/reset-password` |
| Invitation | Admin invite → `/accept-invitation` → password → `activate_invited_profile()` |
| Public signup | **Disabled** — no `/signup` route |

### Account status

`profiles.status`: `active` | `invited` | `suspended` | `disabled`

- Login rejects suspended/disabled (generic messaging where enumeration matters).
- Dashboard layout signs out suspended/disabled users.
- `is_active_staff()` must be true for business RLS helpers.
- Invited users activate on first successful login or invitation acceptance.

## Authorization layers

```text
UI PermissionGate / nav filter
        ↓ (UX only)
requirePagePermission / requirePermission (server)
        ↓
Supabase client (user JWT)
        ↓
RLS + SECURITY DEFINER helpers
```

## Secrets

- `NEXT_PUBLIC_SUPABASE_URL` + anon/publishable key only in the app.
- Service role key stays in server/CI secrets if used for admin invites later.
- Never log passwords, tokens, or recovery codes.

## Storage

Private buckets only. Paths are `{entity_id}/{uuid}-{filename}`. Access is gated by permission helpers. Prefer short-lived signed URLs (`src/lib/storage/signed-url.ts`, default 5 minutes).

## Sensitive vehicle financials

- `total_acquisition_cost` and `minimum_selling_price` are withheld from direct authenticated SELECT.
- Read via `read_vehicle_costs` / `read_vehicle_profit`.
- Update via `update_vehicle_costs` with `vehicle.cost.edit` / `vehicle.price.edit`.

## Audit

Sensitive role changes go through `assign_user_role` / `revoke_user_role` and write audit events. `audit_logs` is selectable only with `audit.view` and has no client update/delete policies.

## Bootstrap (first Super Admin)

Hidden route: `/setup/super-admin` (not linked in navigation).

Requires server env `BOOTSTRAP_SECRET` (≥16 chars) and `SUPABASE_SERVICE_ROLE_KEY`. Creates only the **first** Super Admin; further attempts fail. Empty `BOOTSTRAP_SECRET` makes the page return 404.

## Related docs

- [rbac-matrix.md](./rbac-matrix.md)
- [rls.md](./rls.md)
- [database.md](./database.md)
