import nextEnv from "@next/env";
import postgres from "postgres";
import { isPgEnum } from "drizzle-orm/pg-core";
import { createRequire } from "node:module";
import { applicationTables } from "../../src/lib/db/inspect";
const schema: typeof import("../../src/lib/db/schema") = createRequire(import.meta.url)(
  "../../src/lib/db/schema.ts",
);

nextEnv.loadEnvConfig(process.cwd());
const url = process.env.DATABASE_MIGRATION_URL || process.env.DATABASE_URL;
if (!url) throw new Error("Set DATABASE_MIGRATION_URL or DATABASE_URL in .env.local.");
const client = postgres(url, { max: 1, prepare: false });
try {
  const columns = await client`
    select c.relname as table_name, a.attname as name,
      format_type(a.atttypid, a.atttypmod) as type, a.attnotnull as not_null,
      a.attgenerated <> '' as generated
    from pg_attribute a join pg_class c on c.oid = a.attrelid
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and c.relkind = 'r' and a.attnum > 0 and not a.attisdropped
  `;
  const constraints = await client`
    select c.relname as table_name, conname as name, contype as type
    from pg_constraint k join pg_class c on c.oid = k.conrelid
    join pg_namespace n on n.oid = c.relnamespace where n.nspname = 'public'
  `;
  const policies =
    await client`select tablename, policyname from pg_policies where schemaname = 'public'`;
  const indexes = await client`
    select t.relname as table_name, c.relname as name, i.indisunique as is_unique,
      array_agg(opc.opcname order by x.ord) as classes
    from pg_index i join pg_class c on c.oid = i.indexrelid
    join pg_class t on t.oid = i.indrelid join pg_namespace n on n.oid = t.relnamespace
    cross join lateral unnest(i.indclass) with ordinality x(oid, ord)
    join pg_opclass opc on opc.oid = x.oid where n.nspname = 'public' group by t.relname, c.relname, i.indisunique
  `;
  const tables = await client`
    select c.relname as name, c.relrowsecurity as rls from pg_class c
    join pg_namespace n on n.oid = c.relnamespace where n.nspname = 'public' and c.relkind = 'r'
  `;
  const enums = await client`
    select t.typname as name, array_agg(e.enumlabel order by e.enumsortorder) as labels
    from pg_type t join pg_namespace n on n.oid = t.typnamespace
    join pg_enum e on e.enumtypid = t.oid where n.nspname = 'public' group by t.typname
  `;
  const errors: string[] = [];
  const normalizeType = (type: string) =>
    type
      .replaceAll(" ", "")
      .replace("timestampwithtimezone", "timestamptz")
      .replace("char(", "character(");
  for (const table of applicationTables()) {
    const actual = tables.find((row) => row.name === table.name);
    if (!actual) {
      errors.push(`Missing table ${table.name}`);
      continue;
    }
    if (actual.rls !== table.enableRLS) errors.push(`${table.name}: RLS differs`);
    const actualColumns = columns.filter((row) => row.table_name === table.name);
    if (actualColumns.length !== table.columns.length)
      errors.push(`${table.name}: column count differs`);
    for (const column of table.columns) {
      const row = actualColumns.find((c) => c.name === column.name);
      if (
        !row ||
        normalizeType(row.type) !== normalizeType(column.getSQLType()) ||
        row.not_null !== column.notNull ||
        row.generated !== Boolean(column.generated)
      ) {
        errors.push(
          `${table.name}.${column.name}: missing or different type/nullability/generated status`,
        );
      }
    }
    const names = [
      ...table.foreignKeys.map((fk) => ({ name: fk.getName(), type: "f" })),
      ...table.checks.map((check) => ({ name: check.name, type: "c" })),
      ...table.uniqueConstraints.map((unique) => ({ name: unique.name, type: "u" })),
    ];
    for (const constraint of names)
      if (
        !constraints.some(
          (row) =>
            row.table_name === table.name &&
            row.name === constraint.name &&
            row.type === constraint.type,
        )
      )
        errors.push(`${table.name}: missing constraint ${constraint.name}`);
    for (const index of table.indexes) {
      const actualIndex = indexes.find(
        (row) => row.table_name === table.name && row.name === index.config.name,
      );
      const classes = index.config.columns.map((column) =>
        "indexConfig" in column ? column.indexConfig?.opClass : undefined,
      );
      if (
        !actualIndex ||
        actualIndex.is_unique !== index.config.unique ||
        classes.some((value, i) => value && value !== actualIndex.classes[i])
      )
        errors.push(`${table.name}: missing or different index ${index.config.name}`);
    }
    const actualPolicies = policies.filter((row) => row.tablename === table.name);
    if (
      actualPolicies.length !== table.policies.length ||
      table.policies.some((p) => !actualPolicies.some((row) => row.policyname === p.name))
    )
      errors.push(`${table.name}: policy names differ`);
  }
  for (const value of Object.values(schema))
    if (isPgEnum(value)) {
      const actual = enums.find((row) => row.name === value.enumName);
      if (JSON.stringify(actual?.labels) !== JSON.stringify(value.enumValues))
        errors.push(`Enum ${value.enumName}: labels differ`);
    }
  const expectedNames = new Set(applicationTables().map((table) => table.name));
  for (const table of tables)
    if (!expectedNames.has(table.name)) errors.push(`Unmapped public table ${table.name}`);
  if (errors.length) {
    console.error(errors.join("\n"));
    process.exitCode = 1;
  } else
    console.log(
      "All application tables, column types, nullability, enum labels, constraint names, index classes, policy names, and RLS flags match.",
    );
} finally {
  await client.end();
}
