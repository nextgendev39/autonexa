# Workshop Costs

## Separation of concerns

| Source | Meaning |
| --- | --- |
| Inspection finding `estimated_cost` | Estimate only |
| Workshop `estimated_total_cost` | Planned workshop budget |
| Workshop `actual_total_cost` | Parts + labour + expenses |

Purchase price and acquisition expenses remain outside workshop totals.

## Aggregation

```text
Parts total     = Σ workshop_job_parts.total_cost (non-cancelled)
Labour total    = Σ workshop_job_labour.total_cost
Expenses total  = Σ workshop_expenses.amount
Actual total    = Parts + Labour + Expenses
Variance        = Actual − Estimated
```

Triggers recalculate after part/labour/expense changes unless `cost_locked`.

## Permissions

- `workshop.cost.view` — see money fields / variance / labour rates
- `workshop.cost.edit` — change estimates/rates
- `workshop.cost.override` — skip reapproval when estimate rises above threshold

Technicians may record hours without seeing hourly rates when they lack `workshop.cost.view`.

## Snapshots

On successful quality PASS, `cost_locked = true` so historical completed orders do not silently change.
