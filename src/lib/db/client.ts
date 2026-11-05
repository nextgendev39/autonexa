import "server-only";

import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { createClient } from "@/lib/supabase/server";
import { databaseSchema, withAuthenticatedTransaction, type DatabaseTransaction } from "./session";

function createDatabase() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL is required for Drizzle queries.");
  const client = postgres(url, {
    max: 5,
    prepare: false,
    idle_timeout: 20,
    connect_timeout: 10,
  });
  return drizzle(client, { schema: databaseSchema });
}

// Lazy initialization avoids opening PostgreSQL connections during Next.js builds.
const globalDatabase = globalThis as typeof globalThis & {
  autonexaDatabase?: ReturnType<typeof createDatabase>;
};
function database() {
  return (globalDatabase.autonexaDatabase ??= createDatabase());
}

export function isDrizzleConfigured() {
  return Boolean(process.env.DATABASE_URL);
}

/** All request queries execute as authenticated with cryptographically verified claims. */
export async function withUserDatabase<T>(
  operation: (tx: DatabaseTransaction) => Promise<T>,
): Promise<T> {
  const supabase = await createClient();
  const { data, error } = await supabase.auth.getClaims();
  if (error || !data?.claims || data.claims.role !== "authenticated") {
    throw new Error("An authenticated Supabase session is required.");
  }
  return withAuthenticatedTransaction(
    database(),
    { ...data.claims, sub: data.claims.sub, role: "authenticated" },
    operation,
  );
}
