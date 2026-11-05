import { verifyPublishedMigrations } from "./migrations.mjs";
await verifyPublishedMigrations(true);
console.log("Reviewed Drizzle SQL synchronized to Supabase migrations.");
