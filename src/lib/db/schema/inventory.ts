/** inventory domain. PostgreSQL names are preserved; TypeScript fields use camelCase. */
import {
  type PgTableExtraConfigValue,
  pgTable,
  foreignKey,
  pgPolicy,
  check,
  uuid,
  text,
  boolean,
  timestamp,
  index,
  numeric,
  char,
  date,
  uniqueIndex,
  integer,
  unique,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { profiles } from "./identity";
import { branches, branchLocations } from "./branches";
import { vehicleMakes, vehicleModels, vehicleModelYears, vehicleVariants } from "./catalog";
import { acquisitions } from "./acquisitions";
import { documents } from "./documents";
import {
  driveType,
  fuelType,
  mileageUnit,
  transmissionType,
  vehicleCondition,
  vehicleExpenseCategory,
  vehicleMarketType,
  vehicleOrigin,
  vehiclePhotoCategory,
  vehicleSource,
  vehicleStatus,
} from "./enums";

export const vehicleExpenses = pgTable(
  "vehicle_expenses",
  {
    id: uuid().defaultRandom().primaryKey().notNull(),
    vehicleId: uuid("vehicle_id").notNull(),
    acquisitionId: uuid("acquisition_id"),
    category: vehicleExpenseCategory().notNull(),
    description: text(),
    amount: numeric({ precision: 14, scale: 2 }).notNull(),
    currency: char({ length: 3 }).default("AED").notNull(),
    expenseDate: date("expense_date")
      .default(sql`(timezone('utc'::text, now()))::date`)
      .notNull(),
    referenceNumber: text("reference_number"),
    vendorName: text("vendor_name"),
    documentId: uuid("document_id"),
    createdBy: uuid("created_by"),
    createdAt: timestamp("created_at", { withTimezone: true, mode: "string" })
      .default(sql`timezone('utc'::text, now())`)
      .notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true, mode: "string" })
      .default(sql`timezone('utc'::text, now())`)
      .notNull(),
  },
  (table): PgTableExtraConfigValue[] => [
    index("vehicle_expenses_acquisition_id_idx").using(
      "btree",
      table.acquisitionId.asc().nullsLast().op("uuid_ops"),
    ),
    index("vehicle_expenses_vehicle_id_idx").using(
      "btree",
      table.vehicleId.asc().nullsLast().op("uuid_ops"),
    ),
    foreignKey({
      columns: [table.acquisitionId],
      foreignColumns: [acquisitions.id],
      name: "vehicle_expenses_acquisition_id_fkey",
    }).onDelete("set null"),
    foreignKey({
      columns: [table.createdBy],
      foreignColumns: [profiles.id],
      name: "vehicle_expenses_created_by_fkey",
    }).onDelete("set null"),
    foreignKey({
      columns: [table.documentId],
      foreignColumns: [documents.id],
      name: "vehicle_expenses_document_id_fkey",
    }).onDelete("set null"),
    foreignKey({
      columns: [table.vehicleId],
      foreignColumns: [vehicles.id],
      name: "vehicle_expenses_vehicle_id_fkey",
    }).onDelete("cascade"),
    pgPolicy("vehicle_expenses_select", {
      as: "permissive",
      for: "select",
      to: ["authenticated"],
      using: sql`((EXISTS ( SELECT 1
   FROM vehicles v
  WHERE ((v.id = vehicle_expenses.vehicle_id) AND (v.deleted_at IS NULL) AND has_permission_for_branch('vehicle.cost.view'::text, v.branch_id)))) OR ((acquisition_id IS NOT NULL) AND (EXISTS ( SELECT 1
   FROM acquisitions a
  WHERE ((a.id = vehicle_expenses.acquisition_id) AND (has_permission_for_branch('acquisition.expense.view'::text, a.branch_id) OR has_permission_for_branch('acquisition.cost.view'::text, a.branch_id)))))))`,
    }),
    pgPolicy("vehicle_expenses_mutate", {
      as: "permissive",
      for: "all",
      to: ["authenticated"],
      using: sql`((EXISTS ( SELECT 1
   FROM vehicles v
  WHERE ((v.id = vehicle_expenses.vehicle_id) AND (v.deleted_at IS NULL) AND has_permission_for_branch('vehicle.cost.edit'::text, v.branch_id)))) OR ((acquisition_id IS NOT NULL) AND (EXISTS ( SELECT 1
   FROM acquisitions a
  WHERE ((a.id = vehicle_expenses.acquisition_id) AND (has_permission_for_branch('acquisition.expense.edit'::text, a.branch_id) OR has_permission_for_branch('acquisition.expense.create'::text, a.branch_id) OR has_permission_for_branch('acquisition.cost.edit'::text, a.branch_id)))))))`,
      withCheck: sql`((EXISTS ( SELECT 1
   FROM vehicles v
  WHERE ((v.id = vehicle_expenses.vehicle_id) AND (v.deleted_at IS NULL) AND has_permission_for_branch('vehicle.cost.edit'::text, v.branch_id)))) OR ((acquisition_id IS NOT NULL) AND (EXISTS ( SELECT 1
   FROM acquisitions a
  WHERE ((a.id = vehicle_expenses.acquisition_id) AND (has_permission_for_branch('acquisition.expense.edit'::text, a.branch_id) OR has_permission_for_branch('acquisition.expense.create'::text, a.branch_id) OR has_permission_for_branch('acquisition.cost.edit'::text, a.branch_id)))))))`,
    }),
    check("vehicle_expenses_amount_non_negative", sql`amount >= (0)::numeric`),
    check("vehicle_expenses_currency_format", sql`currency ~ '^[A-Z]{3}$'::text`),
  ],
).enableRLS();

export const vehicleStatusHistory = pgTable(
  "vehicle_status_history",
  {
    id: uuid().defaultRandom().primaryKey().notNull(),
    vehicleId: uuid("vehicle_id").notNull(),
    oldStatus: vehicleStatus("old_status"),
    newStatus: vehicleStatus("new_status").notNull(),
    reason: text(),
    changedBy: uuid("changed_by"),
    createdAt: timestamp("created_at", { withTimezone: true, mode: "string" })
      .default(sql`timezone('utc'::text, now())`)
      .notNull(),
  },
  (table): PgTableExtraConfigValue[] => [
    index("vehicle_status_history_vehicle_id_idx").using(
      "btree",
      table.vehicleId.asc().nullsLast().op("uuid_ops"),
    ),
    foreignKey({
      columns: [table.changedBy],
      foreignColumns: [profiles.id],
      name: "vehicle_status_history_changed_by_fkey",
    }).onDelete("set null"),
    foreignKey({
      columns: [table.vehicleId],
      foreignColumns: [vehicles.id],
      name: "vehicle_status_history_vehicle_id_fkey",
    }).onDelete("cascade"),
    pgPolicy("vehicle_status_history_select", {
      as: "permissive",
      for: "select",
      to: ["authenticated"],
      using: sql`(EXISTS ( SELECT 1
   FROM vehicles v
  WHERE ((v.id = vehicle_status_history.vehicle_id) AND (v.deleted_at IS NULL) AND has_permission_for_branch('vehicle.view'::text, v.branch_id))))`,
    }),
  ],
).enableRLS();

export const vehiclePhotos = pgTable(
  "vehicle_photos",
  {
    id: uuid().defaultRandom().primaryKey().notNull(),
    vehicleId: uuid("vehicle_id").notNull(),
    storagePath: text("storage_path").notNull(),
    category: vehiclePhotoCategory().default("other").notNull(),
    fileName: text("file_name").notNull(),
    mimeType: text("mime_type"),
    fileSize: integer("file_size"),
    sortOrder: integer("sort_order").default(0).notNull(),
    isPrimary: boolean("is_primary").default(false).notNull(),
    uploadedBy: uuid("uploaded_by"),
    createdAt: timestamp("created_at", { withTimezone: true, mode: "string" })
      .default(sql`timezone('utc'::text, now())`)
      .notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true, mode: "string" })
      .default(sql`timezone('utc'::text, now())`)
      .notNull(),
  },
  (table): PgTableExtraConfigValue[] => [
    uniqueIndex("vehicle_photos_one_primary")
      .using("btree", table.vehicleId.asc().nullsLast().op("uuid_ops"))
      .where(sql`(is_primary = true)`),
    index("vehicle_photos_vehicle_id_category_idx").using(
      "btree",
      table.vehicleId.asc().nullsLast().op("uuid_ops"),
      table.category.asc().nullsLast().op("enum_ops"),
    ),
    index("vehicle_photos_vehicle_id_idx").using(
      "btree",
      table.vehicleId.asc().nullsLast().op("uuid_ops"),
    ),
    index("vehicle_photos_vehicle_id_sort_order_idx").using(
      "btree",
      table.vehicleId.asc().nullsLast().op("uuid_ops"),
      table.sortOrder.asc().nullsLast().op("int4_ops"),
    ),
    foreignKey({
      columns: [table.uploadedBy],
      foreignColumns: [profiles.id],
      name: "vehicle_photos_uploaded_by_fkey",
    }).onDelete("set null"),
    foreignKey({
      columns: [table.vehicleId],
      foreignColumns: [vehicles.id],
      name: "vehicle_photos_vehicle_id_fkey",
    }).onDelete("cascade"),
    pgPolicy("vehicle_photos_select", {
      as: "permissive",
      for: "select",
      to: ["authenticated"],
      using: sql`(EXISTS ( SELECT 1
   FROM vehicles v
  WHERE ((v.id = vehicle_photos.vehicle_id) AND (v.deleted_at IS NULL) AND has_permission_for_branch('vehicle.view'::text, v.branch_id))))`,
    }),
    pgPolicy("vehicle_photos_mutate", {
      as: "permissive",
      for: "all",
      to: ["authenticated"],
      using: sql`(EXISTS ( SELECT 1
   FROM vehicles v
  WHERE ((v.id = vehicle_photos.vehicle_id) AND (v.deleted_at IS NULL) AND (has_permission_for_branch('vehicle.edit'::text, v.branch_id) OR has_permission_for_branch('vehicle.create'::text, v.branch_id)))))`,
      withCheck: sql`(EXISTS ( SELECT 1
   FROM vehicles v
  WHERE ((v.id = vehicle_photos.vehicle_id) AND (v.deleted_at IS NULL) AND (has_permission_for_branch('vehicle.edit'::text, v.branch_id) OR has_permission_for_branch('vehicle.create'::text, v.branch_id)))))`,
    }),
    check("vehicle_photos_file_size_non_negative", sql`(file_size IS NULL) OR (file_size >= 0)`),
    check("vehicle_photos_storage_path_not_blank", sql`length(TRIM(BOTH FROM storage_path)) > 0`),
  ],
).enableRLS();

export const vehicles = pgTable(
  "vehicles",
  {
    id: uuid().defaultRandom().primaryKey().notNull(),
    stockNumber: text("stock_number").notNull(),
    vin: text(),
    make: text().notNull(),
    model: text().notNull(),
    variant: text(),
    year: integer().notNull(),
    mileage: integer().default(0).notNull(),
    exteriorColor: text("exterior_color"),
    interiorColor: text("interior_color"),
    bodyType: text("body_type"),
    transmission: transmissionType(),
    fuelType: fuelType("fuel_type"),
    engineSize: text("engine_size"),
    seats: integer(),
    doors: integer(),
    originType: vehicleOrigin("origin_type"),
    countryOfOrigin: text("country_of_origin"),
    condition: vehicleCondition(),
    branchId: uuid("branch_id").notNull(),
    source: vehicleSource().default("other").notNull(),
    status: vehicleStatus().default("acquired").notNull(),
    purchaseDate: date("purchase_date"),
    registrationExpiry: date("registration_expiry"),
    description: text(),
    totalAcquisitionCost: numeric("total_acquisition_cost", { precision: 14, scale: 2 })
      .default("0")
      .notNull(),
    currentSellingPrice: numeric("current_selling_price", { precision: 14, scale: 2 }),
    minimumSellingPrice: numeric("minimum_selling_price", { precision: 14, scale: 2 }),
    currency: char({ length: 3 }).default("AED").notNull(),
    createdBy: uuid("created_by"),
    updatedBy: uuid("updated_by"),
    deletedAt: timestamp("deleted_at", { withTimezone: true, mode: "string" }),
    deletedBy: uuid("deleted_by"),
    createdAt: timestamp("created_at", { withTimezone: true, mode: "string" })
      .default(sql`timezone('utc'::text, now())`)
      .notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true, mode: "string" })
      .default(sql`timezone('utc'::text, now())`)
      .notNull(),
    chassisNumber: text("chassis_number"),
    driveType: driveType("drive_type"),
    engineCylinders: integer("engine_cylinders"),
    mileageUnit: mileageUnit("mileage_unit").default("km").notNull(),
    locationId: uuid("location_id"),
    registrationDate: date("registration_date"),
    archivedAt: timestamp("archived_at", { withTimezone: true, mode: "string" }),
    makeId: uuid("make_id"),
    modelId: uuid("model_id"),
    marketType: vehicleMarketType("market_type").default("used").notNull(),
    visibleToStaff: boolean("visible_to_staff").default(true).notNull(),
    modelYearId: uuid("model_year_id"),
    variantId: uuid("variant_id"),
    customVariant: text("custom_variant"),
    quantity: integer().default(1).notNull(),
    portLocation: text("port_location"),
    splitFromId: uuid("split_from_id"),
    hasMinimumPrice: boolean("has_minimum_price").generatedAlwaysAs(
      sql`(COALESCE(minimum_selling_price, (0)::numeric) > (0)::numeric)`,
    ),
  },
  (table): PgTableExtraConfigValue[] => [
    index("vehicles_acquisition_date_idx").using(
      "btree",
      table.purchaseDate.asc().nullsLast().op("date_ops"),
    ),
    index("vehicles_branch_id_idx").using("btree", table.branchId.asc().nullsLast().op("uuid_ops")),
    uniqueIndex("vehicles_chassis_active_unique")
      .using("btree", table.chassisNumber.asc().nullsLast().op("text_ops"))
      .where(sql`((deleted_at IS NULL) AND (chassis_number IS NOT NULL))`),
    index("vehicles_chassis_trgm_idx").using(
      "gin",
      table.chassisNumber.asc().nullsLast().op("gin_trgm_ops"),
    ),
    index("vehicles_created_at_idx").using(
      "btree",
      table.createdAt.desc().nullsFirst().op("timestamptz_ops"),
    ),
    index("vehicles_location_id_idx").using(
      "btree",
      table.locationId.asc().nullsLast().op("uuid_ops"),
    ),
    index("vehicles_make_id_idx").using("btree", table.makeId.asc().nullsLast().op("uuid_ops")),
    index("vehicles_make_model_idx")
      .using(
        "btree",
        table.make.asc().nullsLast().op("text_ops"),
        table.model.asc().nullsLast().op("text_ops"),
      )
      .where(sql`(deleted_at IS NULL)`),
    index("vehicles_make_trgm_idx").using("gin", table.make.asc().nullsLast().op("gin_trgm_ops")),
    index("vehicles_market_type_idx")
      .using("btree", table.marketType.asc().nullsLast().op("enum_ops"))
      .where(sql`(deleted_at IS NULL)`),
    index("vehicles_model_id_idx").using("btree", table.modelId.asc().nullsLast().op("uuid_ops")),
    index("vehicles_model_trgm_idx").using("gin", table.model.asc().nullsLast().op("gin_trgm_ops")),
    index("vehicles_model_year_id_idx").using(
      "btree",
      table.modelYearId.asc().nullsLast().op("uuid_ops"),
    ),
    index("vehicles_status_idx")
      .using("btree", table.status.asc().nullsLast().op("enum_ops"))
      .where(sql`(deleted_at IS NULL)`),
    uniqueIndex("vehicles_stock_number_active_unique")
      .using("btree", table.stockNumber.asc().nullsLast().op("text_ops"))
      .where(sql`(deleted_at IS NULL)`),
    index("vehicles_stock_trgm_idx").using(
      "gin",
      table.stockNumber.asc().nullsLast().op("gin_trgm_ops"),
    ),
    index("vehicles_updated_at_idx").using(
      "btree",
      table.updatedAt.asc().nullsLast().op("timestamptz_ops"),
    ),
    index("vehicles_variant_id_idx").using(
      "btree",
      table.variantId.asc().nullsLast().op("uuid_ops"),
    ),
    uniqueIndex("vehicles_vin_active_unique")
      .using("btree", table.vin.asc().nullsLast().op("text_ops"))
      .where(sql`((deleted_at IS NULL) AND (vin IS NOT NULL))`),
    index("vehicles_year_idx")
      .using("btree", table.year.asc().nullsLast().op("int4_ops"))
      .where(sql`(deleted_at IS NULL)`),
    foreignKey({
      columns: [table.branchId],
      foreignColumns: [branches.id],
      name: "vehicles_branch_id_fkey",
    }),
    foreignKey({
      columns: [table.createdBy],
      foreignColumns: [profiles.id],
      name: "vehicles_created_by_fkey",
    }).onDelete("set null"),
    foreignKey({
      columns: [table.deletedBy],
      foreignColumns: [profiles.id],
      name: "vehicles_deleted_by_fkey",
    }).onDelete("set null"),
    foreignKey({
      columns: [table.locationId],
      foreignColumns: [branchLocations.id],
      name: "vehicles_location_id_fkey",
    }).onDelete("set null"),
    foreignKey({
      columns: [table.splitFromId],
      foreignColumns: [table.id],
      name: "vehicles_split_from_id_fkey",
    }).onDelete("set null"),
    index("vehicles_split_from_id_idx").using(
      "btree",
      table.splitFromId.asc().nullsLast().op("uuid_ops"),
    ),
    foreignKey({
      columns: [table.makeId],
      foreignColumns: [vehicleMakes.id],
      name: "vehicles_make_id_fkey",
    }).onDelete("set null"),
    foreignKey({
      columns: [table.modelId],
      foreignColumns: [vehicleModels.id],
      name: "vehicles_model_id_fkey",
    }).onDelete("set null"),
    foreignKey({
      columns: [table.modelYearId],
      foreignColumns: [vehicleModelYears.id],
      name: "vehicles_model_year_id_fkey",
    }).onDelete("set null"),
    foreignKey({
      columns: [table.updatedBy],
      foreignColumns: [profiles.id],
      name: "vehicles_updated_by_fkey",
    }).onDelete("set null"),
    foreignKey({
      columns: [table.variantId],
      foreignColumns: [vehicleVariants.id],
      name: "vehicles_variant_id_fkey",
    }).onDelete("set null"),
    pgPolicy("vehicles_select", {
      as: "permissive",
      for: "select",
      to: ["authenticated"],
      using: sql`((deleted_at IS NULL) AND has_permission_for_branch('vehicle.view'::text, branch_id))`,
    }),
    pgPolicy("vehicles_insert", {
      as: "permissive",
      for: "insert",
      to: ["authenticated"],
      withCheck: sql`has_permission_for_branch('vehicle.create'::text, branch_id)`,
    }),
    pgPolicy("vehicles_update", {
      as: "permissive",
      for: "update",
      to: ["authenticated"],
      using: sql`((deleted_at IS NULL) AND has_permission_for_branch('vehicle.edit'::text, branch_id))`,
      withCheck: sql`has_permission_for_branch('vehicle.edit'::text, branch_id)`,
    }),
    pgPolicy("vehicles_delete", {
      as: "permissive",
      for: "delete",
      to: ["authenticated"],
      using: sql`has_permission_for_branch('vehicle.delete'::text, branch_id)`,
    }),
    check("vehicles_acquisition_cost_non_negative", sql`total_acquisition_cost >= (0)::numeric`),
    check(
      "vehicles_chassis_not_blank",
      sql`(chassis_number IS NULL) OR (length(TRIM(BOTH FROM chassis_number)) > 0)`,
    ),
    check("vehicles_currency_format", sql`currency ~ '^[A-Z]{3}$'::text`),
    check(
      "vehicles_custom_variant_not_blank",
      sql`(custom_variant IS NULL) OR (length(TRIM(BOTH FROM custom_variant)) > 0)`,
    ),
    check("vehicles_doors_positive", sql`(doors IS NULL) OR (doors > 0)`),
    check(
      "vehicles_engine_cylinders_positive",
      sql`(engine_cylinders IS NULL) OR (engine_cylinders > 0)`,
    ),
    check("vehicles_make_not_blank", sql`length(TRIM(BOTH FROM make)) > 0`),
    check("vehicles_mileage_non_negative", sql`mileage >= 0`),
    check(
      "vehicles_minimum_price_non_negative",
      sql`(minimum_selling_price IS NULL) OR (minimum_selling_price >= (0)::numeric)`,
    ),
    check("vehicles_model_not_blank", sql`length(TRIM(BOTH FROM model)) > 0`),
    check("vehicles_seats_positive", sql`(seats IS NULL) OR (seats > 0)`),
    check("vehicles_quantity_positive", sql`quantity > 0`),
    check(
      "vehicles_port_location_not_blank",
      sql`(port_location IS NULL) OR (length(TRIM(BOTH FROM port_location)) > 0)`,
    ),
    check(
      "vehicles_selling_price_non_negative",
      sql`(current_selling_price IS NULL) OR (current_selling_price >= (0)::numeric)`,
    ),
    check("vehicles_stock_number_not_blank", sql`length(TRIM(BOTH FROM stock_number)) > 0`),
    check("vehicles_vin_format", sql`(vin IS NULL) OR (vin ~ '^[A-HJ-NPR-Z0-9]{17}$'::text)`),
    check(
      "vehicles_year_range",
      sql`(year >= 1980) AND (year <= ((EXTRACT(year FROM timezone('utc'::text, now())))::integer + 1))`,
    ),
  ],
).enableRLS();

export const vehicleShareLinks = pgTable(
  "vehicle_share_links",
  {
    id: uuid().defaultRandom().primaryKey().notNull(),
    token: text().notNull(),
    vehicleId: uuid("vehicle_id").notNull(),
    createdBy: uuid("created_by").notNull(),
    viewCount: integer("view_count").default(0).notNull(),
    lastViewedAt: timestamp("last_viewed_at", { withTimezone: true, mode: "string" }),
    revokedAt: timestamp("revoked_at", { withTimezone: true, mode: "string" }),
    createdAt: timestamp("created_at", { withTimezone: true, mode: "string" })
      .default(sql`timezone('utc'::text, now())`)
      .notNull(),
  },
  (table): PgTableExtraConfigValue[] => [
    index("vehicle_share_links_vehicle_id_created_by_idx").using(
      "btree",
      table.vehicleId.asc().nullsLast().op("uuid_ops"),
      table.createdBy.asc().nullsLast().op("uuid_ops"),
    ),
    foreignKey({
      columns: [table.vehicleId],
      foreignColumns: [vehicles.id],
      name: "vehicle_share_links_vehicle_id_fkey",
    }).onDelete("cascade"),
    foreignKey({
      columns: [table.createdBy],
      foreignColumns: [profiles.id],
      name: "vehicle_share_links_created_by_fkey",
    }).onDelete("cascade"),
    unique("vehicle_share_links_token_unique").on(table.token),
  ],
).enableRLS();
