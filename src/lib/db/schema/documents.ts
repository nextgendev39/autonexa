/** documents domain. PostgreSQL names are preserved; TypeScript fields use camelCase. */
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
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { profiles } from "./identity";
import { branches } from "./branches";
import { documentStatus } from "./enums";

export const documentTypes = pgTable(
  "document_types",
  {
    id: uuid().defaultRandom().primaryKey().notNull(),
    key: text().notNull(),
    name: text().notNull(),
    description: text(),
    isActive: boolean("is_active").default(true).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true, mode: "string" })
      .default(sql`timezone('utc'::text, now())`)
      .notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true, mode: "string" })
      .default(sql`timezone('utc'::text, now())`)
      .notNull(),
    requiredForSale: boolean("required_for_sale").default(false).notNull(),
  },
  (table): PgTableExtraConfigValue[] => [
    unique("document_types_key_unique").on(table.key),
    pgPolicy("document_types_select", {
      as: "permissive",
      for: "select",
      to: ["authenticated"],
      using: sql`(has_permission('document.view'::text) OR has_permission('document.create'::text))`,
    }),
    check("document_types_name_not_blank", sql`length(TRIM(BOTH FROM name)) > 0`),
  ],
).enableRLS();

export const documents = pgTable(
  "documents",
  {
    id: uuid().defaultRandom().primaryKey().notNull(),
    documentTypeId: uuid("document_type_id").notNull(),
    entityType: text("entity_type").notNull(),
    entityId: uuid("entity_id").notNull(),
    branchId: uuid("branch_id"),
    storagePath: text("storage_path").notNull(),
    fileName: text("file_name").notNull(),
    mimeType: text("mime_type"),
    fileSize: integer("file_size"),
    status: documentStatus().default("active").notNull(),
    expiresAt: timestamp("expires_at", { withTimezone: true, mode: "string" }),
    uploadedBy: uuid("uploaded_by"),
    deletedAt: timestamp("deleted_at", { withTimezone: true, mode: "string" }),
    deletedBy: uuid("deleted_by"),
    createdAt: timestamp("created_at", { withTimezone: true, mode: "string" })
      .default(sql`timezone('utc'::text, now())`)
      .notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true, mode: "string" })
      .default(sql`timezone('utc'::text, now())`)
      .notNull(),
    title: text(),
    originalFileName: text("original_file_name"),
    referenceNumber: text("reference_number"),
    notes: text(),
  },
  (table): PgTableExtraConfigValue[] => [
    index("documents_entity_idx")
      .using(
        "btree",
        table.entityType.asc().nullsLast().op("text_ops"),
        table.entityId.asc().nullsLast().op("uuid_ops"),
      )
      .where(sql`(deleted_at IS NULL)`),
    index("documents_expires_at_idx")
      .using("btree", table.expiresAt.asc().nullsLast().op("timestamptz_ops"))
      .where(sql`((deleted_at IS NULL) AND (expires_at IS NOT NULL))`),
    foreignKey({
      columns: [table.branchId],
      foreignColumns: [branches.id],
      name: "documents_branch_id_fkey",
    }).onDelete("set null"),
    foreignKey({
      columns: [table.deletedBy],
      foreignColumns: [profiles.id],
      name: "documents_deleted_by_fkey",
    }).onDelete("set null"),
    foreignKey({
      columns: [table.documentTypeId],
      foreignColumns: [documentTypes.id],
      name: "documents_document_type_id_fkey",
    }),
    foreignKey({
      columns: [table.uploadedBy],
      foreignColumns: [profiles.id],
      name: "documents_uploaded_by_fkey",
    }).onDelete("set null"),
    pgPolicy("documents_select", {
      as: "permissive",
      for: "select",
      to: ["authenticated"],
      using: sql`((deleted_at IS NULL) AND has_permission_for_optional_branch('document.view'::text, branch_id))`,
    }),
    pgPolicy("documents_insert", {
      as: "permissive",
      for: "insert",
      to: ["authenticated"],
      withCheck: sql`has_permission_for_optional_branch('document.create'::text, branch_id)`,
    }),
    pgPolicy("documents_update", {
      as: "permissive",
      for: "update",
      to: ["authenticated"],
      using: sql`((deleted_at IS NULL) AND (has_permission_for_optional_branch('document.edit'::text, branch_id) OR has_permission_for_optional_branch('document.create'::text, branch_id)))`,
      withCheck: sql`(has_permission_for_optional_branch('document.edit'::text, branch_id) OR has_permission_for_optional_branch('document.create'::text, branch_id))`,
    }),
    check("documents_entity_type_not_blank", sql`length(TRIM(BOTH FROM entity_type)) > 0`),
    check("documents_file_size_non_negative", sql`(file_size IS NULL) OR (file_size >= 0)`),
    check("documents_storage_path_not_blank", sql`length(TRIM(BOTH FROM storage_path)) > 0`),
  ],
).enableRLS();
