# Vehicle lifecycle

A vehicle is the central inventory entity for AutoNexa.

```text
Acquisition → Inspection → (optional Workshop) → Ready for sale
    → Reservation → Sale → Delivery
    → (optional) Return → Re-inspection / Archive
```

## Statuses

Database enum `public.vehicle_status` (snake_case):

| Status | Meaning |
| --- | --- |
| `acquired` | Entered inventory |
| `under_inspection` | Inspection in progress |
| `inspection_failed` | Failed inspection; needs repair or recheck |
| `under_repair` | Workshop / reconditioning |
| `ready_for_sale` | Available on the floor |
| `reserved` | Held for a customer |
| `sold` | Sale recorded |
| `delivered` | Handed over |
| `returned` | Returned after delivery |
| `archived` | Removed from active inventory |

## Inspection hooks (Phase 7)

Inspection RPCs may advance vehicle status when the transition is valid:

| Trigger | Vehicle effect |
| --- | --- |
| Inspection **start** (`start_inspection`) | `acquired` / `returned` / `inspection_failed` → `under_inspection` |
| Inspection **approve** (`approve_inspection`) while vehicle is `under_inspection` | `pass` / `pass_with_advisories` (no unresolved criticals) → stays `under_inspection` (use Mark Ready for Sale); `repair_required` or pass-with-criticals → `under_repair`; `fail` → `inspection_failed` |

Reject/cancel do not roll the vehicle back automatically. Receiving an acquisition does not auto-start inspection.

Details: [`inspection-workflow.md`](./inspection-workflow.md).

## Archive vs delete

- Prefer **archive** (`status = archived`, `archived_at` set).
- Soft delete (`deleted_at`) hides a row from normal inventory queries and is reserved for administrative cleanup.
- Sold/delivered vehicles are not archived through the normal archive workflow so historical sales remain traceable.

## Branch & location

- Every vehicle has a required `branch_id`.
- Optional `location_id` must belong to the same branch (`enforce_vehicle_location_branch`).
- Cross-branch moves use `transfer_vehicle` RPC with a required reason.
