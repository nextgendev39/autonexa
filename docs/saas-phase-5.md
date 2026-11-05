# SaaS Phase 5: billing and payments

Dealerships pay for their own plans through Stripe or Razorpay. **Billing is off by default.** Nothing here
has been deployed, no migration has been applied, and no real gateway has been called.

## The rules

| Rule | How it holds |
|---|---|
| Starting a checkout changes nothing | It creates an invoice and a checkout row. Only `billing_apply_payment` touches a plan. |
| A browser's word counts for nothing | The return page asks the gateway itself. Opening it by hand does nothing. |
| A signed webhook isn't enough either | After the signature passes, the server fetches the session from the gateway, and uses that amount and status. |
| What was paid must match what was owed | Amount, currency, mode and session are compared. A mismatch keeps the money on record, changes no plan, and is flagged for review. |
| Nothing happens twice | Webhook events are claimed by ID, payments are unique by gateway reference, and refunds carry our own row ID as the gateway's idempotency key. |
| Prices come from the server | A request names a plan and a cycle. Price, tax, credit and gateway are all worked out on the server. |
| No card details | Both gateways use hosted pages. Events are cut to references and amounts on arrival, and no payload is kept. |
| Secrets stay on the server | None use a `NEXT_PUBLIC_` prefix, and tests fail if client code names them. |

## Turning it on

| `BILLING_MODE` | Effect |
|---|---|
| `off` (default) | Nothing can be bought, and webhooks return 404. |
| `test` | Needs test keys. **Only dealerships in `BILLING_TEST_TENANT_SLUGS` can check out**, because test cards always succeed, so a real dealership would get a paid plan for free. |
| `live` | Needs live keys **and** `BILLING_LIVE_APPROVED=yes`. |

A mismatch, such as test keys in live mode, leaves billing off. Test money is marked as such, and never
counts in reports or dashboards.

Webhook addresses to register with each gateway:
- Stripe: `https://<app>/api/billing/webhooks/stripe`, with `checkout.session.completed`,
  `checkout.session.async_payment_succeeded`, `checkout.session.async_payment_failed`,
  `checkout.session.expired`, `payment_intent.payment_failed`, `charge.refunded`.
- Razorpay: `https://<app>/api/billing/webhooks/razorpay`, with `payment_link.paid`, `payment_link.expired`,
  `payment_link.cancelled`, `payment.failed`, `refund.processed`.

## How subscriptions behave

| Situation | Result |
|---|---|
| First purchase, or buying from a trial | Starts now, for the cycle chosen. |
| Moving up, or monthly to yearly | Starts now, with credit for unused time. If the credit covers the whole price, it's refused with a request to contact AutoNexa. |
| Moving down, or yearly to monthly | Scheduled. Nothing changes until the paid period ends and that renewal is paid. |
| Renewing | Runs on from the end of the period, so paying early loses nothing. |
| Renewal coming up | An invoice goes out 7 days ahead, and reminders at 14, 7 and 1 days. **Nobody is charged automatically.** |
| Period ends unpaid | Past due, with the plan's grace days, then expired. Records stay, and new ones pause (Phase 3). |
| Cancelling | Runs to the end of the paid period, then ends with no grace, since nothing is owed. |
| Failed payment | Recorded, alerted and emailed. The subscription carries on as it would, and they can try again. |
| Refund | Pending first, then succeeded or failed. If the gateway's answer is unknown it stays pending for a person to check. A refund doesn't end the subscription. |

Zohaan Motors has no end date and custom terms, so it gets no invoices, reminders or charges.

## Before going live

1. **Have an accountant confirm the tax setup.** VAT 5% and GST 18% are starting values. Invoices don't
   yet split GST into CGST and SGST or IGST, and don't show a SAC/HSN code, which Indian invoices need.
2. Enter your legal details per currency, and rupee prices, under Platform > Billing > Billing settings.
   Checkout refuses until they exist. Plan prices are still 0, which means "not for sale".
3. Run the full flow in test mode, on staging, with real Stripe and Razorpay test keys, against a dealership
   named in `BILLING_TEST_TENANT_SLUGS`. **This hasn't been done**: the gateway calls are written from their
   public APIs and tested against a fake.
4. Only then set live keys and `BILLING_LIVE_APPROVED=yes`.

## Rollout

Apply `00082` and `00083` after the earlier phases. Rollbacks are in `supabase/rollbacks/`, newest first.
`00082_down` refuses to run once real gateway records exist, because it would destroy the record of real money.

## Known limits

- **No automatic charging.** Renewals are an invoice and a link, because no card is stored. Recurring charges
  would use each gateway's own subscriptions, and the choice is yours.
- **Invoices are HTML, not PDF.** They download as a file and print cleanly to PDF. A real PDF needs a library,
  and that decision is yours. Emails link to the invoice, rather than attaching it.
- **Only hosted checkout.** People leave for the gateway's page and come back.
- **A suspended dealership can't pay its way back**, since it can't sign in. A person lifts a suspension.
- **Disputes and chargebacks aren't handled.** They appear only in the gateway's dashboard.
- **Other currencies** would need a migration: AED and INR are checked in the database.
- **A plan's limits aren't checked when moving down.** A dealership over its new limit keeps its records and
  can't add more, as in Phase 3.
- **New notifications and emails are English only.**

## Verifying

```sh
npm test                       # unit tests plus every database suite, on PGlite
npm run test:storefront:http   # the real app over HTTP, with a fake gateway. Replaces .next.
```
