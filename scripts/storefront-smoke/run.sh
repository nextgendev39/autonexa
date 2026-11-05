#!/usr/bin/env bash
# Runs the real app over real HTTP against a local stand-in for Supabase's API. The dummy settings
# below override .env.local, so nothing reaches a real database. The stub's car rows hold private
# columns on purpose, to catch any that reach a page. This replaces .next: rebuild before deploying.
# It stands in for the API, so it can't check RLS or PostgREST itself. The database suite does RLS.
set -uo pipefail

HERE="$(cd "$(dirname "$0")" && pwd)"
cd "$HERE/../.."
WORK="$(mktemp -d)"

export NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:54399 NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=stub-key \
  NEXT_PUBLIC_SUPABASE_ANON_KEY=stub-key SUPABASE_SERVICE_ROLE_KEY=stub-service \
  NEXT_PUBLIC_SITE_URL=http://console.autonexa.test NEXT_PUBLIC_STOREFRONT_BASE_DOMAIN=autonexa.test APP_HOSTS= \
  STOREFRONT_ANALYTICS_SALT=x EMAIL_VERIFICATION_SECRET=x BOOTSTRAP_SECRET=smoke-dealership-secret-0123 PLATFORM_BOOTSTRAP_SECRET=smoke-platform-secret-012345 SMTP_HOST= SMTP_USER= SMTP_PASSWORD= \
  NEXT_PUBLIC_VAPID_PUBLIC_KEY= VAPID_PRIVATE_KEY= \
  BILLING_MODE=test BILLING_TEST_TENANT_SLUGS=shop-a STRIPE_SECRET_KEY=sk_test_smoke STRIPE_WEBHOOK_SECRET=whsec_smoke \
  STRIPE_API_BASE=http://127.0.0.1:54399 RAZORPAY_KEY_ID= RAZORPAY_KEY_SECRET= RAZORPAY_WEBHOOK_SECRET=

npm run -s build >"$WORK/build.txt" 2>&1 || { tail -20 "$WORK/build.txt"; exit 1; }
node "$HERE/stub.mjs" "$WORK/stub.log" & STUB=$!
npx next start --port 3999 >"$WORK/next.log" 2>&1 & APP=$!
trap 'kill $APP $STUB 2>/dev/null' EXIT
for _ in $(seq 1 40); do
  curl -s -o /dev/null -H "Host: console.autonexa.test" http://127.0.0.1:3999/login && break
  sleep 0.5
done

export STUB_LOG="$WORK/stub.log"
bash "$HERE/smoke.sh" "$WORK" | tee "$WORK/results.txt"
echo
echo "$(grep -c '^ok' "$WORK/results.txt") passed, $(grep -c '^FAIL' "$WORK/results.txt") failed"
! grep -q '^FAIL' "$WORK/results.txt"
