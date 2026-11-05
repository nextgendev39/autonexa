# Workshop Permissions

| Key | Purpose |
| --- | --- |
| `workshop.view` | List/detail orders |
| `workshop.create` | Create orders / from inspection |
| `workshop.edit` | Edit order fields / workflow helpers |
| `workshop.approve` | Approve / reject / elevated cancel |
| `workshop.cancel` | Cancel with reason |
| `workshop.job.*` | View/create/edit/assign/start/complete jobs |
| `workshop.parts.*` | Parts tracking |
| `workshop.labour.*` | Labour entries |
| `workshop.expense.*` | Other expenses |
| `workshop.cost.view/edit/override` | Financial visibility and budget control |
| `workshop.quality_check` | Perform QC (not self-approval) |
| `workshop.photo.*` | Photo metadata + storage |

## Role examples

- **Technician**: assigned job execution, parts used, photos; no approve / cost.view / quality_check
- **Workshop manager**: full workshop operations including approve, cost, QC
- **Accountant**: view + cost/expense visibility
- **Viewer**: read-only workshop/job/photo

RLS uses `has_permission_for_branch` on the order branch. Job rows also allow `assigned_to = auth.uid()`.
