import { sql } from "drizzle-orm";
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js";
import * as tables from "./schema";
import * as relations from "./relations";

export const databaseSchema = { ...tables, ...relations };
export type Database = PostgresJsDatabase<typeof databaseSchema>;
export type DatabaseTransaction = Parameters<Parameters<Database["transaction"]>[0]>[0];

/** Transaction-local context prevents identities leaking through pooled connections. */
export async function withAuthenticatedTransaction<T>(
  db: Database,
  claims: { sub: string; role: "authenticated"; [key: string]: unknown },
  operation: (tx: DatabaseTransaction) => Promise<T>,
): Promise<T> {
  return db.transaction(async (tx) => {
    await tx.execute(
      sql`select set_config('request.jwt.claims', ${JSON.stringify(claims)}, true), set_config('request.jwt.claim.sub', ${claims.sub}, true)`,
    );
    await tx.execute(sql`set local role authenticated`);
    return operation(tx);
  });
}
