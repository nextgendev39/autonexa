# Inspection permissions

| Permission | Purpose |
| --- | --- |
| `inspection.view` | List/detail/history/activity/meta |
| `inspection.create` | Create inspection (+ populate checklist) |
| `inspection.edit` | Edit header/draft, assign, cancel, generic status (non-terminal), start |
| `inspection.submit` | Submit completed checklist for review (also allows start) |
| `inspection.review` | Move into / manage review (`under_review`) |
| `inspection.approve` | Approve under-review inspections |
| `inspection.reject` | Reject under review (also granted via `approve`) |
| `inspection.reinspect` | Create follow-up reinspection child |
| `inspection.finding.view` | View findings (falls back to `view`) |
| `inspection.finding.create` | Add findings |
| `inspection.finding.edit` | Edit/resolve findings |
| `inspection.photo.view` | View photo metadata |
| `inspection.photo.create` | Upload photos |
| `inspection.photo.delete` | Delete photos |
| `inspection.cost.view` | View estimated costs via `read_inspection_costs` |
| `inspection.override` | Submit incomplete checklist; approve with unresolved critical findings |

Base keys `inspection.view` / `.create` / `.edit` / `.approve` exist from earlier phases; Phase 7 adds the rest in migration `00031`.

## Role mapping (Phase 7)

| Role | Keys |
| --- | --- |
| `super_admin` / `admin` | all `inspection.*` |
| `general_manager` | view, create, edit, approve, submit, review, reject, reinspect, finding.*, photo.*, cost.view, override |
| `inspector` | view, create, edit, submit, finding.view/create/edit, photo.view/create — **no** approve, reject, review, reinspect, cost, override, photo.delete |
| `inventory_manager` | view, cost.view, finding.view, photo.view |
| `workshop_manager` | view, finding.view, photo.view |
| `sales_executive` / `viewer` | view, finding.view, photo.view |
| Other ops roles (e.g. sales_manager, accountant) | typically `inspection.view` from earlier mappings; finding/photo keys added per role in Phase 7 seed where listed above |

Exact rows: `supabase/migrations/00031_phase7_inspections.sql` (+ seed).

## Enforcement layers

1. Page gates (`requirePagePermission` / route prefixes)
2. API (`requireApiUser` + service permission checks)
3. RLS branch-scoped policies on `inspections` and child tables
4. SECURITY DEFINER RPCs for assign / start / submit / approve / reject / cancel / reinspect / populate / costs
5. Column revoke on `estimated_cost` — read via `read_inspection_costs`

## Branch rules

- Row access uses `has_permission_for_branch('<key>', inspections.branch_id)`
- Child tables (sections, items, findings, photos, recommendations, history) join through the parent inspection’s `branch_id`
- Global role assignment (`user_roles.branch_id IS NULL`) covers all branches; otherwise assigned branches / profile branch apply (see [`rbac-matrix.md`](./rbac-matrix.md))

## Cost visibility

- `estimated_cost` on findings/recommendations is not selectable by `authenticated`
- Callers with `inspection.cost.view` load costs through `read_inspection_costs`
- Frontend omits cost fields when the permission is absent (UX only — RPC is authoritative)
- These are **estimates only**; they do not post to `vehicle_expenses`

## Self-approval

`inspection_allows_self_approval()` returns `false` by default. Approvers cannot approve an inspection they inspected or created unless this is later configured.

## Override

| Gate | Without override | With `inspection.override` |
| --- | --- | --- |
| Submit with incomplete required items | Rejected | Allowed when `p_override_incomplete` |
| Approve with unresolved critical findings | Rejected | Allowed when `p_override_critical` |

Override does not bypass self-approval or missing `inspection.approve` / `submit`.
