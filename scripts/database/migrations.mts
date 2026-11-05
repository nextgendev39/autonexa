import { createHash } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";

type PublishedMigration = { tag: string; file: string; sha256: string };
const manifestPath = "drizzle/migrations.json";
export const checksum = (sql: string) => createHash("sha256").update(sql).digest("hex");

/** Generated SQL is canonical; publish reviewed edits without changing applied revisions. */
export async function verifyPublishedMigrations(sync = false) {
  const manifest = JSON.parse(await readFile(manifestPath, "utf8")) as PublishedMigration[];
  for (const entry of manifest) {
    const generated = await readFile(`drizzle/${entry.tag}.sql`, "utf8");
    const published = await readFile(entry.file, "utf8");
    if (sync) {
      // A modified deployment copy could be user work; never overwrite it silently.
      if (checksum(published) !== entry.sha256 && generated !== published)
        throw new Error(
          `${entry.file} was edited directly. Reconcile it with drizzle/${entry.tag}.sql first.`,
        );
      await writeFile(entry.file, generated);
      entry.sha256 = checksum(generated);
    } else if (generated !== published || checksum(generated) !== entry.sha256) {
      throw new Error(`${entry.tag}: migration copies differ. Review and run npm run db:sync.`);
    }
  }
  if (sync) await writeFile(manifestPath, JSON.stringify(manifest, null, 2) + "\n");
}
