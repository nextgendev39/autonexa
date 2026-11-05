# Booking payment terms

Two deadlines, both counted from the booking's date and time (`reserved_at`) and set in
**Settings → Booking payment terms** as days + hours + minutes. They are stored in
`system_settings` as total minutes; users with `settings.manage` can edit them.

| Setting | Key | Default | When missed |
| --- | --- | --- | --- |
| Deposit deadline | `booking.deposit_minutes` | 4320 (3 days) | Booking cancelled, car back to Ready for sale, Super Admins alerted |
| Full payment deadline | `booking.balance_minutes` | 10080 (7 days) | Sales executive and Super Admins alerted (booking stays as is) |

Each deadline is 1 minute to 365 days, and the full payment deadline can't be shorter
than the deposit deadline. Changes apply to all open bookings, existing ones included.

## Deposit deadline

A booking can be created with a deposit of 0. If it is still 0 when the deadline passes,
`public.cancel_unpaid_bookings()`:

1. sets the booking to `cancelled`, `cancel_reason = 'Deposit not received within <deadline>'`,
   `auto_cancelled = true`;
2. moves the car from `reserved` to `ready_for_sale` (history reason `booking_deposit_not_received`);
3. creates a `booking_auto_cancelled` notification for every active Super Admin.

## Full payment deadline

"Paid in full" means deposit + balance received ≥ selling price × units. For active or
sold bookings still short when the deadline passes, `public.notify_overdue_balances()`
creates one `booking_balance_overdue` notification for the booking's sales executive
and every active Super Admin, and sets `reservations.balance_overdue_notified_at` so it
fires once per booking.

The bookings list shows "No deposit · due by …", "Full payment due by …" and, once
missed, "Full payment overdue since …".

## Where the checks run

- **pg_cron** jobs `cancel-unpaid-bookings` and `notify-overdue-balances` every 5 minutes,
  when the extension is enabled before migrations 00054/00055 run.
- **The app**: `GET /api/notifications` (polled every minute by every signed-in client)
  runs both checks at most once a minute per server instance.
- **Background loop** (`src/instrumentation.ts`): every Node server (`next dev`,
  `next start`, Docker/VPS) runs both checks and sends pushes every minute, and right when
  the next deadline passes, even with nobody signed in. Serverless hosts (e.g. Vercel)
  don't keep it running; there, schedule the cron route below every minute.
- **Settings → Run checks now** (`POST /api/settings/payment-terms/run`, `settings.manage`).
- **`GET /api/cron/booking-deadlines`** with `Authorization: Bearer $CRON_SECRET` for an
  external scheduler. Returns 404 when `CRON_SECRET` is unset.

## Alerts

- **In-app**: unread alerts show at the top of every page until dismissed or opened:
  red for auto-cancelled bookings, amber for overdue full payments. They also appear in
  the bell menu and on /notifications.
- **New, cancelled and sold bookings**: when someone creates, cancels or sells a booking
  (or sells a car directly), every active Super Admin and the booking's sales executive
  get a `booking_created` / `booking_cancelled` / `booking_sold` notification and a push
  (`src/lib/bookings/alerts.ts`). The person who acted is not notified.
- **Auto-cancelled bookings** also reach the booking's sales executive: the sweep copies
  the Super Admins' `booking_auto_cancelled` alert to them (flagged
  `data.sharedWithSalesperson` so it's copied once).
- **Push**: the app sends a web push for each new notification (`notifications.pushed_at`
  marks it sent, so rows created by pg_cron are pushed by the next app run; a failed
  delivery is retried on the next run within 24 hours). Requires
  `NEXT_PUBLIC_VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY` and `VAPID_SUBJECT`. Each user turns
  push on per device with "Turn on push alerts" (a banner on every page until enabled or
  dismissed, the bell menu, /notifications, or an alert);
  signing out removes that device's subscription. On iPhone, push needs the app added
  to the Home Screen.
