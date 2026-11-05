# Email verification (OTP)

AutoNexa is invite-only: a Super Admin invites a staff member, who verifies
their email with a **6-digit code**, sets a password, and lands on the dashboard.

Supabase Auth stays the source of truth for users, passwords and sessions. The
**app** owns the verification code:

1. `auth.admin.createUser({ email_confirm: false })` creates the user. It sends no
   email, so Supabase's confirmation link is never used.
2. The app generates the code with `crypto.randomInt`, stores only
   `HMAC-SHA256(EMAIL_VERIFICATION_SECRET, userId:code)` in
   `public.email_verification_otps`, and emails the code over **SMTP**
   (`src/lib/email/send-email.ts`, nodemailer).
3. The person enters it on `/verify-email` → `POST /api/auth/verify-email-otp`.
4. On a correct code the app sets `email_confirmed_at` with
   `auth.admin.updateUserById({ email_confirm: true })` and signs the person in
   server-side, then `/accept-invitation` asks for a password.

Resend: `POST /api/auth/send-verification-otp`.

## Rules (all enforced in the database)

| Rule | Where |
| --- | --- |
| 6 digits, cryptographically random | `generateOtp` |
| Raw code never stored or logged | only the HMAC is stored |
| Expires after 5 minutes | `expires_at`, checked in `record_email_verification_attempt` |
| Resend only after 60 seconds | `issue_email_verification_otp` (single atomic statement) |
| New code invalidates the old one | one row per user; hash replaced |
| 5 incorrect attempts, then locked | `attempt_count` / `max_attempts`, row-locked |
| Single use | `verified_at`, row-locked |
| Old rows cleaned up | `cleanup_email_verification_otps()` (pg_cron daily if enabled, and after each send) |

Refreshing `/verify-email` never sends a code; the countdowns come from the
database timestamps. Audit events: `EMAIL_VERIFICATION_OTP_SENT`, `_OTP_RESENT`,
`_SUCCESS`, `_FAILED`, `_EXPIRED`, `_LOCKED` (no codes, hashes or tokens).

## Setup

1. **SMTP credentials** from any provider (Gmail App Password, SES, SendGrid,
   Brevo, Postmark, Mailgun, Zoho…).
2. **Sender**: `SMTP_FROM_EMAIL` must be an address/domain your provider lets you
   send from (with Gmail, the account itself or a verified alias). For production,
   use your own domain with SPF/DKIM set up at the provider.
3. **Environment** (`.env.local`, server-only — see `.env.example`):
   `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASSWORD`, `SMTP_FROM_EMAIL`,
   `SMTP_FROM_NAME`, `EMAIL_VERIFICATION_SECRET` (`openssl rand -hex 32`).
4. **Database**: apply `supabase/migrations/00046_email_verification_otps.sql`.
5. **Supabase dashboard** (Authentication):
   - Sign In / Providers → Email → **Confirm email: on** (unconfirmed accounts
     can't sign in).
   - Sign In / Providers → **Allow new users to sign up: off**. The app is
     invite-only; leaving it on lets anyone call Supabase's public signup
     endpoint, which would send Supabase's own confirmation email.
   - Supabase's SMTP and email templates are **not** used for verification
     (password reset still uses Supabase's recovery email).
6. **Restart** `next dev` / the server.
7. **Test**: invite yourself from Users → you receive one email with a 6-digit
   code → enter it on `/verify-email` → set a password → dashboard.
