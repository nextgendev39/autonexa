# Inventory permissions

| Permission | Use |
| --- | --- |
| `vehicle.view` | List/detail inventory |
| `vehicle.create` | Create vehicles |
| `vehicle.edit` | Edit vehicle fields (not status/branch workflow) |
| `vehicle.status.change` | Dedicated status changes |
| `vehicle.branch.transfer` | Move between branches/locations |
| `vehicle.archive` | Archive from active inventory |
| `vehicle.delete` | Soft-delete / also accepted as archive fallback |
| `vehicle.cost.view` / `vehicle.cost.edit` | Acquisition cost fields |
| `vehicle.price.view` / `vehicle.price.edit` | Selling prices |
| `vehicle.profit.view` | Margin / profit |

Sold and delivered vehicles are locked: `PATCH /api/vehicles/:id` and photo changes return `409 conflict` for every role, and the edit page redirects to the vehicle page.

Frontend `PermissionGate` / `usePermission` are UX only. Enforcement is:

1. API `requireApiUser` / service permission checks
2. PostgreSQL RLS (`has_permission_for_branch`)
3. SECURITY DEFINER RPCs for status/transfer/archive

## Role highlights

- **Inventory Manager / Admin / GM / Super Admin**: full inventory workflow including status, transfer, archive
- **Sales roles**: typically `vehicle.view` (+ price view); no create/edit/archive by default
- **Viewer**: `vehicle.view` only

See [`rbac-matrix.md`](./rbac-matrix.md) for the full matrix.
