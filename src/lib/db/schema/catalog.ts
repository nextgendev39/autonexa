/** catalog domain. PostgreSQL names are preserved; TypeScript fields use camelCase. */
import {
  type PgTableExtraConfigValue,
  pgTable,
  foreignKey,
  unique,
  pgPolicy,
  check,
  uuid,
  text,
  boolean,
  timestamp,
  index,
  numeric,
  integer,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { driveType, fuelType, transmissionType } from "./enums";

export const vehicleMakes = pgTable(
  "vehicle_makes",
  {
    id: uuid().defaultRandom().primaryKey().notNull(),
    name: text().notNull(),
    isActive: boolean("is_active").default(true).notNull(),
    sortOrder: integer("sort_order").default(0).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true, mode: "string" })
      .default(sql`timezone('utc'::text, now())`)
      .notNull(),
    nameAr: text("name_ar"),
    slug: text().notNull(),
    country: text(),
    updatedAt: timestamp("updated_at", { withTimezone: true, mode: "string" })
      .default(sql`timezone('utc'::text, now())`)
      .notNull(),
  },
  (table): PgTableExtraConfigValue[] => [
    unique("vehicle_makes_name_unique").on(table.name),
    unique("vehicle_makes_slug_unique").on(table.slug),
    pgPolicy("vehicle_makes_select", {
      as: "permissive",
      for: "select",
      to: ["authenticated"],
      using: sql`is_active_staff()`,
    }),
    pgPolicy("vehicle_makes_manage", {
      as: "permissive",
      for: "all",
      to: ["authenticated"],
      using: sql`(has_permission('settings.manage'::text) OR is_super_admin())`,
      withCheck: sql`(has_permission('settings.manage'::text) OR is_super_admin())`,
    }),
    check("vehicle_makes_name_not_blank", sql`length(TRIM(BOTH FROM name)) > 0`),
    check("vehicle_makes_slug_not_blank", sql`length(TRIM(BOTH FROM slug)) > 0`),
  ],
).enableRLS();

export const vehicleModels = pgTable(
  "vehicle_models",
  {
    id: uuid().defaultRandom().primaryKey().notNull(),
    makeId: uuid("make_id").notNull(),
    name: text().notNull(),
    isActive: boolean("is_active").default(true).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true, mode: "string" })
      .default(sql`timezone('utc'::text, now())`)
      .notNull(),
    nameAr: text("name_ar"),
    slug: text().notNull(),
    vehicleType: text("vehicle_type"),
    sortOrder: integer("sort_order").default(0).notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true, mode: "string" })
      .default(sql`timezone('utc'::text, now())`)
      .notNull(),
  },
  (table): PgTableExtraConfigValue[] => [
    index("vehicle_models_make_id_idx").using(
      "btree",
      table.makeId.asc().nullsLast().op("uuid_ops"),
    ),
    foreignKey({
      columns: [table.makeId],
      foreignColumns: [vehicleMakes.id],
      name: "vehicle_models_make_id_fkey",
    }).onDelete("cascade"),
    unique("vehicle_models_make_name_unique").on(table.makeId, table.name),
    unique("vehicle_models_make_slug_unique").on(table.makeId, table.slug),
    pgPolicy("vehicle_models_manage", {
      as: "permissive",
      for: "all",
      to: ["authenticated"],
      using: sql`(has_permission('settings.manage'::text) OR is_super_admin())`,
      withCheck: sql`(has_permission('settings.manage'::text) OR is_super_admin())`,
    }),
    pgPolicy("vehicle_models_select", {
      as: "permissive",
      for: "select",
      to: ["authenticated"],
      using: sql`is_active_staff()`,
    }),
    check("vehicle_models_name_not_blank", sql`length(TRIM(BOTH FROM name)) > 0`),
    check("vehicle_models_slug_not_blank", sql`length(TRIM(BOTH FROM slug)) > 0`),
    check(
      "vehicle_models_vehicle_type_check",
      sql`(vehicle_type IS NULL) OR (vehicle_type = ANY (ARRAY['SEDAN'::text, 'SUV'::text, 'COUPE'::text, 'CONVERTIBLE'::text, 'HATCHBACK'::text, 'WAGON'::text, 'PICKUP'::text, 'VAN'::text, 'MPV'::text, 'MINIVAN'::text, 'COMMERCIAL'::text, 'SPORTS_CAR'::text, 'ELECTRIC'::text, 'OTHER'::text]))`,
    ),
  ],
).enableRLS();

export const vehicleModelYears = pgTable(
  "vehicle_model_years",
  {
    id: uuid().defaultRandom().primaryKey().notNull(),
    modelId: uuid("model_id").notNull(),
    year: integer().notNull(),
    market: text().default("UAE").notNull(),
    isActive: boolean("is_active").default(true).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true, mode: "string" })
      .default(sql`timezone('utc'::text, now())`)
      .notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true, mode: "string" })
      .default(sql`timezone('utc'::text, now())`)
      .notNull(),
  },
  (table): PgTableExtraConfigValue[] => [
    index("vehicle_model_years_active_idx")
      .using(
        "btree",
        table.modelId.asc().nullsLast().op("uuid_ops"),
        table.year.asc().nullsLast().op("int4_ops"),
      )
      .where(sql`is_active`),
    index("vehicle_model_years_model_id_idx").using(
      "btree",
      table.modelId.asc().nullsLast().op("uuid_ops"),
    ),
    foreignKey({
      columns: [table.modelId],
      foreignColumns: [vehicleModels.id],
      name: "vehicle_model_years_model_id_fkey",
    }).onDelete("restrict"),
    unique("vehicle_model_years_model_year_market_unique").on(
      table.modelId,
      table.year,
      table.market,
    ),
    pgPolicy("vehicle_model_years_select", {
      as: "permissive",
      for: "select",
      to: ["authenticated"],
      using: sql`is_active_staff()`,
    }),
    pgPolicy("vehicle_model_years_manage", {
      as: "permissive",
      for: "all",
      to: ["authenticated"],
      using: sql`(has_permission('settings.manage'::text) OR is_super_admin())`,
      withCheck: sql`(has_permission('settings.manage'::text) OR is_super_admin())`,
    }),
    check("vehicle_model_years_market_not_blank", sql`length(TRIM(BOTH FROM market)) > 0`),
    check("vehicle_model_years_year_range", sql`(year >= 1980) AND (year <= 2100)`),
  ],
).enableRLS();

export const vehicleVariants = pgTable(
  "vehicle_variants",
  {
    id: uuid().defaultRandom().primaryKey().notNull(),
    modelYearId: uuid("model_year_id").notNull(),
    name: text().notNull(),
    nameAr: text("name_ar"),
    slug: text().notNull(),
    trimCode: text("trim_code"),
    engine: text(),
    engineCapacity: numeric("engine_capacity"),
    fuelType: fuelType("fuel_type"),
    transmission: transmissionType(),
    drivetrain: driveType(),
    bodyType: text("body_type"),
    seatingCapacity: integer("seating_capacity"),
    isActive: boolean("is_active").default(true).notNull(),
    sortOrder: integer("sort_order").default(0).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true, mode: "string" })
      .default(sql`timezone('utc'::text, now())`)
      .notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true, mode: "string" })
      .default(sql`timezone('utc'::text, now())`)
      .notNull(),
  },
  (table): PgTableExtraConfigValue[] => [
    index("vehicle_variants_active_idx")
      .using(
        "btree",
        table.modelYearId.asc().nullsLast().op("uuid_ops"),
        table.sortOrder.asc().nullsLast().op("int4_ops"),
        table.name.asc().nullsLast().op("text_ops"),
      )
      .where(sql`is_active`),
    index("vehicle_variants_model_year_id_idx").using(
      "btree",
      table.modelYearId.asc().nullsLast().op("uuid_ops"),
    ),
    foreignKey({
      columns: [table.modelYearId],
      foreignColumns: [vehicleModelYears.id],
      name: "vehicle_variants_model_year_id_fkey",
    }).onDelete("restrict"),
    unique("vehicle_variants_model_year_slug_unique").on(table.modelYearId, table.slug),
    pgPolicy("vehicle_variants_select", {
      as: "permissive",
      for: "select",
      to: ["authenticated"],
      using: sql`is_active_staff()`,
    }),
    pgPolicy("vehicle_variants_manage", {
      as: "permissive",
      for: "all",
      to: ["authenticated"],
      using: sql`(has_permission('settings.manage'::text) OR is_super_admin())`,
      withCheck: sql`(has_permission('settings.manage'::text) OR is_super_admin())`,
    }),
    check(
      "vehicle_variants_engine_capacity_positive",
      sql`(engine_capacity IS NULL) OR (engine_capacity > (0)::numeric)`,
    ),
    check("vehicle_variants_name_not_blank", sql`length(TRIM(BOTH FROM name)) > 0`),
    check(
      "vehicle_variants_seating_positive",
      sql`(seating_capacity IS NULL) OR (seating_capacity > 0)`,
    ),
    check("vehicle_variants_slug_not_blank", sql`length(TRIM(BOTH FROM slug)) > 0`),
  ],
).enableRLS();
