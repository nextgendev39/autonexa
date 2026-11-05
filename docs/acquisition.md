# Vehicle Acquisition (Phase 6)

An **acquisition** is the business process of obtaining a vehicle. The canonical inventory asset remains `public.vehicles`. One acquisition normally links to one vehicle via `acquisitions.vehicle_id`.

Line-item costs live on the unified `vehicle_expenses` ledger with `acquisition_id` (Phase 3 decision — no separate `acquisition_expenses` table).

## Routes

| Route | Permission |
| --- | --- |
| `/acquisitions` | `acquisition.view` |
| `/acquisitions/new` | `acquisition.create` |
| `/acquisitions/[id]` | `acquisition.view` |
| `/acquisitions/[id]/edit` | `acquisition.edit` |

## API

| Method | Path | Permission |
| --- | --- | --- |
| `GET` | `/api/acquisitions` | `acquisition.view` |
| `POST` | `/api/acquisitions` | `acquisition.create` |
| `GET` | `/api/acquisitions/:id` | `acquisition.view` |
| `PATCH` | `/api/acquisitions/:id` | `acquisition.edit` |
| `POST` | `/api/acquisitions/:id/status` | service-checked |
| `POST` | `/api/acquisitions/:id/approve` | `acquisition.approve` |
| `POST` | `/api/acquisitions/:id/reject` | `acquisition.approve` |
| `POST` | `/api/acquisitions/:id/cancel` | `acquisition.cancel` / `edit` |
| `POST` | `/api/acquisitions/:id/receive` | `acquisition.edit` |
| `POST` | `/api/acquisitions/:id/expenses` | expense/cost permissions |
| `PATCH/DELETE` | `/api/acquisitions/:id/expenses/:expenseId` | expense/cost permissions |
| `GET` | `/api/acquisitions/:id/history` | `acquisition.view` |
| `GET` | `/api/acquisitions/:id/activity` | `acquisition.view` |
| `GET` | `/api/acquisitions/meta` | `acquisition.view` |

## Identifiers

- Primary key: `acquisitions.id` (UUID)
- Reference: `acquisition_number` (e.g. `ZM-ACQ-000001`), assigned by DB trigger via `next_acquisition_number()`

## Seller / source model

No `sellers` table. Sources use:

- `source_type` (`acquisition_source_type`)
- Denormalized contact fields on the acquisition
- Optional `supplier_id` (dealers/auctions/companies)
- Optional `customer_id` (individual owners who are CRM contacts)

## See also

- [`acquisition-workflow.md`](./acquisition-workflow.md)
- [`acquisition-permissions.md`](./acquisition-permissions.md)
- [`acquisition-financials.md`](./acquisition-financials.md)
