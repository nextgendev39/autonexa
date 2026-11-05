import { is } from "drizzle-orm";
import { getTableConfig, PgTable } from "drizzle-orm/pg-core";
import * as schema from "./schema";

/** Shared schema metadata for diagrams and read-only database checks. */
export function applicationTables() {
  return Object.values(schema)
    .flatMap((value) => (is(value, PgTable) ? [getTableConfig(value)] : []))
    .sort((a, b) => a.name.localeCompare(b.name));
}
