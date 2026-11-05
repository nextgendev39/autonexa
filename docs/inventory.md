# Inventory & Vehicle Management (Phase 5)

Canonical vehicle records live in `public.vehicles`. Future modules (acquisition, inspection, workshop, pricing, reservations, sales) reference this table — they must not create duplicate vehicle entities.

## Routes

| Route | Permission |
| --- | --- |
| `/inventory` | `vehicle.view` |
| `/inventory/new` | `vehicle.create` |
| `/inventory/[id]` | `vehicle.view` |
| `/inventory/[id]/edit` | `vehicle.edit` |

## API

| Method | Path | Permission |
| --- | --- | --- |
| `GET` | `/api/vehicles` | `vehicle.view` |
| `POST` | `/api/vehicles` | `vehicle.create` |
| `GET` | `/api/vehicles/:id` | `vehicle.view` |
| `PATCH` | `/api/vehicles/:id` | `vehicle.edit` |
| `POST` | `/api/vehicles/:id/status` | `vehicle.status.change` or `vehicle.edit` |
| `POST` | `/api/vehicles/:id/transfer` | `vehicle.branch.transfer` or `vehicle.edit` |
| `POST` | `/api/vehicles/:id/archive` | `vehicle.archive` or `vehicle.delete` |
| `GET` | `/api/vehicles/:id/history` | `vehicle.view` |
| `GET` | `/api/inventory/meta` | `vehicle.view` |

All API responses are JSON (`{ status, data }` or `{ status, error, message }`).

## Identifiers

- Primary key: `vehicles.id` (UUID)
- Dealership stock number: `vehicles.stock_number` (e.g. `ZM-000001`), assigned by DB trigger via `next_vehicle_stock_number()`
- VIN: optional, unique among active rows, normalized uppercase 17-char
- Chassis number: optional, unique among active rows

## Related tables

- `vehicle_makes` / `vehicle_models` — master data for filters/autocomplete (vehicles also store denormalized `make`/`model` text)
- `branch_locations` — showroom/yard/workshop/storage locations under a branch
- `vehicle_status_history` — append-only status timeline (trigger/RPC)
- `vehicle_photos` — photo metadata foundation (Storage bucket `vehicle-photos`)
- Soft delete: `deleted_at`; archive workflow: `status = archived` + `archived_at`

## Field protection

Cost fields (`total_acquisition_cost`, `minimum_selling_price`) remain restricted via Phase 4 column grants and RPCs (`read_vehicle_costs`, `update_vehicle_costs`). The inventory UI only shows costs when `vehicle.cost.view` is present.

## See also

- [`vehicle-lifecycle.md`](./vehicle-lifecycle.md)
- [`vehicle-status-transitions.md`](./vehicle-status-transitions.md)
- [`inventory-permissions.md`](./inventory-permissions.md)
