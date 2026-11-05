import { loadEnvConfig } from "@next/env";
import { defineConfig } from "drizzle-kit";

loadEnvConfig(process.cwd());

export default defineConfig({
  dialect: "postgresql",
  schema: ["./src/lib/db/schema.ts", "./src/lib/db/relations.ts"],
  out: "./drizzle",
  schemaFilter: ["public"],
  dbCredentials: { url: process.env.DATABASE_MIGRATION_URL || process.env.DATABASE_URL || "" },
  introspect: { casing: "camel" },
  strict: true,
  verbose: true,
});
