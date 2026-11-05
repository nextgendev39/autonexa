# Workshop Workflow

## Order statuses

`draft` → `pending_approval` → `approved` → `scheduled` → `in_progress` → (`waiting_for_parts` | `waiting_for_vendor` | `on_hold`) → `quality_check` → `completed`

Also: `cancelled` from most non-terminal states (elevated permission once work has started).

Transitions are enforced in PostgreSQL (`is_valid_workshop_status_transition`) and mirrored in `src/lib/workshop/status-transitions.ts`.

## Job statuses

`pending` → `assigned` → `in_progress` → (`waiting_for_parts` | `waiting_for_vendor`) → `completed`

`cancelled` from non-terminal states. `completed` → `in_progress` allowed for rework after failed QC.

## Approval

- Draft orders submit to `pending_approval`.
- Approvers use `workshop.approve` (`approve_workshop_order` / `reject_workshop_order`).
- Material estimate increases on approved work call `bump_workshop_estimate`; without `workshop.cost.override`, status returns to `pending_approval` when delta exceeds threshold (AED 1,000).

## Quality check

See [workshop-quality-check.md](./workshop-quality-check.md).

## Inspection conversion

`create_workshop_from_inspection` creates an order + jobs for selected findings. Duplicate active jobs for the same `inspection_finding_id` are blocked (unique partial index + RPC message).
