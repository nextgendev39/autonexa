# Vehicle Ready for Sale

Controlled transition to `ready_for_sale`. Workshop / Aqua Station is **optional** unless repairs are outstanding.

## Paths

### Direct (no repairs)

```text
acquired / under_inspection
  → approved inspection PASS (or pass_with_advisories)
  → Mark Ready for Sale
  → ready_for_sale
```

No workshop order is created.

### Repair path

```text
under_inspection
  → inspection repair_required
  → under_repair
  → workshop + quality check PASS
  → Mark Ready for Sale
  → ready_for_sale
```

## API

| Method | Path | Permission |
|---|---|---|
| `GET` | `/api/vehicles/:id/ready-for-sale` | `vehicle.ready_for_sale` or `vehicle.view` |
| `POST` | `/api/vehicles/:id/ready-for-sale` | `vehicle.ready_for_sale` |

Body:

```json
{
  "reason": "optional note",
  "override": false,
  "overrideReason": null
}
```

Override requires `vehicle.ready_for_sale.override` and a non-empty `overrideReason`.

## RPCs

- `evaluate_vehicle_ready_for_sale(vehicle_id)` — eligibility checklist
- `mark_vehicle_ready_for_sale(vehicle_id, reason, override, override_reason)` — atomic status update + status history + `VEHICLE_MARKED_READY_FOR_SALE` audit

## Eligibility

1. Latest **approved** inspection exists and is not expired
2. Result is `pass` / `pass_with_advisories`, or `repair_required` with workshop + QC pass
3. No unresolved critical findings
4. No active workshop orders / pending jobs when work exists
5. Quality check passed when refurbishment occurred
6. Configured mandatory documents (`document_types.required_for_sale`) present
7. Current status is `acquired`, `under_inspection`, or `under_repair`

## Inspection validity

Configured via `system_settings.key = 'inspection.validity_days'` (`null` = no expiry).

## Notes

- Inspection approve no longer auto-advances pass → `ready_for_sale`
- Workshop QC pass no longer auto-advances → `ready_for_sale`
- Generic Change Status cannot set `ready_for_sale` except un-reserve (`reserved` → `ready_for_sale`)
