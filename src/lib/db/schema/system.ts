/** system domain. PostgreSQL names are preserved; TypeScript fields use camelCase. */
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
  jsonb,
  unique,
  inet,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { profiles } from "./identity";

export const notifications = pgTable(
  "notifications",
  {
    id: uuid().defaultRandom().primaryKey().notNull(),
    userId: uuid("user_id").notNull(),
    type: text().notNull(),
    title: text().notNull(),
    message: text().notNull(),
    entityType: text("entity_type"),
    entityId: uuid("entity_id"),
    isRead: boolean("is_read").default(false).notNull(),
    readAt: timestamp("read_at", { withTimezone: true, mode: "string" }),
    createdAt: timestamp("created_at", { withTimezone: true, mode: "string" })
      .default(sql`timezone('utc'::text, now())`)
      .notNull(),
    data: jsonb().default({}).notNull(),
    pushedAt: timestamp("pushed_at", { withTimezone: true, mode: "string" }),
  },
  (table): PgTableExtraConfigValue[] => [
    index("notifications_push_pending_idx")
      .using("btree", table.createdAt.asc().nullsLast().op("timestamptz_ops"))
      .where(sql`(pushed_at IS NULL)`),
    index("notifications_user_id_idx").using(
      "btree",
      table.userId.asc().nullsLast().op("uuid_ops"),
    ),
    index("notifications_user_id_created_at_idx").using(
      "btree",
      table.userId.asc().nullsLast().op("uuid_ops"),
      table.createdAt.desc().nullsFirst().op("timestamptz_ops"),
    ),
    index("notifications_user_unread_idx")
      .using(
        "btree",
        table.userId.asc().nullsLast().op("uuid_ops"),
        table.createdAt.desc().nullsFirst().op("timestamptz_ops"),
      )
      .where(sql`(is_read = false)`),
    foreignKey({
      columns: [table.userId],
      foreignColumns: [profiles.id],
      name: "notifications_user_id_fkey",
    }).onDelete("cascade"),
    pgPolicy("notifications_select_own", {
      as: "permissive",
      for: "select",
      to: ["authenticated"],
      using: sql`((user_id = auth.uid()) AND has_permission('notification.view'::text))`,
    }),
    pgPolicy("notifications_update_own", {
      as: "permissive",
      for: "update",
      to: ["authenticated"],
      using: sql`(user_id = auth.uid())`,
      withCheck: sql`(user_id = auth.uid())`,
    }),
    pgPolicy("notifications_insert_manage", {
      as: "permissive",
      for: "insert",
      to: ["authenticated"],
      withCheck: sql`(has_permission('user.manage'::text) OR is_super_admin())`,
    }),
    check(
      "notifications_read_consistency",
      sql`((is_read = false) AND (read_at IS NULL)) OR ((is_read = true) AND (read_at IS NOT NULL))`,
    ),
    check("notifications_title_not_blank", sql`length(TRIM(BOTH FROM title)) > 0`),
    check("notifications_type_not_blank", sql`length(TRIM(BOTH FROM type)) > 0`),
  ],
).enableRLS();

export const pushSubscriptions = pgTable(
  "push_subscriptions",
  {
    id: uuid().defaultRandom().primaryKey().notNull(),
    userId: uuid("user_id").notNull(),
    endpoint: text().notNull(),
    p256dh: text().notNull(),
    auth: text().notNull(),
    userAgent: text("user_agent"),
    origin: text(),
    createdAt: timestamp("created_at", { withTimezone: true, mode: "string" })
      .default(sql`timezone('utc'::text, now())`)
      .notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true, mode: "string" })
      .default(sql`timezone('utc'::text, now())`)
      .notNull(),
  },
  (table): PgTableExtraConfigValue[] => [
    index("push_subscriptions_user_id_idx").using(
      "btree",
      table.userId.asc().nullsLast().op("uuid_ops"),
    ),
    foreignKey({
      columns: [table.userId],
      foreignColumns: [profiles.id],
      name: "push_subscriptions_user_id_fkey",
    }).onDelete("cascade"),
    unique("push_subscriptions_endpoint_unique").on(table.endpoint),
  ],
).enableRLS();

export const auditLogs = pgTable(
  "audit_logs",
  {
    id: uuid().defaultRandom().primaryKey().notNull(),
    userId: uuid("user_id"),
    action: text().notNull(),
    entityType: text("entity_type").notNull(),
    entityId: uuid("entity_id"),
    oldValues: jsonb("old_values"),
    newValues: jsonb("new_values"),
    metadata: jsonb().default({}).notNull(),
    ipAddress: inet("ip_address"),
    userAgent: text("user_agent"),
    createdAt: timestamp("created_at", { withTimezone: true, mode: "string" })
      .default(sql`timezone('utc'::text, now())`)
      .notNull(),
  },
  (table): PgTableExtraConfigValue[] => [
    index("audit_logs_created_at_idx").using(
      "btree",
      table.createdAt.desc().nullsFirst().op("timestamptz_ops"),
    ),
    index("audit_logs_entity_idx").using(
      "btree",
      table.entityType.asc().nullsLast().op("text_ops"),
      table.entityId.asc().nullsLast().op("uuid_ops"),
    ),
    index("audit_logs_user_id_idx").using("btree", table.userId.asc().nullsLast().op("uuid_ops")),
    foreignKey({
      columns: [table.userId],
      foreignColumns: [profiles.id],
      name: "audit_logs_user_id_fkey",
    }).onDelete("set null"),
    pgPolicy("audit_logs_select", {
      as: "permissive",
      for: "select",
      to: ["authenticated"],
      using: sql`has_permission('audit.view'::text)`,
    }),
    check("audit_logs_action_not_blank", sql`length(TRIM(BOTH FROM action)) > 0`),
    check("audit_logs_entity_type_not_blank", sql`length(TRIM(BOTH FROM entity_type)) > 0`),
  ],
).enableRLS();

export const systemSettings = pgTable(
  "system_settings",
  {
    key: text().primaryKey().notNull(),
    value: jsonb().default(null).notNull(),
    description: text(),
    updatedBy: uuid("updated_by"),
    createdAt: timestamp("created_at", { withTimezone: true, mode: "string" })
      .default(sql`timezone('utc'::text, now())`)
      .notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true, mode: "string" })
      .default(sql`timezone('utc'::text, now())`)
      .notNull(),
  },
  (table): PgTableExtraConfigValue[] => [
    foreignKey({
      columns: [table.updatedBy],
      foreignColumns: [profiles.id],
      name: "system_settings_updated_by_fkey",
    }).onDelete("set null"),
    pgPolicy("system_settings_select", {
      as: "permissive",
      for: "select",
      to: ["authenticated"],
      using: sql`true`,
    }),
    pgPolicy("system_settings_manage", {
      as: "permissive",
      for: "all",
      to: ["authenticated"],
      using: sql`has_permission('settings.manage'::text)`,
      withCheck: sql`has_permission('settings.manage'::text)`,
    }),
    check("system_settings_key_not_blank", sql`length(TRIM(BOTH FROM key)) > 0`),
  ],
).enableRLS();
