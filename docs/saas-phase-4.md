# SaaS Phase 4: public storefronts

One shared website codebase, with each dealership's branding and cars. Nothing here has been deployed,
and no migration has been applied. Applying the migrations publishes nothing and lists no car.

## How a request finds its dealership

```
Host header -> proxy: staff app or website? -> storefront_resolve_host() -> one dealership, or 404
```

- Only the `Host` header counts. `X-Forwarded-Host` and anything in the request are ignored.
- `<slug>.<base domain>` is a subdomain. Anything else must match a custom domain that passed DNS
  verification. A name someone merely typed resolves to nothing.
- A site is online only if it's published, not switched off by the platform, the dealership is active, its
  subscription hasn't expired or been cancelled, and its plan includes the website.
- A dealership's host reaches its website pages and `/api/storefront/*`. The staff app, its API, and
  the sign-in pages return 404 there.
- With `NEXT_PUBLIC_STOREFRONT_BASE_DOMAIN` unset, none of this runs and every host is the staff app.

## What visitors can see

Public code names its columns one by one (`PUBLIC_VEHICLE_COLUMNS`) and rebuilds each record field by
field (`toPublicVehicle`). Costs, minimum prices, profit, notes, VINs, chassis numbers and internal IDs are
never read for the public. A car appears only if staff listed it and it's ready for sale or reserved, and it
leaves by itself when sold. There are no copied records: listing is a flag on the existing row.

## Enquiries and bookings

- **Enquiries** create or link a row in `customers`, the existing CRM. A known number links to that
  customer without changing them. The response is the same either way, so the form can't reveal who is a
  customer. Leads were dropped in `00063`, so `storefront_enquiries` holds what the visitor said.
- **Bookings are requests.** A visitor can't reserve a car directly, because anyone could then hold a
  dealership's stock for the whole deposit window at no cost. The server checks eligibility on the request:
  listed, ready for sale, a minimum price set, a public price at or above it, no active booking, on plan.
  Refusals don't say why, so the minimum can't be probed. Staff confirm through the existing `createBooking`,
  which re-checks everything.
- **Abuse.** Same-origin required, a honeypot, and rate limits per visitor (5 an hour) and per site (200 an
  hour), held in the database.

## Plans

| | Starter | Growth | Professional | Enterprise |
|---|---|---|---|---|
| Website | yes | yes | yes | yes |
| Analytics | no | yes | yes | yes |
| Booking requests | no | no | yes | yes |
| Custom domains | 0 | 0 | 1 | unlimited |

These are starting values, editable under Platform > Plans. Dropping a plan stops its custom domains
resolving, and the subdomain keeps working.

## Before going live

1. Set `NEXT_PUBLIC_STOREFRONT_BASE_DOMAIN`, and point `*.<base domain>` at the app with a wildcard
   certificate.
2. **Set `APP_HOSTS` first.** Once the base domain is set, any host not listed is treated as a website and
   gets a 404. That includes preview deployments, so list them, for example `*.vercel.app`.
3. Your host must pass the real `Host` header through. A reverse proxy that rewrites it breaks routing.
4. Set `STOREFRONT_ANALYTICS_SALT` and `NEXT_PUBLIC_STOREFRONT_CNAME_TARGET`.
5. If not on a platform that sets it, make sure `X-Forwarded-For` comes from your own edge. The per-site
   rate limit still holds if it doesn't.

## Rollout

Apply `00080` and `00081` after the earlier phases, on staging first. Rollbacks are in `supabase/rollbacks/`,
newest first. `00081_down` discards enquiries and analytics, while customers they created stay. `00080_down`
discards designs and listing flags, and fails while branding files remain in the bucket.

## Known limits

- **Certificates aren't issued here.** AutoNexa checks whether a domain serves a trusted certificate and
  shows the result. Issuing one needs your hosting provider, or an integration not built yet.
- **Not run against real Supabase.** See Verifying.
- **No browser test.** Pages were fetched and their HTML checked. Layout, RTL appearance, the gallery, the
  forms in a browser, and the management screen haven't been seen.
- **Disabling a feature on a plan keeps old data.** Enquiries stay after a downgrade, as they should.
- **New notifications are English only**, via the stored-text fallback.
- **A refused upload can leave an orphaned photo**, as noted in Phase 3. Branding uploads aren't counted against
  storage limits.
- **Public pages ship the app's whole text bundle**, including staff screen labels, as the share page always
  has. It holds labels only, no data, but it's more than these pages need.
- **Analytics are simple.** Totals for 30 days, and raw events have no retention limit yet.
- **The page-view count runs on render.** Link prefetching can inflate it a little.

## Verifying

```sh
npm test                       # unit tests plus the tenant, platform and storefront suites, on PGlite
npm run test:storefront:http   # the real app over HTTP, against a local stub. Replaces .next.
```

The HTTP run proves routing, isolation in the app layer, and what reaches a page. The stub stands in for
PostgREST, so only the staging API suite can prove the two work together.
