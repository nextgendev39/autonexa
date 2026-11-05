/** branches domain. PostgreSQL names are preserved; TypeScript fields use camelCase. */
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
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { profiles } from "./identity";
import { branchLocationType, uaeEmirate } from "./enums";

export const branches = pgTable(
  "branches",
  {
    id: uuid().defaultRandom().primaryKey().notNull(),
    name: text().notNull(),
    code: text().notNull(),
    emirate: uaeEmirate().notNull(),
    addressLine1: text("address_line_1").notNull(),
    addressLine2: text("address_line_2"),
    city: text().notNull(),
    postalCode: text("postal_code"),
    phone: text(),
    email: text(),
    managerUserId: uuid("manager_user_id"),
    isActive: boolean("is_active").default(true).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true, mode: "string" })
      .default(sql`timezone('utc'::text, now())`)
      .notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true, mode: "string" })
      .default(sql`timezone('utc'::text, now())`)
      .notNull(),
  },
  (table): PgTableExtraConfigValue[] => [
    foreignKey({
      columns: [table.managerUserId],
      foreignColumns: [profiles.id],
      name: "branches_manager_user_id_fkey",
    }).onDelete("set null"),
    unique("branches_code_unique").on(table.code),
    pgPolicy("branches_select", {
      as: "permissive",
      for: "select",
      to: ["authenticated"],
      using: sql`(has_permission('branch.view'::text) OR can_access_branch(id))`,
    }),
    pgPolicy("branches_manage", {
      as: "permissive",
      for: "all",
      to: ["authenticated"],
      using: sql`has_permission('branch.manage'::text)`,
      withCheck: sql`has_permission('branch.manage'::text)`,
    }),
    check("branches_code_not_blank", sql`length(TRIM(BOTH FROM code)) > 0`),
    check(
      "branches_email_format",
      sql`(email IS NULL) OR (email ~* '^[^@[:space:]]+@[^@[:space:]]+\\.[^@[:space:]]+$'::text)`,
    ),
    check("branches_name_not_blank", sql`length(TRIM(BOTH FROM name)) > 0`),
  ],
).enableRLS();

export const branchLocations = pgTable(
  "branch_locations",
  {
    id: uuid().defaultRandom().primaryKey().notNull(),
    branchId: uuid("branch_id").notNull(),
    name: text().notNull(),
    locationType: branchLocationType("location_type").default("other").notNull(),
    isActive: boolean("is_active").default(true).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true, mode: "string" })
      .default(sql`timezone('utc'::text, now())`)
      .notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true, mode: "string" })
      .default(sql`timezone('utc'::text, now())`)
      .notNull(),
  },
  (table): PgTableExtraConfigValue[] => [
    index("branch_locations_branch_id_idx").using(
      "btree",
      table.branchId.asc().nullsLast().op("uuid_ops"),
    ),
    foreignKey({
      columns: [table.branchId],
      foreignColumns: [branches.id],
      name: "branch_locations_branch_id_fkey",
    }).onDelete("cascade"),
    unique("branch_locations_branch_name_unique").on(table.branchId, table.name),
    pgPolicy("branch_locations_select", {
      as: "permissive",
      for: "select",
      to: ["authenticated"],
      using: sql`(is_active_staff() AND can_access_branch(branch_id))`,
    }),
    pgPolicy("branch_locations_manage", {
      as: "permissive",
      for: "all",
      to: ["authenticated"],
      using: sql`(has_permission_for_branch('branch.manage'::text, branch_id) OR is_super_admin())`,
      withCheck: sql`(has_permission_for_branch('branch.manage'::text, branch_id) OR is_super_admin())`,
    }),
    check("branch_locations_name_not_blank", sql`length(TRIM(BOTH FROM name)) > 0`),
  ],
).enableRLS();
