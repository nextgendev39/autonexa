# Phase 9 — Pricing & Profitability

Pricing aggregates **live** acquisition and workshop costs. It does not duplicate purchase or workshop ledgers.

## Cost model

```text
Total Vehicle Cost =
  Acquisition total (vehicles.total_acquisition_cost / acquisition_total_cost)
+ Completed workshop actual_total_cost
+ Other vehicle_expenses (acquisition_id is null)

Gross Profit = Current Selling Price − Total Vehicle Cost
Margin %     = Gross Profit / Current Selling Price × 100
```

Inspection estimated repair cost is **not** used as actual cost.

## Tables

| Table | Role |
|---|---|
| `vehicle_pricing` | One current pricing decision per vehicle |
| `vehicle_pricing_history` | Append-only change history |

Canonical selling fields on `vehicles` (`current_selling_price`, `minimum_selling_price`) are **synced** on save so inventory list/detail keep working.

## RPCs

- `get_vehicle_total_cost(vehicle_id)`
- `get_vehicle_cost_breakdown(vehicle_id)`
- `get_vehicle_profitability(vehicle_id, selling_price?)`
- `upsert_vehicle_pricing(...)`
- `approve_vehicle_pricing(vehicle_id, note, approve)`

## Permissions

- `pricing.view` / `create` / `update` / `approve`
- `pricing.discount.approve`
- `pricing.override_minimum`
- `pricing.history.view`

Also accepts legacy `vehicle.price.*` / `vehicle.cost.*` / `vehicle.profit.view` where appropriate.

## Routes

- `/pricing` — list
- `/pricing/[vehicleId]` — detail
- Inventory → Pricing tab
- API: `GET /api/pricing`, `GET/PUT /api/pricing/[vehicleId]`, `POST .../approve`

## Audit

`PRICING_CREATED`, `PRICING_UPDATED`, `PRICE_CHANGED`, `MINIMUM_PRICE_OVERRIDE`, `PRICING_APPROVED`, `DISCOUNT_REJECTED`
