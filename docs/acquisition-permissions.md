# Acquisition permissions

| Permission | Purpose |
| --- | --- |
| `acquisition.view` | List/detail/history |
| `acquisition.create` | Create acquisition (+ typically needs `vehicle.create` when creating a vehicle) |
| `acquisition.edit` | Edit fields / advance workflow status |
| `acquisition.approve` | Approve or reject pending acquisitions |
| `acquisition.cancel` | Cancel (also allowed via `acquisition.edit`) |
| `acquisition.cost.view` | View asking/purchase prices and totals |
| `acquisition.cost.edit` | Override price after approval without re-approval |
| `acquisition.expense.view` | View expense lines |
| `acquisition.expense.create` | Add expenses |
| `acquisition.expense.edit` | Edit/remove expenses |

Legacy `vehicle.cost.view` / `vehicle.cost.edit` still grant access to acquisition-linked `vehicle_expenses` rows.

## Role mapping (Phase 6)

| Role | Keys |
| --- | --- |
| `super_admin` / `admin` | all |
| `general_manager` | view, create, edit, approve, cancel, cost.*, expense.* |
| `inventory_manager` | view, create, edit, approve, cancel, cost.*, expense.* |
| `accountant` | view, cost.view, expense.view |
| `viewer` | view only |

## Enforcement layers

1. Page gates (`requirePagePermission`)
2. API (`requireApiUser` + service permission checks)
3. RLS branch-scoped policies on `acquisitions`
4. SECURITY DEFINER RPCs for approve / reject / cancel / purchase / receive
5. Column revoke on `asking_price` / `purchase_price` — read via `read_acquisition_costs` / `read_acquisitions_costs`
