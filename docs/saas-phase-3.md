# SaaS Phase 3: platform administration

A console at `/platform` for running AutoNexa itself, separate from any dealership. Nothing here has
been deployed, and no migration has been applied.

## How it stays separate

| Rule | How it's enforced |
|---|---|
| One login is one or the other | Triggers on `platform_admins` and `tenant_members` refuse a login that would be both. The `catalog` role is the one exception, because it reaches no dealership data. |
| Platform staff can't read dealership records | They have no `current_tenant_id()`, so the Phase 2 tenant policies give them nothing. Usage is exposed only as counts, through `platform_usage()`. |
| Dealership admins can't reach the platform | Every table, function and route checks `has_platform_permission()`, which reads `platform_admins` and nothing from the request. |
| Each layer checks for itself | The page, the API route (`requirePlatformApi`), and RLS or the definer function. Tests fail if a new route or page skips its check. |
| Nothing is trusted from the browser | Roles and permissions come from `current_platform_access()`. The console's menus only hide things. |
| Service role is narrow | Only `lib/server/privileged/platform.ts`, and only for creating logins. Everything else runs on the signed-in session, so RLS applies. |

## Roles

| Permission | owner | admin | billing | support | catalog |
|---|---|---|---|---|---|
| Enter the console | yes | yes | yes | yes | no |
| View dealerships, subscriptions, plans, usage | yes | yes | yes | yes | no |
| Manage dealerships and plans | yes | yes | no | no | no |
| Manage subscriptions | yes | yes | yes | no | no |
| View billing | yes | yes | yes | no | no |
| Record invoices and payments | yes | no | yes | no | no |
| View the audit log | yes | yes | no | yes | no |
| Manage platform staff, shared roles | yes | no | no | no | no |
| Edit the vehicle catalog | yes | yes | no | no | yes |

People can't change their own access, and the last owner can't be removed.

## What changed in Phase 2 behaviour

- Rows `00074` added to `platform_admins` become the `catalog` role. Zohaan's Super Admins keep
  catalog editing, gain no console access, and no longer can change shared roles.
- Bookings of a suspended dealership are no longer auto-cancelled while it is locked out.

## How plans take effect

| Situation | Result |
|---|---|
| Feature off | Closed at the database through `has_permission*`, so RLS and definer functions both refuse, even for a Super Admin. Records stay. |
| Limit reached | Triggers refuse the addition, so no path around the app can exceed it. Existing records stay. |
| Past due | Works normally, with a notice. |
| Expired or cancelled | Existing records stay readable and editable. New cars, users, branches and files are refused. |
| Suspended | Staff are locked out and share links stop. Nothing is deleted. Only a person does this: expiry never suspends. |
| No subscription row | Not limited. Every dealership the console creates gets one. |

Expiry notices go out at 14, 7 and 1 days. A subscription goes past due when its period ends, and
expires after the plan's grace days. The sweep runs hourly from the existing deadline loop and the
cron route.

## Before going live

1. **Set plan prices and limits.** The seeded prices are 0 and the limits are placeholders.
2. **Create the first owner.** Set `PLATFORM_BOOTSTRAP_SECRET` on the server (16 characters or more, different
   from `BOOTSTRAP_SECRET`), open `/setup/super-admin`, and enter that secret with a new email no dealership uses.
   It only works once: further staff are invited under Platform staff. Clear the secret afterwards.
3. **Review `platform_admins`** for the `catalog` rows `00074` created.

## Rollout

Apply `00077`-`00079` after Phase 2's, on staging first, then run the staging API suite. Rollbacks are
in `supabase/rollbacks/`, newest first. `00078_down` discards plans, subscriptions, invoices, payments
and settings, and `00077_down` discards the platform audit log, so export them first.

## Known limits

- **Not run against a real stack.** Database rules are tested on PGlite, which has no PostgREST, Auth or
  Storage. No page has been opened in a browser. The staging API suite covers routes once it is run.
- **Billing is records only.** No payment provider, as requested. Renewals are done by hand.
- **Domains and branding are stored, not applied.** Serving a dealership from its domain, and showing
  its logo and colour in the app, aren't built.
- **Storage limits apply when a file is registered.** Browser uploads go straight to Storage first, so a
  refused photo or document can leave an orphaned file.
- **Lowering a limit doesn't remove anything.** A dealership over its new limit just can't add more.
- **Disabling Acquisitions, Pricing or Bookings is untested in the UI.** Screens that read them may show
  gaps. The seeded plans keep those on and only switch off Staff documents and Share links.
- **New notifications are English only**, via the stored-text fallback.
- **No multi-factor requirement** for platform staff. Worth adding before production: they can suspend
  any dealership.
- **Locked-out Super Admins** can't be replaced from the console while another Super Admin role exists.
  That is deliberate: it stops platform staff inviting themselves into a dealership.

## Verifying

```sh
npm test    # unit tests plus the tenant and platform suites, on disposable PGlite
```
