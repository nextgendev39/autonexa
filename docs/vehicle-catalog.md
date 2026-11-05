# UAE Vehicle Master Catalog

Master data for brands → models → model years → variants. Independent from inventory `vehicles` rows.

## Schema (reuse)

| Table | Role |
| --- | --- |
| `vehicle_makes` | Brands (extended with `slug`, `name_ar`, `country`) |
| `vehicle_models` | Models under a brand |
| `vehicle_model_years` | Year + market (`UAE`) |
| `vehicle_variants` | Verified trims for a model year |

Inventory links via `vehicles.make_id`, `model_id`, `model_year_id`, `variant_id`, plus optional `custom_variant` for non-catalog trims. Text columns `make` / `model` / `variant` / `year` remain as snapshots.

## Run the seed

```bash
# Regenerate SQL from the source catalog (optional)
node scripts/generate-vehicle-catalog-seed.mjs

# Apply migrations + seeds (local)
supabase db reset
```

`supabase/config.toml` loads:

1. `./seed.sql` (dev users / demo inventory)
2. `./seed/vehicle_catalog_uae.sql` (idempotent UPSERT catalog)

The catalog seed is safe to re-run: natural keys (`name` / `make_id+name` / `model_id+year+market` / `model_year_id+slug`).

After seeding, `map_vehicles_to_catalog()` links matching inventory text to ids. Unmatched rows land in `vehicle_catalog_mapping_unmatched`.

## V1 contents

- Major UAE/GCC brands (Japanese, Korean, German, US, Chinese EV/ICE, luxury)
- Models commonly sold in the UAE
- Model years only where the model existed (per-model `yearFrom` / `yearTo`)
- **Conservative verified variants only** (Camry, Land Cruiser, Patrol, Tahoe, etc.)

Do not invent UAE trims. Add missing trims in **Settings → Vehicle master catalog**.

## Admin: add catalog rows

Requires `settings.manage` (or super admin).

1. **Brand** — name + optional Arabic name (slug auto-derived)
2. **Model** — select brand, add model name
3. **Year** — select model, add year (market defaults to `UAE`)
4. **Variant** — select year, add trim name

Prefer **Deactivate** over delete when inventory references the row (hard delete is blocked).

## Inventory selectors

Create/Edit Inventory uses dependent searchable dropdowns:

Brand → Model → Year → Variant

Changing Brand clears Model/Year/Variant; changing Model clears Year/Variant; changing Year clears Variant.

**Other / custom variant** stores free text in `custom_variant` / `variant` for imported used cars outside the UAE distributor catalog.

Query keys (TanStack Query):

- `vehicle-brands` (via inventory meta makes)
- `vehicle-models-{brandId}`
- `vehicle-years-{modelId}`
- `vehicle-variants-{modelYearId}`

## Validation

- Frontend: dependent selects only offer valid children
- Backend: `assertCatalogSelection()` + DB trigger `validate_vehicle_catalog_links`

## RLS

- Read: authenticated active staff
- Write: `settings.manage` or super admin
