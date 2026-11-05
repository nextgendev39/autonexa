# Acquisition workflow

Acquisition status is independent of vehicle inventory status.

## Statuses

```text
draft
sourcing
negotiating
pending_approval
approved
purchased
documents_pending
received
cancelled
rejected
```

## Happy path

```text
DRAFT → SOURCING → NEGOTIATING → PENDING_APPROVAL → APPROVED → PURCHASED
  → DOCUMENTS_PENDING → RECEIVED
```

`PURCHASED` may also go directly to `RECEIVED`.

## Controlled exits

| From | To |
| --- | --- |
| `draft`, `sourcing`, `negotiating`, `approved` | `cancelled` |
| `pending_approval` | `approved` or `rejected` |
| `rejected` | `negotiating` or `cancelled` |

Arbitrary status changes are rejected by `is_valid_acquisition_status_transition` (SQL + TS mirror).

## Purchase confirmation

When status becomes `purchased` (RPC `confirm_acquisition_purchase`):

1. Requires `approved` status, agreed purchase price, vehicle, and branch
2. Sets acquisition to `purchased`
3. Ensures vehicle status is `acquired` (unless sold/delivered/archived)
4. Maps source type → `vehicles.source`
5. Refreshes `vehicles.total_acquisition_cost` from agreed price + expenses
6. Writes audit events

## Receive

RPC `receive_acquisition` sets `received_date`. Vehicle stays `acquired` — inspection is **not** auto-started.

## Re-approval

If an `approved` acquisition’s purchase price changes without `acquisition.cost.edit` override, status returns to `pending_approval`.

## Self-approval

`acquisition_allows_self_approval()` returns `false` by default. Approvers cannot approve their own acquisition unless this is later configured.

## Duplicate protection

- VIN / chassis: prevent duplicate active vehicles on create
- Partial unique index: one active acquisition per vehicle (`status` not in `cancelled` / `rejected`)
