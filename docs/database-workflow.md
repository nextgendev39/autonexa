# Drizzle database workflow

Drizzle is the TypeScript schema and server-side ORM layer. **Supabase remains the
database platform and the sole migration deployment ledger.** This keeps existing
SQL functions, triggers, Auth, Storage, RLS, local resets, and deployment compatible.

## Development gains: before and after Drizzle

The previous workflow used handwritten Supabase SQL migrations and Supabase client
queries. Those queries already supported type checking through generated database
types. Drizzle adds a maintained TypeScript schema that also drives migration
generation, ORM query inference, and the ERD.

| Development task | Before: SQL migrations + Supabase client | Now: Drizzle + Supabase deployment | Practical gain |
| --- | --- | --- | --- |
| Define a new table | Handwrite columns, foreign keys, constraints, and indexes in SQL | Define a TypeScript entity and generate a SQL draft | Less repetitive structural SQL; editor assistance when defining the schema |
| Understand the current schema | Trace historical migrations or inspect PostgreSQL | Read domain entities under `src/lib/db/schema/` | A readable current definition alongside application code |
| Change an existing table | Write `ALTER TABLE` SQL and regenerate database types | Edit the entity, generate and review SQL, then apply it | Supported structural changes are drafted automatically; renames and backfills still need review |
| Type database records | Use generated Supabase types or handwritten row types | Infer select/insert types from Drizzle entities for ORM consumers | Fewer handwritten row definitions as services adopt Drizzle |
| Query related records | Use Supabase relationship-select strings and inferred/generated types | Use typed joins or relational queries backed by `relations.ts` | Relationships are navigable in the editor and reusable across ORM queries |
| Group server-side operations atomically | Typically use a PostgreSQL RPC for several Data API operations | Use an explicit Drizzle transaction for direct database operations | Convenient server-side transactions; established business-workflow RPCs remain useful |
| Maintain the ERD | Separate diagram maintenance or database introspection | Run `npm run db:erd` against the TypeScript definitions | Diagrams update from the same foreign keys used for schema generation |
| Check schema alignment | Inspect the database and use existing SQL checks | Add `db:check` and model/snapshot tests to existing checks | Detect supported metadata differences and model edits lacking a migration snapshot |
| Define authorization | Write RLS policies and grants in SQL | Keep policies with entities; review generated SQL and add grants/custom logic | Security rules are easier to find next to tables; authorization design is still explicit |
| Supply user identity | Supabase Data API establishes context from the user session | `withUserDatabase()` verifies JWT claims and sets transaction-local authenticated context | A reusable entry point for ORM queries to respect existing RLS |
| Deploy and rebuild | Supabase applies SQL through `db:push` or local migration/reset commands | Supabase applies published Drizzle SQL through the same commands | Existing migration history, fresh installs, and local resets remain compatible |
| Build forms and APIs | Write Zod validation, response contracts, handlers, and UI | Still implement those feature layers explicitly | Database types can be reused where appropriate; feature implementation is not automatic |

### Example: permits linked to documents

Assume each permit has a required `document_id` foreign key, a permit number, and
an issue date. One document can have several permits; permit access follows the
linked document's permissions. This is an example, not an implemented feature.

| Step | Before | Now |
| --- | --- | --- |
| 1. Define the entity | Create a Supabase migration and write `CREATE TABLE public.permits` | Add exported `permits = pgTable(...)` to `schema/documents.ts` |
| 2. Connect it to documents | Write the `document_id` foreign key and its index in SQL | Define the foreign key and index in the entity; add ORM navigation to `relations.ts` |
| 3. Prepare migration SQL | Manually write structural SQL, RLS, and grants | Run `npm run db:generate -- --name=add_permits`; review the draft, complete grants/custom SQL, then run `npm run db:sync` |
| 4. Apply the change | Run local migration up or `db:push` for hosted development | Use the same Supabase deployment command |
| 5. Query the entity | Regenerate Supabase types, then query `.from("permits")` | Use `withUserDatabase()` and inferred Drizzle types; regenerate Supabase types too if Supabase queries use the table |
| 6. Document and verify | Update diagrams separately and run relevant checks | Run `db:erd`, `db:check`, `db:test:drizzle`, and feature/security checks |
| 7. Add an expiry date later | Write `ALTER TABLE`, regenerate types, and update documentation | Add `expiresOn` to the entity, generate/review/apply SQL, and regenerate the ERD; ORM query types follow the definition |

**The gain is consistency and maintainability, not a guaranteed reduction in every
feature's line count.** This setup also adds schema/snapshot maintenance and a SQL
synchronization step. Benefits grow as entities evolve and services use Drizzle.
Currently, all tables are mapped, but only catalog make listing is integrated with
runtime ORM queries. There is no automatic performance improvement, UI generation,
or replacement for Supabase-generated types in services that still use its client.
Linking permits to document rows would not itself change Storage upload policies.

## Layout

| Location                       | Purpose                                                                                             |
| ------------------------------ | --------------------------------------------------------------------------------------------------- |
| `src/lib/db/schema/*.ts`       | 49 application entities grouped by domain; enums, sequences, constraints, indexes, and RLS policies |
| `src/lib/db/schema.ts`         | Exported schema used by Drizzle Kit and consumers                                                   |
| `src/lib/db/relations.ts`      | ORM navigation relationships, including named alternatives to the same table                        |
| `src/lib/db/client.ts`         | Lazy, pooled, server-only client and verified user-session wrapper                                  |
| `src/lib/db/session.ts`        | Transaction-local authenticated PostgreSQL context                                                  |
| `drizzle/meta/`                | Generation snapshots and journal; commit alongside schema changes                                   |
| `drizzle/*.sql`                | Generated drafts; review and synchronize to Supabase before applying                                |
| `drizzle/migrations.json`      | Mapping/checksums between generated and deployment SQL                                              |
| `supabase/migrations/`         | SQL actually executed by Supabase CLI, including all historical migrations                          |
| `docs/database-erd.md`, `.mmd` | Generated Mermaid ERD with all database foreign keys                                                |

SQL identifiers retain their existing snake_case names; TypeScript fields are
camelCase. PostgreSQL `NUMERIC` values remain strings to avoid loss of financial
precision. Timestamps use string mode. JSON remains `unknown` unless explicitly
typed with `$type<T>()`. Zod validation and API response types remain separate.

Domain modules use lazy foreign-key callbacks and explicitly typed extra-config
callbacks because this database contains cyclic references. Import through
`@/lib/db/schema` and avoid accessing imported table metadata at module top level.

## Setup: existing hosted Supabase

1. Run `npm install`.
2. Confirm your project has applied Supabase migrations `00001`–`00046` (and any
   later committed migrations). Use `npx supabase migration list --linked` after
   linking the intended project.
3. Copy `.env.example` to `.env.local` if needed. Retain the app's existing Supabase
   URL and publishable/anon key. Get the PostgreSQL connection from the **same**
   project's dashboard **Connect** dialog.
4. Configure a direct or session-pooler connection:

   ```dotenv
   DATABASE_MIGRATION_URL=postgresql://USERNAME:PASSWORD@HOST:PORT/postgres?sslmode=require
   DATABASE_URL=postgresql://USERNAME:PASSWORD@HOST:PORT/postgres?sslmode=require
   ```

   Use the supplied username/host/port, which vary for direct and pooler endpoints.
   Percent-encode special characters in passwords. Prefer a session pooler when
   direct IPv6 connectivity is unavailable. Environment variables override dotenv
   values. Tooling uses Next.js environment loading, including `.env.local`.

5. Run `npm run db:check` to inspect supported schema metadata without changing it.
6. Run `npm run dev`. When `DATABASE_URL` is configured, catalog make listing uses
   Drizzle. Without it, that query continues through the existing Supabase client.

**There is no adopt/stamp step.** Supabase already tracks the historical migrations.
`drizzle/meta/0000_snapshot.json` is the verified starting point for generating
future changes. `drizzle/0000_baseline.sql` is a comments-only anchor, not a fresh
database installer. Do not run `drizzle-kit migrate`, the Drizzle runtime migrator,
or `drizzle-kit push`: deployment goes through Supabase CLI only.

The runtime login must be permitted to `SET ROLE authenticated`. Every request
query uses that restricted role and verified JWT claims, even if the connection
login is `postgres`. Prefer a dedicated runtime login permitted to assume
`authenticated` and without schema-management privileges when provisioning roles.
Keep its credentials server-only. `DATABASE_MIGRATION_URL` can use a separate
privileged login for checks/Studio. Never prefix either variable with `NEXT_PUBLIC_`.

The CLI linked project, PostgreSQL URLs, and Supabase HTTP URL are independent
settings: configure all of them to the intended environment. Setting a database
URL does not link the Supabase CLI or apply migrations.

## Setup: fresh or local database

For full local Supabase (Docker required):

```bash
npm run db:start
npm run db:reset
npm run db:types
```

Configure local Supabase HTTP credentials and its PostgreSQL connection in
`.env.local`. Local PostgreSQL is normally
`postgresql://postgres:postgres@127.0.0.1:54322/postgres`; confirm the CLI output.

For a fresh hosted project:

```bash
npx supabase login
npx supabase link --project-ref YOUR_PROJECT_REF
npm run db:push
npm run db:types:linked
```

`db:reset` rebuilds **all** committed SQL migrations and seeds. It also includes new
Drizzle-generated SQL published to `supabase/migrations`; no second baseline
adoption or reset workflow is required. It deletes local application data.

## View entities and ERD

Open [the current ERD](database-erd.md) in a Mermaid-capable Markdown viewer. The
standalone `.mmd` file can be opened in Mermaid tools for zoom/export. The complete
diagram includes 49 application tables and 130 foreign keys, so it is deliberately
large. Auth users are shown as external, Supabase-owned entities. Polymorphic IDs
without foreign keys are not shown as enforced relationships.

```bash
npm run db:erd            # Regenerate committed diagrams; no DB connection needed
npm run db:erd:check     # Fail if diagrams need regeneration
npm run db:studio         # Inspect connected database rows and relationships
```

Studio uses the configured privileged connection and can edit data; the generated
ERD only reads TypeScript metadata. `relations.ts` supports relational ORM queries;
the diagram derives edges from actual foreign keys, so it never invents unenforced
relationships from ORM navigation definitions.

## Add an entity or change an existing table

Run commands from the repository root.

1. **Start from the current database and branch.** Apply pending committed SQL to
   development using `npx supabase migration up --local` or `npm run db:push` for
   the linked development project. Run `npm run db:check` before editing models.
2. **Edit the appropriate domain module.** Add a `pgTable` or fields to an existing
   table. For a new domain module, export it in `src/lib/db/schema.ts`.
3. **Define database rules.** Include foreign keys, precision/defaults, indexes,
   CHECK constraints, and RLS policies. Use `.enableRLS()` for every new application
   table. Add navigation relationships to `relations.ts` when useful; they do not
   create database foreign keys.
4. **Generate a draft:**

   ```bash
   npm run db:generate -- --name=add_vehicle_notes
   ```

   This compares the schema with the last **committed snapshot**, not the live
   database. It creates a Drizzle revision and publishes its SQL as the next
   numbered Supabase migration. No changes are applied yet. The initial new
   deployment migration is `00047_...`.

5. **Review `drizzle/0001_....sql` and complete it.** Add custom SQL for functions,
   triggers, grants, permission-catalog entries, role mappings, and backfills.
   New tables need suitable grants as well as policies for API/ORM access. Review
   autogenerated rename/drop operations; use explicit renames to retain data.
   Adding required columns to existing rows often needs a staged backfill.
6. **Publish your reviewed edits:**

   ```bash
   npm run db:sync
   ```

   Edit the Drizzle draft as the canonical copy. Synchronization updates deployment
   SQL and its checksum. It refuses to silently overwrite an independently edited
   deployment copy. Never edit a migration already applied to shared environments;
   introduce a new revision instead.

7. **Apply and verify on development:**

   ```bash
   npx supabase migration up --local
   npm run db:check
   npm run db:erd
   npm run db:test:drizzle
   npm run typecheck
   npm run lint
   ```

   For a linked hosted development project, use `npm run db:push` instead of local
   migration up. Use `db:reset` when deliberately testing a complete fresh rebuild.

8. **Update application contracts.** Regenerate Supabase types with `db:types` or
   `db:types:linked` for the database actually migrated. Review that diff because
   the current `src/types/database.ts` includes hand-maintained definitions.
   Update services, Zod validation, API types, and forms as needed.
9. **Commit all related files:** schema/relations, Drizzle SQL/snapshots/journal,
   migration mapping, Supabase SQL, ERD, and feature code. Deploy the same SQL
   revisions to other environments using the linked Supabase CLI, then compatible
   application code. For parallel migration branches, reconcile sequential
   Supabase versions and Drizzle snapshot ancestry before merging.

For an SQL-only change, generate a custom revision:

```bash
npm run db:generate -- update_vehicle_rpc custom
# Fill the Drizzle SQL draft, then:
npm run db:sync
```

Custom revisions retain the current schema snapshot without introducing a table
change. The schema test locates the latest available snapshot.
For enum changes, review transaction boundaries when new labels are used in the
same migration. Rollbacks are explicit forward corrective migrations, not automatic
down migrations.

## Write server-side ORM queries

```ts
import { eq } from "drizzle-orm";
import { withUserDatabase } from "@/lib/db/client";
import { vehicles } from "@/lib/db/schema";

const rows = await withUserDatabase((tx) =>
  tx
    .select({ id: vehicles.id, stockNumber: vehicles.stockNumber })
    .from(vehicles)
    .where(eq(vehicles.branchId, branchId)),
);

type VehicleRow = typeof vehicles.$inferSelect;
type NewVehicle = typeof vehicles.$inferInsert;
```

Use this in Node.js server components, route handlers, or services. The client is
guarded by `server-only`; it cannot be imported into client components. It lazily
initializes a five-connection pool with prepared statements disabled for pooler
compatibility. Global reuse prevents hot reload creating duplicate pools.

`withUserDatabase` verifies JWT claims through Supabase `auth.getClaims()`, fixes
the database role to `authenticated`, and sets identity inside a transaction.
Commit and rollback restore pooled connection context. Do not use decoded,
unverified tokens or pass user-provided claims to the low-level transaction helper.
Application permission checks can still provide friendly errors, while RLS enforces
database access. RPC workflow writes continue through the existing Supabase client
so their established business logic remains active.

Catalog make listing is the first integrated query. Other existing queries remain
Supabase-based and can be migrated incrementally using this wrapper. Configuration
errors in the ORM path return an error rather than silently switching connection
targets. Supabase Auth, Storage, and browser clients remain in use.

## Verification

`db:check` is read-only. It checks table/column presence, data types, nullability,
generated status, enum labels, named FK/CHECK/unique constraints, index uniqueness
and specified operator classes, RLS flags, and policy names. It does **not** prove
default expressions, FK actions, CHECK expressions, complete index definitions,
policy expressions, grants, functions, or triggers are identical. Review migration
SQL and run the project's security/workflow tests for those concerns.

`db:test:drizzle` checks model/snapshot alignment, migration-copy checksums, and RLS
coverage offline. With `TEST_DATABASE_URL`, it also exercises actual authenticated
queries, branch isolation, invited-user denial, denied writes, relations, and pooled
identity cleanup after commit/rollback. The integration target must be a disposable
PostgreSQL/Supabase development database with the migration chain applied and a
privileged test login. It creates uniquely named fixtures and deletes them afterward.

For a standalone disposable PostgreSQL server, the test-only bootstrap is:

```bash
# Set TEST_DATABASE_URL to a completely empty disposable database first.
npx tsx scripts/database/bootstrap-verification.mts
npm run db:test:drizzle
```

Its compatibility fixture is not full Supabase and does not verify hosted Auth or
Storage services. Normal app development should use full local or hosted Supabase.
