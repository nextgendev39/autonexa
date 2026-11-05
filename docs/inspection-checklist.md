# Inspection checklist model

Templates define reusable sections/items. Starting an inspection (or `populate_inspection_checklist`) materializes `inspection_sections` + `inspection_items` for that inspection only.

## Section keys

Canonical keys (`inspection_section_display_name` / `INSPECTION_SECTION_KEYS`):

| Key | Display name |
| --- | --- |
| `vehicle_identity` | Vehicle Identity |
| `exterior` | Exterior |
| `interior` | Interior |
| `engine` | Engine |
| `transmission` | Transmission |
| `electrical` | Electrical |
| `air_conditioning` | Air Conditioning |
| `brakes` | Brakes |
| `suspension` | Suspension |
| `steering` | Steering |
| `tyres_wheels` | Tyres & Wheels |
| `fluids` | Fluids |
| `lights` | Lights |
| `safety` | Safety |
| `undercarriage` | Undercarriage |
| `accident_damage` | Accident Damage |
| `road_test` | Road Test |
| `documents` | Documents |
| `final_assessment` | Final Assessment |

Unknown keys fall back to a title-cased underscore→space label.

## Item results

| `inspection_item_result` | Meaning |
| --- | --- |
| `pass` | Item OK |
| `fail` | Failed check |
| `advisory` | Pass with note / monitor |
| `not_applicable` | Skipped as N/A |
| `not_tested` | Default after populate; counts as incomplete for required items |

Required items still `null` or `not_tested` block submit unless `inspection.override` is used.

## Severity

| `inspection_severity` | Notes |
| --- | --- |
| `info` | Informational |
| `minor` | Low impact |
| `moderate` | Default for findings |
| `major` | Significant defect |
| `critical` | Blocks approve unless override; `is_critical` generated column |

## Findings model

Table `inspection_findings`:

| Field | Notes |
| --- | --- |
| `inspection_item_id` / `section_id` | Optional links |
| `result` | Item-style result (default `fail`) |
| `severity` | Drives `is_critical` |
| `title` / `description` | Required title |
| `recommended_action` | Free-text action |
| `recommendation` | Enum recommendation |
| `estimated_cost` / `currency` | Estimate only; SELECT revoked — use `read_inspection_costs` |
| `damage_type` / `damage_location` | Optional taxonomy |
| `is_resolved` | Cleared criticals no longer block approve |

## Recommendations

Two layers:

1. Header `inspections.recommendation` — overall enum set on submit/edit
2. Rows in `inspection_recommendations` — structured follow-ups, optional `finding_id`, priority, notes, estimated cost

Enum values:

```text
no_action
monitor
repair_before_sale
repair_urgently
replace
reinspect
```

## Damage types

```text
scratch, dent, paint_damage, crack, rust, panel_damage,
glass_damage, mechanical_damage, electrical_damage,
accident_damage, wear_and_tear, other
```

## Damage locations

```text
front, rear, left_side, right_side, roof, interior,
engine_bay, undercarriage, other
```

## Photo categories

```text
front, rear, left_side, right_side, interior, dashboard,
odometer, vin, engine, tyre, damage, undercarriage, other
```

## Templates

Seeded templates (migration `00031_phase7_inspections.sql`):

| Name | Type | Purpose |
| --- | --- | --- |
| Full Vehicle Inspection | `full_inspection` | Comprehensive pre-sale sections (identity through final assessment) |
| Basic Vehicle Inspection | `basic_inspection` | Shorter operational checklist |

Template items carry `section_key`, `name`, `category`, `sort_order`, `is_required`. Population is **idempotent** — if items already exist for the inspection, `populate_inspection_checklist` returns without duplicating.

## Overall inspection results

| `inspection_result` | Typical use |
| --- | --- |
| `pass` | Clear for sale |
| `pass_with_advisories` | Saleable with notes |
| `repair_required` | Needs workshop before sale |
| `fail` | Failed inspection |

These are set by the inspector/reviewer (submit/edit), not derived automatically from finding counts.
