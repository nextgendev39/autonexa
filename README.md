# AutoNexa

Invite-only workspace for the AutoNexa used-car showroom in the UAE. Staff track
every vehicle from acquisition through pricing and booking.

## Docs

Sales docs: [`docs/pricing.md`](docs/pricing.md) · [`docs/vehicle-ready-for-sale.md`](docs/vehicle-ready-for-sale.md) · [`docs/booking-payment-terms.md`](docs/booking-payment-terms.md) · [`docs/vehicle-catalog.md`](docs/vehicle-catalog.md)

Inventory docs: [`docs/inventory.md`](docs/inventory.md) · [`docs/vehicle-lifecycle.md`](docs/vehicle-lifecycle.md) · [`docs/vehicle-status-transitions.md`](docs/vehicle-status-transitions.md) · [`docs/inventory-permissions.md`](docs/inventory-permissions.md)

Acquisition docs: [`docs/acquisition.md`](docs/acquisition.md) · [`docs/acquisition-workflow.md`](docs/acquisition-workflow.md) · [`docs/acquisition-permissions.md`](docs/acquisition-permissions.md) · [`docs/acquisition-financials.md`](docs/acquisition-financials.md)

Inspection docs: [`docs/inspection.md`](docs/inspection.md) · [`docs/inspection-workflow.md`](docs/inspection-workflow.md) · [`docs/inspection-checklist.md`](docs/inspection-checklist.md) · [`docs/inspection-permissions.md`](docs/inspection-permissions.md)

Workshop docs: [`docs/workshop.md`](docs/workshop.md) · [`docs/workshop-workflow.md`](docs/workshop-workflow.md) · [`docs/workshop-costs.md`](docs/workshop-costs.md) · [`docs/workshop-permissions.md`](docs/workshop-permissions.md) · [`docs/workshop-quality-check.md`](docs/workshop-quality-check.md)

Security docs: [`docs/security.md`](docs/security.md) · [`docs/rbac-matrix.md`](docs/rbac-matrix.md) · [`docs/rls.md`](docs/rls.md) · [`docs/email-verification.md`](docs/email-verification.md)

## Setup

```bash
npm install
cp .env.example .env.local
npm run dev   # http://localhost:3003
```

Fill `NEXT_PUBLIC_SUPABASE_URL` and either `NEXT_PUBLIC_SUPABASE_ANON_KEY` or `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` in `.env.local`. Do not put the Supabase service-role key in any frontend variable.

Other `.env.local` values (all server-only unless prefixed `NEXT_PUBLIC_`; see `.env.example`):

| Variable                                                                                    | Needed for                                                                     |
| ------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------ |
| `SUPABASE_SERVICE_ROLE_KEY`, `BOOTSTRAP_SECRET`                                             | First Super Admin setup and staff invitations                                  |
| `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASSWORD`, `SMTP_FROM_EMAIL`, `SMTP_FROM_NAME` | Invitation and verification emails                                             |
| `EMAIL_VERIFICATION_SECRET`                                                                 | Hashing email verification codes (`openssl rand -hex 32`)                      |
| `NEXT_PUBLIC_VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT`                        | Push alerts for booking payment deadlines (`npx web-push generate-vapid-keys`) |
| `CRON_SECRET`                                                                               | Optional hourly `GET /api/cron/booking-deadlines`                              |
| `NEXT_PUBLIC_SITE_URL`                                                                      | Optional password-reset redirect origin                                        |
| `DATABASE_URL`, `DATABASE_MIGRATION_URL`                                                    | Optional Drizzle queries, schema checks, Studio                                |

## Sign-in

There is no public signup. A Super Admin invites each staff member from **Users**; the
invitee enters the 6-digit code from their email at `/verify-email`, sets a password, and
signs in at `/login`. Forgotten passwords are reset from `/forgot-password`.

## Database and Drizzle ORM

TypeScript entities and relations live under `src/lib/db/`. Supabase deploys SQL
migrations and seeds from `supabase/`. See the [Drizzle workflow](docs/database-workflow.md),
[current ERD](docs/database-erd.md), and [historical architecture](docs/database.md).

```bash
npm run db:erd
npm run db:studio
npm run db:generate -- --name=describe_schema_change
npm run db:sync
npm run db:check
npm run db:test:drizzle
```

Configure server-only `DATABASE_URL` in `.env.local` to enable the integrated
Drizzle catalog query. It must target the same Supabase project as the app's HTTP
credentials. No baseline adoption is needed; Supabase retains migration ownership.

```bash
# Local (requires Docker + Supabase CLI)
npm run db:start
npm run db:reset
npm run db:types

# Remote linked project
npx supabase login
npx supabase link --project-ref <project-ref>
npm run db:push
# then seed + regenerate types
npx supabase db query -f supabase/seed.sql
npm run db:types:linked
```

Constraint and security smoke tests (transaction rolled back):

```bash
npm run db:test:constraints
npm run db:test:security
```

Apply Phase 4 migrations with `npm run db:reset` (local) or `npm run db:push` (linked).

## Bootstrap Super Admin (dev / first install)

Hidden route (not linked in nav):

```text
http://localhost:3003/setup/super-admin
```

Requires in `.env.local` (server-only):

```bash
SUPABASE_SERVICE_ROLE_KEY=...
BOOTSTRAP_SECRET=at-least-16-chars
```

Creates the **first** Super Admin only. After one exists, the form rejects further use. Remove or empty `BOOTSTRAP_SECRET` in production to return 404. The old `/setup/bootstrap` URL redirects here.

## Scripts

- `npm run dev` — local app on port 3003
- `npm run lint` — ESLint
- `npm run typecheck` — TypeScript
- `npm test` — workflow transition, validation, and query tests
- `npm run format` — Prettier
- `npm run build` — production build
- `npm run db:*` — Supabase helpers (see package.json)

The UI is English by default. Arabic is available from the language control and switches the document to right-to-left. Currency is AED and dates use Asia/Dubai.
