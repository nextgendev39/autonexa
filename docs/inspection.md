# Vehicle Inspection (Phase 7)

An **inspection** is the structured checklist process that evaluates a vehicle after acquisition (or on return / recheck). The canonical inventory asset remains `public.vehicles`. One inspection always links to one vehicle via `inspections.vehicle_id`.

Checklist data is hierarchical:

```text
Vehicle
  └── Inspection
        ├── Sections
        │     └── Items
        ├── Findings  (defects / advisories; optional link to item/section)
        ├── Photos    (optional link to item / section / finding)
        └── Recommendations (overall or finding-level)
```

Workshop conversion (`workshop_orders.inspection_id`) is preserved at the schema level but **not** automated in Phase 7 — see [Phase 8 integration](#phase-8-integration-points).

## Routes

| Route | Permission |
| --- | --- |
| `/inspections` | `inspection.view` |
| `/inspections/new` | `inspection.create` |
| `/inspections/[id]` | `inspection.view` |
| `/inspections/[id]/edit` | `inspection.edit` |
| `/inspections/[id]/review` | `inspection.review` / `approve` |

## API

| Method | Path | Permission |
| --- | --- | --- |
| `GET` | `/api/inspections` | `inspection.view` |
| `POST` | `/api/inspections` | `inspection.create` |
| `GET` | `/api/inspections/:id` | `inspection.view` |
| `PATCH` | `/api/inspections/:id` | `inspection.edit` |
| `POST` | `/api/inspections/:id/draft` | `inspection.edit` / checklist edit |
| `POST` | `/api/inspections/:id/status` | `inspection.edit` (+ `review` for `under_review`) |
| `POST` | `/api/inspections/:id/assign` | `inspection.edit` |
| `POST` | `/api/inspections/:id/start` | `inspection.edit` / `submit` |
| `POST` | `/api/inspections/:id/submit` | `inspection.submit` / `edit` |
| `POST` | `/api/inspections/:id/approve` | `inspection.approve` |
| `POST` | `/api/inspections/:id/reject` | `inspection.reject` / `approve` |
| `POST` | `/api/inspections/:id/cancel` | `inspection.edit` |
| `POST` | `/api/inspections/:id/reinspect` | `inspection.reinspect` / `approve` |
| `POST` | `/api/inspections/:id/findings` | `inspection.finding.create` / `edit` |
| `PATCH` | `/api/inspections/:id/findings/:findingId` | `inspection.finding.edit` / `edit` |
| `POST` | `/api/inspections/:id/photos` | `inspection.photo.create` / `edit` |
| `DELETE` | `/api/inspections/:id/photos/:photoId` | `inspection.photo.delete` / `edit` |
| `GET` | `/api/inspections/:id/history` | `inspection.view` |
| `GET` | `/api/inspections/:id/activity` | `inspection.view` |
| `GET` | `/api/inspections/vehicle/:vehicleId` | `inspection.view` |
| `GET` | `/api/inspections/meta` | `inspection.view` |

Dedicated approve / reject / cancel / submit / start / assign / reinspect map to SECURITY DEFINER RPCs (not arbitrary status UPDATE).

## Identifiers

- Primary key: `inspections.id` (UUID)
- Reference: `inspection_number` (e.g. `ZM-INSP-000001`), assigned by DB trigger via `next_inspection_number()`
- Reinspection link: `parent_inspection_id` → prior inspection

## Core tables

| Table | Role |
| --- | --- |
| `inspections` | Header: status, type, result, score, assignment, review, VIN checks |
| `inspection_templates` / `inspection_template_items` | Reusable checklist definitions (`section_key`) |
| `inspection_sections` | Materialized sections for one inspection |
| `inspection_items` | Checklist line items (pass/fail/advisory/…) |
| `inspection_findings` | Defects with severity, damage, optional estimated cost |
| `inspection_recommendations` | Structured recommendation rows |
| `inspection_photos` | Photo metadata → Storage bucket `inspection-photos` |
| `inspection_status_history` | Append-only status timeline |

## Types (enums)

| Enum | Values |
| --- | --- |
| `inspection_status` | `draft`, `assigned`, `in_progress`, `submitted`, `under_review`, `approved`, `rejected`, `cancelled` |
| `inspection_type` | `full_inspection`, `basic_inspection`, `pre_purchase_inspection`, `return_inspection`, `re_inspection` |
| `inspection_result` | `pass`, `pass_with_advisories`, `repair_required`, `fail` |
| `inspection_item_result` | `pass`, `fail`, `advisory`, `not_applicable`, `not_tested` |
| `inspection_severity` | `info`, `minor`, `moderate`, `major`, `critical` |
| `inspection_recommendation` | `no_action`, `monitor`, `repair_before_sale`, `repair_urgently`, `replace`, `reinspect` |

See [`inspection-checklist.md`](./inspection-checklist.md) for damage types/locations and section keys.

## Scoring & results

- `overall_score` is optional `numeric(5,2)` in range **0–100** (DB check + submit RPC).
- Score is **inspector/reviewer-supplied**, not auto-computed from item counts.
- Overall `result` drives vehicle outcomes on approve (see below).
- Progress UI counts sections/items/failed/advisory/critical findings; it does not invent a score.

## Vehicle integration

| Event | Vehicle effect (when eligible) |
| --- | --- |
| `start_inspection` | If vehicle is `acquired` / `returned` / `inspection_failed` → `under_inspection` |
| `approve_inspection` | Only when vehicle is `under_inspection`: see mapping below |

Approve mapping (`inspections.result` → vehicle status):

| Result | Unresolved critical findings | Vehicle status |
| --- | --- | --- |
| `pass` / `pass_with_advisories` | none | stays `under_inspection` — Mark Ready for Sale |
| `pass` / `pass_with_advisories` | yes (override approve) | `under_repair` |
| `repair_required` | — | `under_repair` |
| `fail` | — | `inspection_failed` |

Ready for Sale is a separate controlled action: see [vehicle-ready-for-sale.md](./vehicle-ready-for-sale.md).

Vehicle status changes still go through `is_valid_vehicle_status_transition`.

Receiving an acquisition does **not** auto-start inspection (Phase 6).

## Photo storage

- Bucket: `inspection-photos`
- Metadata in `inspection_photos` (`storage_path`, `category`, optional `section_id` / `finding_id` / `inspection_item_id`)
- App serves time-limited signed URLs; upload path is branch/inspection-scoped via storage policies
- Deletes remove DB row and best-effort Storage object

## Offline limitations

- Perform UI shows online/offline indicator and draft autosave while connected.
- **No full offline sync engine** — no queued mutation replay, no local checklist DB, no conflict resolution.
- Photo upload and submit require network; work done offline may be lost if the draft was not saved.

## Known limitations (Phase 7)

- Estimated repair costs only (`estimated_cost` on findings/recommendations) — not posted to `vehicle_expenses`
- No automatic workshop order creation from findings
- Workshop conversion deferred to Phase 8
- Self-approval disabled by default (`inspection_allows_self_approval()` → `false`)

## Phase 8 integration points

- Convert approved `repair_required` / critical findings → `workshop_orders` (+ `workshop_items`)
- Map finding `estimated_cost` / recommendations into workshop estimates
- Optional: auto-create workshop job on approve when result is `repair_required`
- Keep `workshop_orders.inspection_id` FK as the join key

## See also

- [`inspection-workflow.md`](./inspection-workflow.md)
- [`inspection-checklist.md`](./inspection-checklist.md)
- [`inspection-permissions.md`](./inspection-permissions.md)
- [`vehicle-lifecycle.md`](./vehicle-lifecycle.md)
