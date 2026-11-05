import { readFile, writeFile } from "node:fs/promises";
import { getTableConfig } from "drizzle-orm/pg-core";
import { applicationTables } from "../../src/lib/db/inspect";

const tables = applicationTables();
const identity = (schema: string | undefined, name: string) => `${schema ?? "public"}_${name}`;
const lines = ["erDiagram"];
const external = new Map<string, Set<string>>();
const edges: string[] = [];
for (const table of tables) {
  const primary = new Set([
    ...table.columns.filter((c) => c.primary).map((c) => c.name),
    ...table.primaryKeys.flatMap((pk) => pk.columns.map((c) => c.name)),
  ]);
  const foreign = new Set(
    table.foreignKeys.flatMap((fk) => fk.reference().columns.map((c) => c.name)),
  );
  lines.push(`  ${identity(table.schema, table.name)} {`);
  for (const column of table.columns) {
    const keys = [
      primary.has(column.name) ? "PK" : "",
      foreign.has(column.name) ? "FK" : "",
    ].filter(Boolean);
    lines.push(
      `    ${column.getSQLType().replace(/[^a-zA-Z0-9_]/g, "_")} ${column.name}${keys.length ? ` ${keys.join(",")}` : ""} "${column.notNull ? "required" : "nullable"}"`,
    );
  }
  lines.push("  }");
  for (const fk of table.foreignKeys) {
    const ref = fk.reference();
    const target = getTableConfig(ref.foreignTable);
    const parent = identity(target.schema, target.name);
    if (target.schema && target.schema !== "public") {
      const columns = external.get(parent) ?? new Set<string>();
      for (const column of ref.foreignColumns) columns.add(column.name);
      external.set(parent, columns);
    }
    const unique =
      ref.columns.every((c) => c.primary || c.isUnique) ||
      table.uniqueConstraints.some(
        (u) =>
          u.columns.length === ref.columns.length &&
          u.columns.every((c) => ref.columns.includes(c)),
      ) ||
      table.primaryKeys.some(
        (pk) =>
          pk.columns.length === ref.columns.length &&
          pk.columns.every((c) => ref.columns.includes(c)),
      ) ||
      table.indexes.some(
        (index) =>
          index.config.unique &&
          !index.config.where &&
          index.config.columns.length === ref.columns.length &&
          index.config.columns.every(
            (c) => "name" in c && ref.columns.some((col) => col.name === c.name),
          ),
      );
    const parentCardinality = ref.columns.every((c) => c.notNull) ? "||" : "|o";
    edges.push(
      `  ${parent} ${parentCardinality}..${unique ? "o|" : "o{"} ${identity(table.schema, table.name)} : "${ref.columns.map((c) => c.name).join(", ")}"`,
    );
  }
}
for (const [name, columns] of external) {
  lines.push(
    `  ${name} {`,
    ...[...columns].map((column) => `    uuid ${column} PK "Supabase-owned"`),
    "  }",
  );
}
const diagram = [...lines, ...edges.sort()].join("\n") + "\n";
const markdown = `# Current database ERD\n\nGenerated from Drizzle definitions with \`npm run db:erd\`. ${tables.length} application tables;\nAuth references are shown as external entities. Dashed edges represent database\nforeign keys (not identifying ownership). Required/nullable refers to columns;\nrelationship cardinality follows FK nullability and unconditional uniqueness.\nFunctions, triggers, policies, and polymorphic IDs are not represented as edges.\n\n\`\`\`mermaid\n${diagram}\`\`\`\n`;
if (process.argv.includes("--check")) {
  if (
    (await readFile("docs/database-erd.md", "utf8")) !== markdown ||
    (await readFile("docs/database-erd.mmd", "utf8")) !== diagram
  ) {
    throw new Error("ERD is stale. Run npm run db:erd and commit the updated files.");
  }
} else {
  await writeFile("docs/database-erd.md", markdown);
  await writeFile("docs/database-erd.mmd", diagram);
  console.log(`Generated ERD for ${tables.length} tables and ${edges.length} foreign keys.`);
}
