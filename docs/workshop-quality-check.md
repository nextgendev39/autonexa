# Workshop Quality Check

Route: `/workshop/[id]/quality-check`  
Permission: `workshop.quality_check`

## Preconditions

1. Order status is `quality_check` (via `submit_workshop_quality_check`).
2. All non-cancelled jobs are `completed`.
3. Actor is not the order `completed_by` (self-approval blocked).

## Checklist (UI + stored JSON)

- Jobs completed
- Required parts recorded
- Required photos present
- Critical repair findings resolved
- Vehicle condition acceptable

## Results

| Result | Order outcome | Vehicle |
| --- | --- | --- |
| `pass` | `completed`, `cost_locked` | stays `under_repair` — Mark Ready for Sale |
| `fail` / `requires_rework` | back to `in_progress` | stays `under_repair` |

Unresolved critical findings on the source inspection block PASS.

History is preserved in `workshop_quality_checks` and `workshop_status_history`.
