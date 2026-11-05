/** acquisitions domain. PostgreSQL names are preserved; TypeScript fields use camelCase. */
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
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { profiles } from "./identity";
import { branches } from "./branches";
import { vehicles } from "./inventory";
import { customers } from "./crm";
import {
  acquisitionDocumentStatus,
  acquisitionPaymentStatus,
  acquisitionRegistrationStatus,
  acquisitionSourceType,
  acquisitionStatus,
  uaeEmirate,
} from "./enums";

export const suppliers = pgTable(
  "suppliers",
  {
    id: uuid().defaultRandom().primaryKey().notNull(),
    name: text().notNull(),
    contactName: text("contact_name"),
    phone: text(),
    email: text(),
    emirate: uaeEmirate(),
    address: text(),
    notes: text(),
    isActive: boolean("is_active").default(true).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true, mode: "string" })
      .default(sql`timezone('utc'::text, now())`)
      .notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true, mode: "string" })
      .default(sql`timezone('utc'::text, now())`)
      .notNull(),
  },
  (): PgTableExtraConfigValue[] => [
    pgPolicy("suppliers_select", {
      as: "permissive",
      for: "select",
      to: ["authenticated"],
      using: sql`(has_permission('acquisition.view'::text) OR has_permission('vehicle.view'::text))`,
    }),
    pgPolicy("suppliers_mutate", {
      as: "permissive",
      for: "all",
      to: ["authenticated"],
      using: sql`(has_permission('acquisition.edit'::text) OR has_permission('acquisition.create'::text))`,
      withCheck: sql`(has_permission('acquisition.edit'::text) OR has_permission('acquisition.create'::text))`,
    }),
    check(
      "suppliers_email_format",
      sql`(email IS NULL) OR (email ~* '^[^@[:space:]]+@[^@[:space:]]+\\.[^@[:space:]]+$'::text)`,
    ),
    check("suppliers_name_not_blank", sql`length(TRIM(BOTH FROM name)) > 0`),
  ],
).enableRLS();

export const acquisitionStatusHistory = pgTable(
  "acquisition_status_history",
  {
    id: uuid().defaultRandom().primaryKey().notNull(),
    acquisitionId: uuid("acquisition_id").notNull(),
    oldStatus: acquisitionStatus("old_status"),
    newStatus: acquisitionStatus("new_status").notNull(),
    reason: text(),
    changedBy: uuid("changed_by"),
    createdAt: timestamp("created_at", { withTimezone: true, mode: "string" })
      .default(sql`timezone('utc'::text, now())`)
      .notNull(),
  },
  (table): PgTableExtraConfigValue[] => [
    index("acquisition_status_history_acquisition_id_idx").using(
      "btree",
      table.acquisitionId.asc().nullsLast().op("uuid_ops"),
      table.createdAt.desc().nullsFirst().op("timestamptz_ops"),
    ),
    foreignKey({
      columns: [table.acquisitionId],
      foreignColumns: [acquisitions.id],
      name: "acquisition_status_history_acquisition_id_fkey",
    }).onDelete("cascade"),
    foreignKey({
      columns: [table.changedBy],
      foreignColumns: [profiles.id],
      name: "acquisition_status_history_changed_by_fkey",
    }).onDelete("set null"),
    pgPolicy("acquisition_status_history_select", {
      as: "permissive",
      for: "select",
      to: ["authenticated"],
      using: sql`(EXISTS ( SELECT 1
   FROM acquisitions a
  WHERE ((a.id = acquisition_status_history.acquisition_id) AND has_permission_for_branch('acquisition.view'::text, a.branch_id))))`,
    }),
  ],
).enableRLS();

export const acquisitions = pgTable(
  "acquisitions",
  {
    id: uuid().defaultRandom().primaryKey().notNull(),
    vehicleId: uuid("vehicle_id").notNull(),
    supplierId: uuid("supplier_id"),
    branchId: uuid("branch_id").notNull(),
    purchaseDate: date("purchase_date"),
    purchasePrice: numeric("purchase_price", { precision: 14, scale: 2 }).default("0").notNull(),
    currency: char({ length: 3 }).default("AED").notNull(),
    status: acquisitionStatus().default("draft").notNull(),
    notes: text(),
    createdBy: uuid("created_by"),
    updatedBy: uuid("updated_by"),
    createdAt: timestamp("created_at", { withTimezone: true, mode: "string" })
      .default(sql`timezone('utc'::text, now())`)
      .notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true, mode: "string" })
      .default(sql`timezone('utc'::text, now())`)
      .notNull(),
    acquisitionNumber: text("acquisition_number").notNull(),
    sourceType: acquisitionSourceType("source_type").notNull(),
    sourceName: text("source_name"),
    sourceCompany: text("source_company"),
    sourcePhone: text("source_phone"),
    sourceEmail: text("source_email"),
    sourceReference: text("source_reference"),
    lotNumber: text("lot_number"),
    customerId: uuid("customer_id"),
    askingPrice: numeric("asking_price", { precision: 14, scale: 2 }),
    expectedArrivalDate: date("expected_arrival_date"),
    receivedDate: date("received_date"),
    paymentStatus: acquisitionPaymentStatus("payment_status").default("not_paid").notNull(),
    registrationStatus: acquisitionRegistrationStatus("registration_status")
      .default("not_started")
      .notNull(),
    documentStatus: acquisitionDocumentStatus("document_status").default("pending").notNull(),
    approvedBy: uuid("approved_by"),
    approvedAt: timestamp("approved_at", { withTimezone: true, mode: "string" }),
    approvalNote: text("approval_note"),
    rejectedBy: uuid("rejected_by"),
    rejectedAt: timestamp("rejected_at", { withTimezone: true, mode: "string" }),
    rejectionReason: text("rejection_reason"),
    cancelledAt: timestamp("cancelled_at", { withTimezone: true, mode: "string" }),
    cancelReason: text("cancel_reason"),
  },
  (table): PgTableExtraConfigValue[] => [
    uniqueIndex("acquisitions_acquisition_number_unique").using(
      "btree",
      table.acquisitionNumber.asc().nullsLast().op("text_ops"),
    ),
    index("acquisitions_branch_id_idx").using(
      "btree",
      table.branchId.asc().nullsLast().op("uuid_ops"),
    ),
    index("acquisitions_created_at_idx").using(
      "btree",
      table.createdAt.asc().nullsLast().op("timestamptz_ops"),
    ),
    index("acquisitions_customer_id_idx").using(
      "btree",
      table.customerId.asc().nullsLast().op("uuid_ops"),
    ),
    index("acquisitions_document_status_idx").using(
      "btree",
      table.documentStatus.asc().nullsLast().op("enum_ops"),
    ),
    uniqueIndex("acquisitions_one_active_per_vehicle")
      .using("btree", table.vehicleId.asc().nullsLast().op("uuid_ops"))
      .where(
        sql`(status <> ALL (ARRAY['cancelled'::acquisition_status, 'rejected'::acquisition_status]))`,
      ),
    index("acquisitions_payment_status_idx").using(
      "btree",
      table.paymentStatus.asc().nullsLast().op("enum_ops"),
    ),
    index("acquisitions_purchase_date_idx").using(
      "btree",
      table.purchaseDate.asc().nullsLast().op("date_ops"),
    ),
    index("acquisitions_source_type_idx").using(
      "btree",
      table.sourceType.asc().nullsLast().op("enum_ops"),
    ),
    index("acquisitions_status_idx").using("btree", table.status.asc().nullsLast().op("enum_ops")),
    index("acquisitions_supplier_id_idx").using(
      "btree",
      table.supplierId.asc().nullsLast().op("uuid_ops"),
    ),
    index("acquisitions_vehicle_id_idx").using(
      "btree",
      table.vehicleId.asc().nullsLast().op("uuid_ops"),
    ),
    foreignKey({
      columns: [table.approvedBy],
      foreignColumns: [profiles.id],
      name: "acquisitions_approved_by_fkey",
    }).onDelete("set null"),
    foreignKey({
      columns: [table.branchId],
      foreignColumns: [branches.id],
      name: "acquisitions_branch_id_fkey",
    }),
    foreignKey({
      columns: [table.createdBy],
      foreignColumns: [profiles.id],
      name: "acquisitions_created_by_fkey",
    }).onDelete("set null"),
    foreignKey({
      columns: [table.customerId],
      foreignColumns: [customers.id],
      name: "acquisitions_customer_id_fkey",
    }).onDelete("set null"),
    foreignKey({
      columns: [table.rejectedBy],
      foreignColumns: [profiles.id],
      name: "acquisitions_rejected_by_fkey",
    }).onDelete("set null"),
    foreignKey({
      columns: [table.supplierId],
      foreignColumns: [suppliers.id],
      name: "acquisitions_supplier_id_fkey",
    }).onDelete("set null"),
    foreignKey({
      columns: [table.updatedBy],
      foreignColumns: [profiles.id],
      name: "acquisitions_updated_by_fkey",
    }).onDelete("set null"),
    foreignKey({
      columns: [table.vehicleId],
      foreignColumns: [vehicles.id],
      name: "acquisitions_vehicle_id_fkey",
    }).onDelete("restrict"),
    pgPolicy("acquisitions_select", {
      as: "permissive",
      for: "select",
      to: ["authenticated"],
      using: sql`has_permission_for_branch('acquisition.view'::text, branch_id)`,
    }),
    pgPolicy("acquisitions_insert", {
      as: "permissive",
      for: "insert",
      to: ["authenticated"],
      withCheck: sql`has_permission_for_branch('acquisition.create'::text, branch_id)`,
    }),
    pgPolicy("acquisitions_update", {
      as: "permissive",
      for: "update",
      to: ["authenticated"],
      using: sql`has_permission_for_branch('acquisition.edit'::text, branch_id)`,
      withCheck: sql`has_permission_for_branch('acquisition.edit'::text, branch_id)`,
    }),
    check(
      "acquisitions_arrival_after_purchase",
      sql`(expected_arrival_date IS NULL) OR (purchase_date IS NULL) OR (expected_arrival_date >= purchase_date)`,
    ),
    check(
      "acquisitions_asking_price_non_negative",
      sql`(asking_price IS NULL) OR (asking_price >= (0)::numeric)`,
    ),
    check("acquisitions_currency_format", sql`currency ~ '^[A-Z]{3}$'::text`),
    check("acquisitions_purchase_price_non_negative", sql`purchase_price >= (0)::numeric`),
    check(
      "acquisitions_source_email_format",
      sql`(source_email IS NULL) OR (source_email ~* '^[^@[:space:]]+@[^@[:space:]]+\\.[^@[:space:]]+$'::text)`,
    ),
  ],
).enableRLS();
