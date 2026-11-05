import { spawnSync } from "node:child_process";
import { readFile, readdir, writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { fileURLToPath } from "node:url";
import { verifyPublishedMigrations } from "./migrations.mjs";

type Journal = { entries: { idx: number; tag: string }[] };
const input = process.argv.slice(2);
const name =
  input.find((arg) => arg.startsWith("--name="))?.slice(7) ??
  input.find((arg) => !arg.startsWith("-")) ??
  process.env.npm_config_name;
const custom = input.includes("--custom") || input.includes("custom") || process.env.npm_config_custom === "true";
const args = [`--name=${name}`, ...(custom ? ["--custom"] : [])];
if (!name || !/^[a-z][a-z0-9_]*$/.test(name))
  throw new Error("Use --name=descriptive_snake_case_name (and optionally --custom).");
const before = JSON.parse(await readFile("drizzle/meta/_journal.json", "utf8")) as Journal;
await verifyPublishedMigrations();
const result = spawnSync(
  process.execPath,
  [
    fileURLToPath(new URL("../../node_modules/drizzle-kit/bin.cjs", import.meta.url)),
    "generate",
    ...args,
  ],
  { stdio: "inherit" },
);
if (result.status !== 0) throw new Error("Drizzle migration generation failed.");
const after = JSON.parse(await readFile("drizzle/meta/_journal.json", "utf8")) as Journal;
if (after.entries.length === before.entries.length) process.exit(0);
const migration = after.entries.at(-1)!;
const existing = (await readdir("supabase/migrations")).filter((file) =>
  /^\d+_.*\.sql$/.test(file),
);
const version = String(
  Math.max(...existing.map((file) => Number(file.split("_")[0]))) + 1,
).padStart(5, "0");
const sql = await readFile(`drizzle/${migration.tag}.sql`, "utf8");
const file = `supabase/migrations/${version}_${name}.sql`;
await writeFile(file, sql, { flag: "wx" });
const manifestPath = "drizzle/migrations.json";
const manifest = JSON.parse(await readFile(manifestPath, "utf8"));
manifest.push({ tag: migration.tag, file, sha256: createHash("sha256").update(sql).digest("hex") });
await writeFile(manifestPath, JSON.stringify(manifest, null, 2) + "\n");
console.log(
  `Review ${file}. Supabase applies this SQL; Drizzle snapshots track schema generation.`,
);
