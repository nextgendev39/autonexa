# AutoNexa — RBAC Matrix (Phase 4)

Permissions live in `public.permissions`. Roles live in `public.roles`. Assignments are `public.user_roles` (optional `branch_id`).

## Branch scope model

| Scope | Meaning |
| --- | --- |
| `ALL_BRANCHES` | `user_roles.branch_id IS NULL` (global assignment) |
| `ASSIGNED_BRANCHES` | One or more explicit `user_roles.branch_id` values |
| `OWN_BRANCH` | Fallback to `profiles.branch_id` when no role branch rows exist |

No separate `user_branch_access` table — Phase 3 `user_roles.branch_id` covers multi-branch needs.

## Roles

| Key | Name |
| --- | --- |
| `super_admin` | Super Admin |
| `admin` | Admin |
| `general_manager` | General Manager |
| `inventory_manager` | Inventory Manager |
| `sales_manager` | Sales Manager |
| `sales_executive` | Sales Executive |
| `inspector` | Inspector |
| `workshop_manager` | Workshop Manager |
| `accountant` | Accountant |
| `document_officer` | Document Officer |
| `viewer` | Viewer |

## Permission catalog

| Module | Permissions |
| --- | --- |
| dashboard | `dashboard.view` |
| vehicle | `vehicle.view`, `.create`, `.edit`, `.delete`, `.status.change`, `.branch.transfer`, `.archive`, `.cost.view`, `.cost.edit`, `.price.view`, `.price.edit`, `.profit.view` |
| acquisition | `acquisition.view`, `.create`, `.edit`, `.approve`, `.cancel`, `.cost.view`, `.cost.edit`, `.expense.view`, `.expense.create`, `.expense.edit` |
| inspection | `inspection.view`, `.create`, `.edit`, `.approve`, `.submit`, `.review`, `.reject`, `.reinspect`, `.finding.view`, `.finding.create`, `.finding.edit`, `.photo.view`, `.photo.create`, `.photo.delete`, `.cost.view`, `.override` |
| workshop | `workshop.view`, `.create`, `.edit`, `.approve`, `.cancel`, `.job.*`, `.parts.*`, `.labour.*`, `.expense.*`, `.cost.view/edit/override`, `.quality_check`, `.photo.*` |
| customer | `customer.view`, `.create`, `.edit` |
| lead | `lead.view`, `.create`, `.edit` |
| reservation | `reservation.view`, `.create`, `.cancel` |
| sale | `sale.view`, `.create`, `.edit`, `.cancel` |
| payment | `payment.view`, `.create`, `.refund` |
| invoice | `invoice.view`, `.create`, `.edit` |
| document | `document.view`, `.create`, `.edit` |
| report | `report.view`, `report.financial.view` |
| branch | `branch.view`, `.manage` |
| admin | `user.manage`, `role.manage`, `audit.view` |
| system | `notification.view`, `settings.view`, `settings.manage` |

## Role → permission summary

| Role | Access summary |
| --- | --- |
| Super Admin | All permissions |
| Admin | All except `payment.refund` |
| General Manager | Broad ops + financial view/report; no user/role manage; no refund |
| Inventory Manager | Vehicles, costs, prices, acquisitions, related docs |
| Sales Manager | CRM + sales pipeline; vehicle view/price; limited payments |
| Sales Executive | CRM + sales actions; vehicle view/price; **no** costs, payments, admin |
| Inspector | Inspections (view/create/edit/submit, findings, photos) + vehicle view; **no** approve/reject/review/override/cost |
| Workshop Manager | Workshop + vehicle view/costs |
| Accountant | Payments, invoices, financial reports, vehicle cost/profit view; can add vehicles (`vehicle.create`) but not edit them |
| Document Officer | Documents + limited vehicle/customer/sale view |
| Viewer | Read-only operational subset (no create/edit/delete, no profit) |

Exact mappings are seeded in `supabase/seed.sql` and `supabase/migrations/00026_role_permission_mappings.sql`.

## Frontend mapping

- Nav items declare `permission` in `src/config/navigation.ts`.
- Routes declare requirements in `src/lib/permissions/index.ts` (`routePermissions`).
- UI: `usePermission().can("…")`, `<PermissionGate />`, `<Can />`.
- Server: `requirePagePermission("…")`.
