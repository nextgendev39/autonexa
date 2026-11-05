import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import test from "node:test";
import { generateDrizzleJson, generateMigration } from "drizzle-kit/api";
import { applicationTables } from "../../src/lib/db/inspect";
import * as schema from "../../src/lib/db/schema";

test("schema matches the committed migration snapshot", async () => {
  const file = (await readdir("drizzle/meta"))
    .filter((name) => name.endsWith("_snapshot.json"))
    .sort()
    .at(-1)!;
  const snapshot = JSON.parse(await readFile(`drizzle/meta/${file}`, "utf8"));
  const current = generateDrizzleJson(schema, snapshot.id);
  assert.deepEqual(
    await generateMigration(snapshot, current),
    [],
    "Generate and review a migration for model changes.",
  );
});

test("published SQL and the baseline anchor are consistent", async () => {
  const { verifyPublishedMigrations } = await import("./migrations.mjs");
  await verifyPublishedMigrations();
  const baseline = await readFile("drizzle/0000_baseline.sql", "utf8");
  assert.ok(baseline.split("\n").every((line) => !line || line.startsWith("--")));
  const tables = applicationTables();
  assert.ok(
    tables.every((table) => table.enableRLS),
    "All application tables need RLS.",
  );
  assert.ok(tables.every((table) => !table.schema || table.schema === "public"));
});
