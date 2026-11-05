/** identity domain. PostgreSQL names are preserved; TypeScript fields use camelCase. */
import { authUsers } from "drizzle-orm/supabase";
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
  uniqueIndex,
  integer,
  primaryKey,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { branches } from "./branches";
import { userStatus } from "./enums";

export const profiles = pgTable(
  "profiles",
  {
    id: uuid().primaryKey().notNull(),
    employeeCode: text("employee_code"),
    firstName: text("first_name").notNull(),
    lastName: text("last_name").notNull(),
    displayName: text("display_name").notNull(),
    phone: text(),
    avatarUrl: text("avatar_url"),
    branchId: uuid("branch_id"),
    status: userStatus().default("invited").notNull(),
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
    index("profiles_branch_id_idx")
      .using("btree", table.branchId.asc().nullsLast().op("uuid_ops"))
      .where(sql`(deleted_at IS NULL)`),
    foreignKey({
      columns: [table.branchId],
      foreignColumns: [branches.id],
      name: "profiles_branch_id_fkey",
    }).onDelete("set null"),
    foreignKey({
      columns: [table.deletedBy],
      foreignColumns: [table.id],
      name: "profiles_deleted_by_fkey",
    }).onDelete("set null"),
    foreignKey({
      columns: [table.id],
      foreignColumns: [authUsers.id],
      name: "profiles_id_fkey",
    }).onDelete("cascade"),
    unique("profiles_employee_code_unique").on(table.employeeCode),
    pgPolicy("profiles_select", {
      as: "permissive",
      for: "select",
      to: ["authenticated"],
      using: sql`((deleted_at IS NULL) AND ((id = auth.uid()) OR has_permission('user.manage'::text) OR is_super_admin()))`,
    }),
    pgPolicy("profiles_update_own", {
      as: "permissive",
      for: "update",
      to: ["authenticated"],
      using: sql`((id = auth.uid()) AND (deleted_at IS NULL) AND is_active_staff())`,
      withCheck: sql`((id = auth.uid()) AND (deleted_at IS NULL))`,
    }),
    pgPolicy("profiles_update_manage", {
      as: "permissive",
      for: "update",
      to: ["authenticated"],
      using: sql`(has_permission('user.manage'::text) AND (deleted_at IS NULL))`,
      withCheck: sql`has_permission('user.manage'::text)`,
    }),
    check("profiles_display_name_not_blank", sql`length(TRIM(BOTH FROM display_name)) > 0`),
    check("profiles_first_name_not_blank", sql`length(TRIM(BOTH FROM first_name)) > 0`),
    check("profiles_last_name_not_blank", sql`length(TRIM(BOTH FROM last_name)) > 0`),
  ],
).enableRLS();

export const roles = pgTable(
  "roles",
  {
    id: uuid().defaultRandom().primaryKey().notNull(),
    key: text().notNull(),
    name: text().notNull(),
    description: text(),
    isSystem: boolean("is_system").default(false).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true, mode: "string" })
      .default(sql`timezone('utc'::text, now())`)
      .notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true, mode: "string" })
      .default(sql`timezone('utc'::text, now())`)
      .notNull(),
  },
  (table): PgTableExtraConfigValue[] => [
    unique("roles_key_unique").on(table.key),
    pgPolicy("roles_select", {
      as: "permissive",
      for: "select",
      to: ["authenticated"],
      using: sql`is_active_staff()`,
    }),
    pgPolicy("roles_manage", {
      as: "permissive",
      for: "all",
      to: ["authenticated"],
      using: sql`has_permission('role.manage'::text)`,
      withCheck: sql`(has_permission('role.manage'::text) AND (is_system = false))`,
    }),
    check("roles_key_not_blank", sql`length(TRIM(BOTH FROM key)) > 0`),
    check("roles_name_not_blank", sql`length(TRIM(BOTH FROM name)) > 0`),
  ],
).enableRLS();

export const permissions = pgTable(
  "permissions",
  {
    id: uuid().defaultRandom().primaryKey().notNull(),
    key: text().notNull(),
    name: text().notNull(),
    module: text().notNull(),
    description: text(),
    createdAt: timestamp("created_at", { withTimezone: true, mode: "string" })
      .default(sql`timezone('utc'::text, now())`)
      .notNull(),
  },
  (table): PgTableExtraConfigValue[] => [
    unique("permissions_key_unique").on(table.key),
    pgPolicy("permissions_select", {
      as: "permissive",
      for: "select",
      to: ["authenticated"],
      using: sql`is_active_staff()`,
    }),
    check("permissions_key_format", sql`key ~ '^[a-z0-9]+(\\.[a-z0-9_]+)+$'::text`),
    check("permissions_module_not_blank", sql`length(TRIM(BOTH FROM module)) > 0`),
  ],
).enableRLS();

export const emailVerificationOtps = pgTable(
  "email_verification_otps",
  {
    id: uuid().defaultRandom().primaryKey().notNull(),
    userId: uuid("user_id").notNull(),
    email: text().notNull(),
    otpHash: text("otp_hash").notNull(),
    expiresAt: timestamp("expires_at", { withTimezone: true, mode: "string" }).notNull(),
    lastSentAt: timestamp("last_sent_at", { withTimezone: true, mode: "string" }).notNull(),
    verifiedAt: timestamp("verified_at", { withTimezone: true, mode: "string" }),
    attemptCount: integer("attempt_count").default(0).notNull(),
    maxAttempts: integer("max_attempts").default(5).notNull(),
    sendCount: integer("send_count").default(1).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true, mode: "string" })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true, mode: "string" })
      .defaultNow()
      .notNull(),
  },
  (table): PgTableExtraConfigValue[] => [
    index("email_verification_otps_email_idx").using(
      "btree",
      table.email.asc().nullsLast().op("text_ops"),
    ),
    foreignKey({
      columns: [table.userId],
      foreignColumns: [authUsers.id],
      name: "email_verification_otps_user_id_fkey",
    }).onDelete("cascade"),
    unique("email_verification_otps_user_id_key").on(table.userId),
    check(
      "email_verification_otps_attempts_valid",
      sql`(attempt_count >= 0) AND (max_attempts > 0)`,
    ),
  ],
).enableRLS();

export const passwordResetOtps = pgTable(
  "password_reset_otps",
  {
    id: uuid().defaultRandom().primaryKey().notNull(),
    userId: uuid("user_id").notNull(),
    email: text().notNull(),
    otpHash: text("otp_hash").notNull(),
    expiresAt: timestamp("expires_at", { withTimezone: true, mode: "string" }).notNull(),
    lastSentAt: timestamp("last_sent_at", { withTimezone: true, mode: "string" }).notNull(),
    verifiedAt: timestamp("verified_at", { withTimezone: true, mode: "string" }),
    attemptCount: integer("attempt_count").default(0).notNull(),
    maxAttempts: integer("max_attempts").default(5).notNull(),
    sendCount: integer("send_count").default(1).notNull(),
    grantHash: text("grant_hash"),
    grantExpiresAt: timestamp("grant_expires_at", { withTimezone: true, mode: "string" }),
    grantUsedAt: timestamp("grant_used_at", { withTimezone: true, mode: "string" }),
    createdAt: timestamp("created_at", { withTimezone: true, mode: "string" })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true, mode: "string" })
      .defaultNow()
      .notNull(),
  },
  (table): PgTableExtraConfigValue[] => [
    index("password_reset_otps_email_idx").using(
      "btree",
      table.email.asc().nullsLast().op("text_ops"),
    ),
    index("password_reset_otps_grant_hash_idx").using(
      "btree",
      table.grantHash.asc().nullsLast().op("text_ops"),
    ),
    foreignKey({
      columns: [table.userId],
      foreignColumns: [authUsers.id],
      name: "password_reset_otps_user_id_fkey",
    }).onDelete("cascade"),
    unique("password_reset_otps_user_id_key").on(table.userId),
    check("password_reset_otps_attempts_valid", sql`(attempt_count >= 0) AND (max_attempts > 0)`),
  ],
).enableRLS();

export const userRoles = pgTable(
  "user_roles",
  {
    id: uuid().defaultRandom().primaryKey().notNull(),
    userId: uuid("user_id").notNull(),
    roleId: uuid("role_id").notNull(),
    branchId: uuid("branch_id"),
    assignedBy: uuid("assigned_by"),
    createdAt: timestamp("created_at", { withTimezone: true, mode: "string" })
      .default(sql`timezone('utc'::text, now())`)
      .notNull(),
  },
  (table): PgTableExtraConfigValue[] => [
    uniqueIndex("user_roles_branch_unique")
      .using(
        "btree",
        table.userId.asc().nullsLast().op("uuid_ops"),
        table.roleId.asc().nullsLast().op("uuid_ops"),
        table.branchId.asc().nullsLast().op("uuid_ops"),
      )
      .where(sql`(branch_id IS NOT NULL)`),
    uniqueIndex("user_roles_global_unique")
      .using(
        "btree",
        table.userId.asc().nullsLast().op("uuid_ops"),
        table.roleId.asc().nullsLast().op("uuid_ops"),
      )
      .where(sql`(branch_id IS NULL)`),
    index("user_roles_role_id_idx").using("btree", table.roleId.asc().nullsLast().op("uuid_ops")),
    index("user_roles_user_id_idx").using("btree", table.userId.asc().nullsLast().op("uuid_ops")),
    foreignKey({
      columns: [table.assignedBy],
      foreignColumns: [profiles.id],
      name: "user_roles_assigned_by_fkey",
    }).onDelete("set null"),
    foreignKey({
      columns: [table.branchId],
      foreignColumns: [branches.id],
      name: "user_roles_branch_id_fkey",
    }).onDelete("cascade"),
    foreignKey({
      columns: [table.roleId],
      foreignColumns: [roles.id],
      name: "user_roles_role_id_fkey",
    }).onDelete("cascade"),
    foreignKey({
      columns: [table.userId],
      foreignColumns: [profiles.id],
      name: "user_roles_user_id_fkey",
    }).onDelete("cascade"),
    pgPolicy("user_roles_select", {
      as: "permissive",
      for: "select",
      to: ["authenticated"],
      using: sql`((user_id = auth.uid()) OR has_permission('user.manage'::text) OR has_permission('role.manage'::text))`,
    }),
    pgPolicy("user_roles_manage_super", {
      as: "permissive",
      for: "all",
      to: ["authenticated"],
      using: sql`is_super_admin()`,
      withCheck: sql`is_super_admin()`,
    }),
  ],
).enableRLS();

export const rolePermissions = pgTable(
  "role_permissions",
  {
    roleId: uuid("role_id").notNull(),
    permissionId: uuid("permission_id").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true, mode: "string" })
      .default(sql`timezone('utc'::text, now())`)
      .notNull(),
  },
  (table): PgTableExtraConfigValue[] => [
    foreignKey({
      columns: [table.permissionId],
      foreignColumns: [permissions.id],
      name: "role_permissions_permission_id_fkey",
    }).onDelete("cascade"),
    foreignKey({
      columns: [table.roleId],
      foreignColumns: [roles.id],
      name: "role_permissions_role_id_fkey",
    }).onDelete("cascade"),
    primaryKey({ columns: [table.roleId, table.permissionId], name: "role_permissions_pkey" }),
    pgPolicy("role_permissions_select", {
      as: "permissive",
      for: "select",
      to: ["authenticated"],
      using: sql`is_active_staff()`,
    }),
    pgPolicy("role_permissions_manage", {
      as: "permissive",
      for: "all",
      to: ["authenticated"],
      using: sql`(has_permission('role.manage'::text) AND is_super_admin())`,
      withCheck: sql`(has_permission('role.manage'::text) AND is_super_admin())`,
    }),
  ],
).enableRLS();
