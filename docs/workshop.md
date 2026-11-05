# Workshop & Refurbishment (Phase 8)

Workshop manages **actual** repair/refurbishment work for vehicles preparing for resale. Inspection estimated costs remain on inspection findings; workshop tracks actual parts, labour, and other expenses separately.

```text
Vehicle → Inspection → Findings → Workshop Order → Jobs → Parts/Labour/Expenses
  → Quality Check → Vehicle Ready For Sale
```

Canonical vehicle remains `vehicles.id`. Workshop orders reference the vehicle (and optionally `source_inspection_id`).

## Routes

| Route | Permission |
| --- | --- |
| `/workshop` | `workshop.view` |
| `/workshop/new` | `workshop.create` |
| `/workshop/[id]` | `workshop.view` |
| `/workshop/[id]/edit` | `workshop.edit` |
| `/workshop/[id]/quality-check` | `workshop.quality_check` |
| `/workshop/my-jobs` | `workshop.job.view` |
| `/workshop/jobs/[id]` | `workshop.job.view` |

## Core tables

| Table | Role |
| --- | --- |
| `workshop_orders` | Order header (`ZM-WO-######`) |
| `workshop_jobs` | Tasks; optional `inspection_finding_id` |
| `workshop_job_parts` | Parts (`quantity × unit_cost`) |
| `workshop_job_labour` | Labour (`hours × hourly_rate`) |
| `workshop_expenses` | Other costs (transport, towing, …) |
| `workshop_status_history` | Append-only order status timeline |
| `workshop_photos` | Before/during/after media metadata |
| `workshop_quality_checks` | QC results |
| `vendors` | Minimal external garage/vendor directory |
| `workshop_items` | Legacy Phase 3 line items (kept, not primary) |

## Identifiers

- Order: `workshop_order_number` via `next_workshop_order_number()` → `ZM-WO-000001`
- Job: `job_number` via `next_workshop_job_number()` → `ZM-WJ-000001`

## Cost model

```text
Actual Workshop Cost = Parts + Labour + Other Expenses
```

Estimated costs are order/job estimates (often seeded from inspection findings). Do **not** mix purchase price into workshop cost.

Authoritative totals use DB aggregation (`recalculate_workshop_order_costs`, `read_workshop_costs`). Completed orders set `cost_locked = true`.

## Vehicle lifecycle

| Event | Vehicle effect (when eligible) |
| --- | --- |
| Start workshop order | → `under_repair` (from eligible statuses) |
| Quality check PASS | Completes workshop order; vehicle stays `under_repair` until Mark Ready for Sale |

Completing the order alone does **not** mark the vehicle ready for sale. See [vehicle-ready-for-sale.md](./vehicle-ready-for-sale.md).

## Storage

Private bucket `workshop-photos` with path `{order_id}/…`. Access via `can_access_workshop_storage` + signed URLs.

See also: [workflow](./workshop-workflow.md), [costs](./workshop-costs.md), [permissions](./workshop-permissions.md), [quality check](./workshop-quality-check.md).
