import { readFile, readdir } from "node:fs/promises";
import postgres from "postgres";

const url = process.env.TEST_DATABASE_URL;
if (!url) throw new Error("TEST_DATABASE_URL must point to an empty disposable database.");
const client = postgres(url, { max: 1 });
try {
  await client.unsafe(await readFile("scripts/database/fixture.sql", "utf8"));
  const files = (await readdir("supabase/migrations")).filter((f) => f.endsWith(".sql")).sort();
  for (const file of files) {
    console.log(`Applying ${file}`);
    await client.unsafe(await readFile(`supabase/migrations/${file}`, "utf8"));
  }
} finally {
  await client.end();
}
