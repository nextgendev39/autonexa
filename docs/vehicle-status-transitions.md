# Vehicle status transitions

Transitions are enforced in PostgreSQL (`is_valid_vehicle_status_transition` + `enforce_vehicle_status_transition`) and mirrored in the app (`src/lib/vehicles/status-transitions.ts`).

## Allowed map

```text
acquired
  → under_inspection
  → ready_for_sale   (via mark_vehicle_ready_for_sale when inspection eligible)

under_inspection
  → ready_for_sale   (via mark_vehicle_ready_for_sale)
  → under_repair
  → inspection_failed

inspection_failed
  → under_repair
  → under_inspection
  → archived

under_repair
  → under_inspection
  → ready_for_sale   (via mark_vehicle_ready_for_sale after workshop/QC when required)

ready_for_sale
  → reserved
  → sold
  → under_repair

reserved
  → sold
  → ready_for_sale

sold
  → delivered

delivered
  → returned

returned
  → under_inspection
  → archived

archived
  → (none)
```

Archive is also allowed from any non-sold/non-delivered status via `archive_vehicle`.

## Forbidden examples

- `sold` → `ready_for_sale`
- `delivered` → `sold`
- `archived` → `ready_for_sale`
- Generic Change Status to `ready_for_sale` (except un-reserve from `reserved`)

## Changing status

- Generic: `POST /api/vehicles/:id/status` or RPC `change_vehicle_status` (reason required). Does **not** accept `ready_for_sale` except from `reserved`.
- Ready for Sale: `POST /api/vehicles/:id/ready-for-sale` or RPC `mark_vehicle_ready_for_sale` — see [vehicle-ready-for-sale.md](./vehicle-ready-for-sale.md).

History is written to `vehicle_status_history`.
