/** pricing domain. PostgreSQL names are preserved; TypeScript fields use camelCase. */
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
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { profiles } from "./identity";
import { vehicles } from "./inventory";
import { pricingChangeReason, pricingStatus } from "./enums";

export const vehiclePricing = pgTable(
  "vehicle_pricing",
  {
    id: uuid().defaultRandom().primaryKey().notNull(),
    vehicleId: uuid("vehicle_id").notNull(),
    minimumSellingPrice: numeric("minimum_selling_price", { precision: 14, scale: 2 }),
    targetSellingPrice: numeric("target_selling_price", { precision: 14, scale: 2 }),
    advertisedPrice: numeric("advertised_price", { precision: 14, scale: 2 }),
    currentSellingPrice: numeric("current_selling_price", { precision: 14, scale: 2 }),
    maximumDiscountAmount: numeric("maximum_discount_amount", { precision: 14, scale: 2 }),
    maximumDiscountPercent: numeric("maximum_discount_percent", { precision: 5, scale: 2 }),
    pricingStatus: pricingStatus("pricing_status").default("draft").notNull(),
    pricingNotes: text("pricing_notes"),
    changeReason: pricingChangeReason("change_reason"),
    changeNotes: text("change_notes"),
    overrideMinimum: boolean("override_minimum").default(false).notNull(),
    overrideReason: text("override_reason"),
    approvedBy: uuid("approved_by"),
    approvedAt: timestamp("approved_at", { withTimezone: true, mode: "string" }),
    effectiveFrom: timestamp("effective_from", { withTimezone: true, mode: "string" })
      .default(sql`timezone('utc'::text, now())`)
      .notNull(),
    createdBy: uuid("created_by"),
    updatedBy: uuid("updated_by"),
    createdAt: timestamp("created_at", { withTimezone: true, mode: "string" })
      .default(sql`timezone('utc'::text, now())`)
      .notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true, mode: "string" })
      .default(sql`timezone('utc'::text, now())`)
      .notNull(),
  },
  (table): PgTableExtraConfigValue[] => [
    index("vehicle_pricing_status_idx").using(
      "btree",
      table.pricingStatus.asc().nullsLast().op("enum_ops"),
    ),
    index("vehicle_pricing_updated_at_idx").using(
      "btree",
      table.updatedAt.desc().nullsFirst().op("timestamptz_ops"),
    ),
    foreignKey({
      columns: [table.approvedBy],
      foreignColumns: [profiles.id],
      name: "vehicle_pricing_approved_by_fkey",
    }).onDelete("set null"),
    foreignKey({
      columns: [table.createdBy],
      foreignColumns: [profiles.id],
      name: "vehicle_pricing_created_by_fkey",
    }).onDelete("set null"),
    foreignKey({
      columns: [table.updatedBy],
      foreignColumns: [profiles.id],
      name: "vehicle_pricing_updated_by_fkey",
    }).onDelete("set null"),
    foreignKey({
      columns: [table.vehicleId],
      foreignColumns: [vehicles.id],
      name: "vehicle_pricing_vehicle_id_fkey",
    }).onDelete("cascade"),
    unique("vehicle_pricing_vehicle_unique").on(table.vehicleId),
    pgPolicy("vehicle_pricing_select", {
      as: "permissive",
      for: "select",
      to: ["authenticated"],
      using: sql`(EXISTS ( SELECT 1
   FROM vehicles v
  WHERE ((v.id = vehicle_pricing.vehicle_id) AND (v.deleted_at IS NULL) AND can_access_branch(v.branch_id) AND (has_permission_for_branch('pricing.view'::text, v.branch_id) OR has_permission_for_branch('vehicle.price.view'::text, v.branch_id)))))`,
    }),
    pgPolicy("vehicle_pricing_mutate", {
      as: "permissive",
      for: "all",
      to: ["authenticated"],
      using: sql`(EXISTS ( SELECT 1
   FROM vehicles v
  WHERE ((v.id = vehicle_pricing.vehicle_id) AND (v.deleted_at IS NULL) AND can_access_branch(v.branch_id) AND (has_permission_for_branch('pricing.update'::text, v.branch_id) OR has_permission_for_branch('pricing.create'::text, v.branch_id) OR has_permission_for_branch('vehicle.price.edit'::text, v.branch_id)))))`,
      withCheck: sql`(EXISTS ( SELECT 1
   FROM vehicles v
  WHERE ((v.id = vehicle_pricing.vehicle_id) AND (v.deleted_at IS NULL) AND can_access_branch(v.branch_id) AND (has_permission_for_branch('pricing.update'::text, v.branch_id) OR has_permission_for_branch('pricing.create'::text, v.branch_id) OR has_permission_for_branch('vehicle.price.edit'::text, v.branch_id)))))`,
    }),
    check(
      "vehicle_pricing_advertised_non_negative",
      sql`(advertised_price IS NULL) OR (advertised_price >= (0)::numeric)`,
    ),
    check(
      "vehicle_pricing_current_non_negative",
      sql`(current_selling_price IS NULL) OR (current_selling_price >= (0)::numeric)`,
    ),
    check(
      "vehicle_pricing_max_discount_amount_non_negative",
      sql`(maximum_discount_amount IS NULL) OR (maximum_discount_amount >= (0)::numeric)`,
    ),
    check(
      "vehicle_pricing_max_discount_percent_range",
      sql`(maximum_discount_percent IS NULL) OR ((maximum_discount_percent >= (0)::numeric) AND (maximum_discount_percent <= (100)::numeric))`,
    ),
    check(
      "vehicle_pricing_min_lte_target",
      sql`(minimum_selling_price IS NULL) OR (target_selling_price IS NULL) OR (minimum_selling_price <= target_selling_price)`,
    ),
    check(
      "vehicle_pricing_minimum_non_negative",
      sql`(minimum_selling_price IS NULL) OR (minimum_selling_price >= (0)::numeric)`,
    ),
    check(
      "vehicle_pricing_override_reason_required",
      sql`(NOT override_minimum) OR ((override_reason IS NOT NULL) AND (length(TRIM(BOTH FROM override_reason)) > 0))`,
    ),
    check(
      "vehicle_pricing_target_non_negative",
      sql`(target_selling_price IS NULL) OR (target_selling_price >= (0)::numeric)`,
    ),
  ],
).enableRLS();

export const vehiclePricingHistory = pgTable(
  "vehicle_pricing_history",
  {
    id: uuid().defaultRandom().primaryKey().notNull(),
    vehicleId: uuid("vehicle_id").notNull(),
    pricingId: uuid("pricing_id"),
    previousMinimumPrice: numeric("previous_minimum_price", { precision: 14, scale: 2 }),
    newMinimumPrice: numeric("new_minimum_price", { precision: 14, scale: 2 }),
    previousTargetPrice: numeric("previous_target_price", { precision: 14, scale: 2 }),
    newTargetPrice: numeric("new_target_price", { precision: 14, scale: 2 }),
    previousAdvertisedPrice: numeric("previous_advertised_price", { precision: 14, scale: 2 }),
    newAdvertisedPrice: numeric("new_advertised_price", { precision: 14, scale: 2 }),
    previousCurrentPrice: numeric("previous_current_price", { precision: 14, scale: 2 }),
    newCurrentPrice: numeric("new_current_price", { precision: 14, scale: 2 }),
    previousDiscount: numeric("previous_discount", { precision: 14, scale: 2 }),
    newDiscount: numeric("new_discount", { precision: 14, scale: 2 }),
    previousStatus: pricingStatus("previous_status"),
    newStatus: pricingStatus("new_status"),
    reason: pricingChangeReason(),
    notes: text(),
    overrideMinimum: boolean("override_minimum").default(false).notNull(),
    changedBy: uuid("changed_by"),
    changedAt: timestamp("changed_at", { withTimezone: true, mode: "string" })
      .default(sql`timezone('utc'::text, now())`)
      .notNull(),
  },
  (table): PgTableExtraConfigValue[] => [
    index("vehicle_pricing_history_pricing_id_idx").using(
      "btree",
      table.pricingId.asc().nullsLast().op("uuid_ops"),
    ),
    index("vehicle_pricing_history_vehicle_id_idx").using(
      "btree",
      table.vehicleId.asc().nullsLast().op("uuid_ops"),
      table.changedAt.desc().nullsFirst().op("timestamptz_ops"),
    ),
    foreignKey({
      columns: [table.changedBy],
      foreignColumns: [profiles.id],
      name: "vehicle_pricing_history_changed_by_fkey",
    }).onDelete("set null"),
    foreignKey({
      columns: [table.pricingId],
      foreignColumns: [vehiclePricing.id],
      name: "vehicle_pricing_history_pricing_id_fkey",
    }).onDelete("set null"),
    foreignKey({
      columns: [table.vehicleId],
      foreignColumns: [vehicles.id],
      name: "vehicle_pricing_history_vehicle_id_fkey",
    }).onDelete("cascade"),
    pgPolicy("vehicle_pricing_history_select", {
      as: "permissive",
      for: "select",
      to: ["authenticated"],
      using: sql`(EXISTS ( SELECT 1
   FROM vehicles v
  WHERE ((v.id = vehicle_pricing_history.vehicle_id) AND (v.deleted_at IS NULL) AND can_access_branch(v.branch_id) AND (has_permission_for_branch('pricing.history.view'::text, v.branch_id) OR has_permission_for_branch('pricing.view'::text, v.branch_id) OR has_permission_for_branch('vehicle.price.view'::text, v.branch_id)))))`,
    }),
  ],
).enableRLS();
