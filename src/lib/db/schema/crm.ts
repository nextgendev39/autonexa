/** crm domain. PostgreSQL names are preserved; TypeScript fields use camelCase. */
import {
  type PgTableExtraConfigValue,
  pgTable,
  foreignKey,
  pgPolicy,
  check,
  uuid,
  text,
  timestamp,
  index,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { profiles } from "./identity";
import { branches } from "./branches";
import { preferredLanguage, uaeEmirate } from "./enums";

export const customers = pgTable(
  "customers",
  {
    id: uuid().defaultRandom().primaryKey().notNull(),
    customerCode: text("customer_code").notNull(),
    firstName: text("first_name").notNull(),
    lastName: text("last_name").notNull(),
    displayName: text("display_name").notNull(),
    phone: text().notNull(),
    email: text(),
    nationality: text(),
    emirate: uaeEmirate(),
    city: text(),
    address: text(),
    preferredLanguage: preferredLanguage("preferred_language").default("en").notNull(),
    branchId: uuid("branch_id"),
    notes: text(),
    createdBy: uuid("created_by"),
    deletedAt: timestamp("deleted_at", { withTimezone: true, mode: "string" }),
    deletedBy: uuid("deleted_by"),
    createdAt: timestamp("created_at", { withTimezone: true, mode: "string" })
      .default(sql`timezone('utc'::text, now())`)
      .notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true, mode: "string" })
      .default(sql`timezone('utc'::text, now())`)
      .notNull(),
  },
  (table): PgTableExtraConfigValue[] => [
    uniqueIndex("customers_code_active_unique")
      .using("btree", table.customerCode.asc().nullsLast().op("text_ops"))
      .where(sql`(deleted_at IS NULL)`),
    index("customers_display_name_trgm_idx").using(
      "gin",
      table.displayName.asc().nullsLast().op("gin_trgm_ops"),
    ),
    index("customers_email_idx")
      .using("btree", table.email.asc().nullsLast().op("text_ops"))
      .where(sql`((deleted_at IS NULL) AND (email IS NOT NULL))`),
    uniqueIndex("customers_phone_active_unique")
      .using("btree", table.phone.asc().nullsLast().op("text_ops"))
      .where(sql`(deleted_at IS NULL)`),
    index("customers_phone_trgm_idx").using(
      "gin",
      table.phone.asc().nullsLast().op("gin_trgm_ops"),
    ),
    foreignKey({
      columns: [table.branchId],
      foreignColumns: [branches.id],
      name: "customers_branch_id_fkey",
    }).onDelete("set null"),
    foreignKey({
      columns: [table.createdBy],
      foreignColumns: [profiles.id],
      name: "customers_created_by_fkey",
    }).onDelete("set null"),
    foreignKey({
      columns: [table.deletedBy],
      foreignColumns: [profiles.id],
      name: "customers_deleted_by_fkey",
    }).onDelete("set null"),
    pgPolicy("customers_select", {
      as: "permissive",
      for: "select",
      to: ["authenticated"],
      using: sql`((deleted_at IS NULL) AND has_permission_for_optional_branch('customer.view'::text, branch_id))`,
    }),
    pgPolicy("customers_insert", {
      as: "permissive",
      for: "insert",
      to: ["authenticated"],
      withCheck: sql`has_permission_for_optional_branch('customer.create'::text, branch_id)`,
    }),
    pgPolicy("customers_update", {
      as: "permissive",
      for: "update",
      to: ["authenticated"],
      using: sql`((deleted_at IS NULL) AND has_permission_for_optional_branch('customer.edit'::text, branch_id))`,
      withCheck: sql`has_permission_for_optional_branch('customer.edit'::text, branch_id)`,
    }),
    check("customers_customer_code_not_blank", sql`length(TRIM(BOTH FROM customer_code)) > 0`),
    check(
      "customers_email_format",
      sql`(email IS NULL) OR (email ~* '^[^@[:space:]]+@[^@[:space:]]+\\.[^@[:space:]]+$'::text)`,
    ),
    check("customers_first_name_not_blank", sql`length(TRIM(BOTH FROM first_name)) > 0`),
    check("customers_last_name_not_blank", sql`length(TRIM(BOTH FROM last_name)) > 0`),
    check("customers_phone_not_blank", sql`length(TRIM(BOTH FROM phone)) > 0`),
  ],
).enableRLS();
