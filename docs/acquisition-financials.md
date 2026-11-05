# Acquisition financials

## Money types

All monetary amounts use PostgreSQL `numeric(14,2)`. Default currency is `AED`. Display uses the app `formatCurrency` helper (never JS float math for totals).

## Cost model

```text
Agreed purchase price  (acquisitions.purchase_price)
+ Additional expenses  (vehicle_expenses where acquisition_id = … and category ≠ purchase)
= Total acquisition cost
```

Computed in Postgres:

- `acquisition_expense_sum(id)`
- `acquisition_total_cost(id)`

On purchase confirmation, `vehicles.total_acquisition_cost` is refreshed to match. Workshop and other later costs are **not** included here — they feed future profitability phases.

## Expense categories (acquisition UI)

Mapped onto `vehicle_expense_category`:

`transportation`, `auction`, `broker_fee`, `registration`, `insurance`, `import_duty`, `clearance`, `inspection`, `customs`, `other`

A `purchase` expense row may be inserted on purchase confirmation for ledger completeness; it is excluded from the “additional expenses” sum to avoid double-counting.

## Visibility

Purchase prices and totals are withheld from direct table SELECT for `authenticated`. Clients with `acquisition.cost.view` (or `vehicle.cost.view`) load them via RPCs. Frontend hiding is UX only.

## Locked historical records

Once status is `received` or `cancelled`, expenses cannot be added/edited/removed without elevated future override (not implemented as a separate permission yet — locked by status).
