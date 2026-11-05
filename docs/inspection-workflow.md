# Inspection workflow

Inspection status is independent of vehicle inventory status, but start/approve RPCs may advance the vehicle when eligible.

## Statuses

```text
draft
assigned
in_progress
submitted
under_review
approved
rejected
cancelled
```

## Transition map

Application map (`src/lib/inspections/status-transitions.ts`), mirrored by `is_valid_inspection_status_transition`:

```text
draft        → assigned | in_progress | cancelled
assigned     → in_progress | cancelled
in_progress  → submitted | cancelled
submitted    → under_review | cancelled
under_review → approved | rejected
approved     → (terminal)
rejected     → in_progress | cancelled
cancelled    → (terminal)
```

Note: the SQL function also allows `under_review → cancelled` so `cancel_inspection` can exit review. Prefer the dedicated cancel RPC rather than a raw status change.

## Happy path

```text
DRAFT → ASSIGNED → IN_PROGRESS → SUBMITTED → UNDER_REVIEW → APPROVED
```

`submit_inspection` writes `submitted` then **auto-advances** to `under_review` in one RPC.

Draft may also go straight to `in_progress` via `start_inspection` (skip assignment).

## Controlled exits

| From | To | How |
| --- | --- | --- |
| `draft`, `assigned`, `in_progress`, `submitted` | `cancelled` | `cancel_inspection` |
| `under_review` | `approved` / `rejected` | `approve_inspection` / `reject_inspection` |
| `rejected` | `in_progress` | `start_inspection` (resume) or `cancelled` |
| `under_review` / `rejected` / `approved` | new child | `request_reinspection` |

Arbitrary status changes are rejected by `is_valid_inspection_status_transition` (SQL + TS mirror). Dedicated RPCs refuse misuse of `change_inspection_status` for approve/reject/cancel/submit.

## Assignment

RPC `assign_inspection(id, assigned_to, reason?)`:

- Allowed from `draft` or `assigned`
- Sets `assigned_to` / `assigned_at` / `assigned_by`
- Promotes `draft` → `assigned`
- Requires `inspection.edit`

## Start

RPC `start_inspection(id)`:

- Allowed from `draft`, `assigned`, or `rejected` → `in_progress`
- Sets `started_at`, `inspected_by` / `inspector_id` (if empty)
- Populates checklist from template when empty (`populate_inspection_checklist`)
- May move vehicle → `under_inspection` (acquired / returned / inspection_failed)

## Submit

RPC `submit_inspection(...)`:

- Requires `in_progress`
- Blocks if required items are still `null` / `not_tested` unless `p_override_incomplete` **and** `inspection.override`
- Accepts optional overall `result`, `overall_score` (0–100), summary, recommendation, notes
- Ends in `under_review` (via intermediate `submitted`)

## Review

- Status `submitted` or `under_review` is the review queue (`canReviewInspection`)
- `change_inspection_status` → `under_review` needs `inspection.review` or `inspection.edit`
- Reviewers use approve / reject / reinspect RPCs

## Approve

RPC `approve_inspection(id, note?, override_critical?)`:

- Requires `under_review` and `inspection.approve`
- Self-approval blocked unless `inspection_allows_self_approval()` is true (default **false**)
- Unresolved `critical` findings block approve unless override + `inspection.override`
- Sets `approved_at`, `reviewed_*`, locks the inspection
- Advances vehicle when still `under_inspection` (see [`inspection.md`](./inspection.md))

## Reject

RPC `reject_inspection(id, reason)`:

- Requires `under_review` and `inspection.reject` or `inspection.approve`
- Reason required
- Sets `rejected` + `rejection_reason`; vehicle status unchanged

## Reinspection

RPC `request_reinspection(id, reason, assigned_to?)`:

- Allowed from `under_review`, `rejected`, or `approved`
- From `under_review`: rejects the parent first, then creates a child
- Child: `inspection_type = re_inspection`, `parent_inspection_id` set, checklist populated from same template when present
- Returns the **child** inspection row

## Locking

| Status | Checklist / findings / photos |
| --- | --- |
| `draft`, `assigned`, `in_progress`, `rejected` | Editable (with permissions) |
| `submitted`, `under_review` | Header/review actions; checklist edits restricted by service rules |
| `approved`, `cancelled` | **Locked** — normal edits, findings, and photo mutations rejected |

`isInspectionLocked` in TS matches approved/cancelled.

## Vehicle lifecycle effects

```text
start     → vehicle under_inspection (when eligible)
approve   → under_repair | inspection_failed | (pass stays under_inspection → Mark Ready for Sale)
reject    → no automatic vehicle rollback
cancel    → no automatic vehicle rollback
```

See [`vehicle-lifecycle.md`](./vehicle-lifecycle.md).
