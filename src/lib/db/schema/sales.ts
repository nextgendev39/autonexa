/** sales domain. PostgreSQL names are preserved; TypeScript fields use camelCase. */
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
  integer,
  numeric,
  char,
  date,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { profiles } from "./identity";
import { branches } from "./branches";
import { vehicles } from "./inventory";
import { customers } from "./crm";
import { paymentMethod, reservationStatus, saleStatus } from "./enums";

export const reservations = pgTable(
  "reservations",
  {
    id: uuid().defaultRandom().primaryKey().notNull(),
    reservationNumber: text("reservation_number").notNull(),
    vehicleId: uuid("vehicle_id").notNull(),
    customerId: uuid("customer_id").notNull(),
    salespersonId: uuid("salesperson_id"),
    branchId: uuid("branch_id").notNull(),
    amount: numeric({ precision: 14, scale: 2 }).default("0").notNull(),
    currency: char({ length: 3 }).default("AED").notNull(),
    status: reservationStatus().default("active").notNull(),
    reservedAt: timestamp("reserved_at", { withTimezone: true, mode: "string" })
      .default(sql`timezone('utc'::text, now())`)
      .notNull(),
    expiresAt: timestamp("expires_at", { withTimezone: true, mode: "string" }),
    sellingPrice: numeric("selling_price", { precision: 14, scale: 2 }),
    cancelledAt: timestamp("cancelled_at", { withTimezone: true, mode: "string" }),
    cancelReason: text("cancel_reason"),
    autoCancelled: boolean("auto_cancelled").default(false).notNull(),
    balanceOverdueNotifiedAt: timestamp("balance_overdue_notified_at", {
      withTimezone: true,
      mode: "string",
    }),
    balanceReceived: numeric("balance_received", { precision: 14, scale: 2 }),
    soldAt: timestamp("sold_at", { withTimezone: true, mode: "string" }),
    soldBy: uuid("sold_by"),
    units: integer(),
    cancellationHoldStatus: text("cancellation_hold_status"),
    cancellationHoldReason: text("cancellation_hold_reason"),
    cancellationHoldRequestedBy: uuid("cancellation_hold_requested_by"),
    cancellationHoldRequestedAt: timestamp("cancellation_hold_requested_at", {
      withTimezone: true,
      mode: "string",
    }),
    cancellationHoldReviewedBy: uuid("cancellation_hold_reviewed_by"),
    cancellationHoldReviewedAt: timestamp("cancellation_hold_reviewed_at", {
      withTimezone: true,
      mode: "string",
    }),
    cancellationHoldReviewNote: text("cancellation_hold_review_note"),
    refundAmount: numeric("refund_amount", { precision: 14, scale: 2 }),
    refundMethod: paymentMethod("refund_method"),
    refundReference: text("refund_reference"),
    refundedAt: timestamp("refunded_at", { withTimezone: true, mode: "string" }),
    refundedBy: uuid("refunded_by"),
    notes: text(),
    createdBy: uuid("created_by"),
    createdAt: timestamp("created_at", { withTimezone: true, mode: "string" })
      .default(sql`timezone('utc'::text, now())`)
      .notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true, mode: "string" })
      .default(sql`timezone('utc'::text, now())`)
      .notNull(),
  },
  (table): PgTableExtraConfigValue[] => [
    index("reservations_customer_id_idx").using(
      "btree",
      table.customerId.asc().nullsLast().op("uuid_ops"),
    ),
    index("reservations_expires_at_idx").using(
      "btree",
      table.expiresAt.asc().nullsLast().op("timestamptz_ops"),
    ),
    uniqueIndex("reservations_one_active_per_vehicle")
      .using("btree", table.vehicleId.asc().nullsLast().op("uuid_ops"))
      .where(sql`(status = 'active'::reservation_status)`),
    index("reservations_status_idx").using("btree", table.status.asc().nullsLast().op("enum_ops")),
    index("reservations_vehicle_id_idx").using(
      "btree",
      table.vehicleId.asc().nullsLast().op("uuid_ops"),
    ),
    index("reservations_salesperson_id_idx").using(
      "btree",
      table.salespersonId.asc().nullsLast().op("uuid_ops"),
    ),
    index("reservations_branch_id_idx").using(
      "btree",
      table.branchId.asc().nullsLast().op("uuid_ops"),
    ),
    index("reservations_reserved_at_idx").using(
      "btree",
      table.reservedAt.desc().nullsFirst().op("timestamptz_ops"),
    ),
    index("reservations_status_reserved_at_idx").using(
      "btree",
      table.status.asc().nullsLast().op("enum_ops"),
      table.reservedAt.asc().nullsLast().op("timestamptz_ops"),
    ),
    foreignKey({
      columns: [table.branchId],
      foreignColumns: [branches.id],
      name: "reservations_branch_id_fkey",
    }),
    foreignKey({
      columns: [table.createdBy],
      foreignColumns: [profiles.id],
      name: "reservations_created_by_fkey",
    }).onDelete("set null"),
    foreignKey({
      columns: [table.customerId],
      foreignColumns: [customers.id],
      name: "reservations_customer_id_fkey",
    }).onDelete("restrict"),
    foreignKey({
      columns: [table.salespersonId],
      foreignColumns: [profiles.id],
      name: "reservations_salesperson_id_fkey",
    }).onDelete("set null"),
    foreignKey({
      columns: [table.cancellationHoldRequestedBy],
      foreignColumns: [profiles.id],
      name: "reservations_cancellation_hold_requested_by_fkey",
    }).onDelete("set null"),
    foreignKey({
      columns: [table.cancellationHoldReviewedBy],
      foreignColumns: [profiles.id],
      name: "reservations_cancellation_hold_reviewed_by_fkey",
    }).onDelete("set null"),
    foreignKey({
      columns: [table.soldBy],
      foreignColumns: [profiles.id],
      name: "reservations_sold_by_fkey",
    }).onDelete("set null"),
    foreignKey({
      columns: [table.refundedBy],
      foreignColumns: [profiles.id],
      name: "reservations_refunded_by_fkey",
    }).onDelete("set null"),
    foreignKey({
      columns: [table.vehicleId],
      foreignColumns: [vehicles.id],
      name: "reservations_vehicle_id_fkey",
    }).onDelete("restrict"),
    unique("reservations_number_unique").on(table.reservationNumber),
    pgPolicy("reservations_insert", {
      as: "permissive",
      for: "insert",
      to: ["authenticated"],
      withCheck: sql`has_permission_for_branch('reservation.create'::text, branch_id)`,
    }),
    pgPolicy("reservations_select", {
      as: "permissive",
      for: "select",
      to: ["authenticated"],
      using: sql`(has_permission_for_branch('reservation.view'::text, branch_id) AND (can_view_all_bookings() OR (salesperson_id = auth.uid()) OR ((salesperson_id IS NULL) AND (created_by = auth.uid()))))`,
    }),
    pgPolicy("reservations_update", {
      as: "permissive",
      for: "update",
      to: ["authenticated"],
      using: sql`((has_permission_for_branch('reservation.create'::text, branch_id) OR has_permission_for_branch('reservation.cancel'::text, branch_id)) AND (can_view_all_bookings() OR (salesperson_id = auth.uid()) OR ((salesperson_id IS NULL) AND (created_by = auth.uid()))))`,
      withCheck: sql`(has_permission_for_branch('reservation.create'::text, branch_id) OR has_permission_for_branch('reservation.cancel'::text, branch_id))`,
    }),
    check("reservations_amount_non_negative", sql`amount >= (0)::numeric`),
    check(
      "reservations_refund_amount_valid",
      sql`(refund_amount IS NULL) OR ((refund_amount >= (0)::numeric) AND (refund_amount <= amount))`,
    ),
    check("reservations_currency_format", sql`currency ~ '^[A-Z]{3}$'::text`),
    check("reservations_expires_after_reserved", sql`expires_at > reserved_at`),
    check("reservations_units_positive", sql`(units IS NULL) OR (units > 0)`),
    check(
      "reservations_cancellation_hold_status_check",
      sql`(cancellation_hold_status IS NULL) OR (cancellation_hold_status = ANY (ARRAY['pending'::text, 'approved'::text, 'rejected'::text]))`,
    ),
    check(
      "reservations_selling_price_non_negative",
      sql`(selling_price IS NULL) OR (selling_price >= (0)::numeric)`,
    ),
    check(
      "reservations_balance_received_non_negative",
      sql`(balance_received IS NULL) OR (balance_received >= (0)::numeric)`,
    ),
  ],
).enableRLS();

export const sales = pgTable(
  "sales",
  {
    id: uuid().defaultRandom().primaryKey().notNull(),
    saleNumber: text("sale_number").notNull(),
    vehicleId: uuid("vehicle_id").notNull(),
    customerId: uuid("customer_id").notNull(),
    reservationId: uuid("reservation_id"),
    salespersonId: uuid("salesperson_id"),
    branchId: uuid("branch_id").notNull(),
    status: saleStatus().default("quotation").notNull(),
    vehiclePrice: numeric("vehicle_price", { precision: 14, scale: 2 }).notNull(),
    discountAmount: numeric("discount_amount", { precision: 14, scale: 2 }).default("0").notNull(),
    taxAmount: numeric("tax_amount", { precision: 14, scale: 2 }).default("0").notNull(),
    finalAmount: numeric("final_amount", { precision: 14, scale: 2 }).notNull(),
    currency: char({ length: 3 }).default("AED").notNull(),
    saleDate: date("sale_date"),
    deliveryDate: date("delivery_date"),
    notes: text(),
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
    index("sales_branch_id_idx").using("btree", table.branchId.asc().nullsLast().op("uuid_ops")),
    index("sales_customer_id_idx").using(
      "btree",
      table.customerId.asc().nullsLast().op("uuid_ops"),
    ),
    uniqueIndex("sales_one_open_per_vehicle")
      .using("btree", table.vehicleId.asc().nullsLast().op("uuid_ops"))
      .where(sql`(status <> 'cancelled'::sale_status)`),
    index("sales_sale_date_idx").using("btree", table.saleDate.asc().nullsLast().op("date_ops")),
    index("sales_salesperson_id_idx").using(
      "btree",
      table.salespersonId.asc().nullsLast().op("uuid_ops"),
    ),
    index("sales_status_idx").using("btree", table.status.asc().nullsLast().op("enum_ops")),
    index("sales_vehicle_id_idx").using("btree", table.vehicleId.asc().nullsLast().op("uuid_ops")),
    foreignKey({
      columns: [table.branchId],
      foreignColumns: [branches.id],
      name: "sales_branch_id_fkey",
    }),
    foreignKey({
      columns: [table.createdBy],
      foreignColumns: [profiles.id],
      name: "sales_created_by_fkey",
    }).onDelete("set null"),
    foreignKey({
      columns: [table.customerId],
      foreignColumns: [customers.id],
      name: "sales_customer_id_fkey",
    }).onDelete("restrict"),
    foreignKey({
      columns: [table.reservationId],
      foreignColumns: [reservations.id],
      name: "sales_reservation_id_fkey",
    }).onDelete("set null"),
    foreignKey({
      columns: [table.salespersonId],
      foreignColumns: [profiles.id],
      name: "sales_salesperson_id_fkey",
    }).onDelete("set null"),
    foreignKey({
      columns: [table.updatedBy],
      foreignColumns: [profiles.id],
      name: "sales_updated_by_fkey",
    }).onDelete("set null"),
    foreignKey({
      columns: [table.vehicleId],
      foreignColumns: [vehicles.id],
      name: "sales_vehicle_id_fkey",
    }).onDelete("restrict"),
    unique("sales_number_unique").on(table.saleNumber),
    pgPolicy("sales_select", {
      as: "permissive",
      for: "select",
      to: ["authenticated"],
      using: sql`(has_permission_for_branch('sale.view'::text, branch_id) OR ((salesperson_id = auth.uid()) AND has_permission('sale.view'::text)))`,
    }),
    pgPolicy("sales_insert", {
      as: "permissive",
      for: "insert",
      to: ["authenticated"],
      withCheck: sql`has_permission_for_branch('sale.create'::text, branch_id)`,
    }),
    pgPolicy("sales_update", {
      as: "permissive",
      for: "update",
      to: ["authenticated"],
      using: sql`(has_permission_for_branch('sale.edit'::text, branch_id) OR has_permission_for_branch('sale.cancel'::text, branch_id))`,
      withCheck: sql`(has_permission_for_branch('sale.edit'::text, branch_id) OR has_permission_for_branch('sale.cancel'::text, branch_id))`,
    }),
    check("sales_currency_format", sql`currency ~ '^[A-Z]{3}$'::text`),
    check("sales_discount_non_negative", sql`discount_amount >= (0)::numeric`),
    check("sales_final_amount_non_negative", sql`final_amount >= (0)::numeric`),
    check("sales_tax_non_negative", sql`tax_amount >= (0)::numeric`),
    check("sales_vehicle_price_non_negative", sql`vehicle_price >= (0)::numeric`),
  ],
).enableRLS();
