# The checks. Run through run.sh, which starts the app and the stub.
S=$1; B=http://127.0.0.1:3999
get() { curl -s -o $S/out.html -w "%{http_code}" -H "Host: $1" "$B$2"; }
check() { # label expected actual
  if [ "$2" = "$3" ]; then echo "ok    $1"; else echo "FAIL  $1 (wanted $2, got $3)"; fi; }
has() { if grep -q "$2" $S/out.html; then echo "ok    $1"; else echo "FAIL  $1 (missing: $2)"; fi; }
hasnt() { if grep -q "$2" $S/out.html; then echo "FAIL  $1 (leaked: $2)"; else echo "ok    $1"; fi; }
A=shop-a.autonexa.test; X=shop-b.autonexa.test; APP=console.autonexa.test
echo "--- staff app host"
check "login page works" 200 $(get $APP /login)
check "website page is hidden" 404 $(get $APP /site)
check "internal path is hidden" 404 $(get $APP /en/site/vehicles)
check "public enquiry API is hidden" 404 $(curl -s -o /dev/null -w "%{http_code}" -H "Host: $APP" -X POST $B/api/storefront/enquiry)
echo "--- dealership home"
check "home" 200 $(get $A /)
has "own name" "Welcome to Shop Alpha"; hasnt "no other dealership" "Shop Beta"
has "brand colour" "#123456"; has "SEO title" "Shop Alpha SEO title"; has "SEO description" "Shop Alpha SEO description"
has "english ltr" 'dir="ltr"'; has "marks storefront" "data-storefront"; has "own car" "AlphaMake"; hasnt "no other car" "BetaMake"
has "public price in own currency" "AED"
for word in 77777 66666 55555 PRIVATE-NOTE PRIVATEVIN123 PRIVATECHS PRIVATEUSER minimum_selling 11111-0000; do hasnt "home hides $word" "$word"; done
echo "--- listing"
check "listing" 200 $(get $A /vehicles); has "lists car" "AlphaMake"; hasnt "other car" "BetaMake"; has "canonical" 'rel="canonical"'
for word in 77777 66666 55555 PRIVATE-NOTE PRIVATEVIN123 PRIVATECHS PRIVATEUSER; do hasnt "listing hides $word" "$word"; done
check "hostile search doesn't break it" 200 $(get $A "/vehicles?q=a%29or%281.eq.1&sort=minimum_selling_price&page=-1")
echo "--- vehicle page"
check "own car page" 200 $(get $A /vehicles/A-1); has "title" "2024 AlphaMake Camry"; has "structured data" "application/ld+json"; has "open graph" 'og:title'; has "enquiry form" "e-first"; has "booking switch on this plan" 'role="switch"'
for word in 77777 66666 55555 PRIVATE-NOTE PRIVATEVIN123 PRIVATECHS PRIVATEUSER 11111-0000; do hasnt "car page hides $word" "$word"; done
check "another dealership's car by URL" 404 $(get $A /vehicles/B-1)
check "and the reverse" 404 $(get $X /vehicles/A-1)
check "their own, on their site" 200 $(get $X /vehicles/B-1); has "their currency" "SAR"; hasnt "no booking switch on their plan" 'role="switch"'
echo "--- arabic"
check "arabic home" 200 $(get $A /ar); has "rtl" 'dir="rtl"'; has "arabic lang" 'lang="ar"'; has "arabic headline" "مرحبا بكم في Shop Alpha"
check "arabic listing" 200 $(get $A /ar/vehicles); has "arabic links" 'href="/ar/vehicles/A-1"'
echo "--- nothing else reachable on a dealership host"
for path in /login /dashboard /platform /users /settings /storefront /share/abc /api/auth/login /api/users /api/platform/tenants /api/dealership-storefront; do check "$path" 404 $(get $A $path); done
echo "--- unknown hosts and spoofing"
check "unknown subdomain" 404 $(get nobody.autonexa.test /)
check "unknown custom domain" 404 $(get cars.nobody.test /)
check "forwarded host can't pick a dealership" 404 $(curl -s -o /dev/null -w "%{http_code}" -H "Host: cars.nobody.test" -H "X-Forwarded-Host: $A" $B/)
echo "--- robots and sitemap"
check "robots" 200 $(get $A /robots.txt); has "sitemap line" "Sitemap: https://$A/sitemap.xml"
check "unknown host's robots says no" 200 $(get nobody.autonexa.test /robots.txt); has "disallow all" "Disallow: /"
check "sitemap" 200 $(get $A /sitemap.xml); has "own car" "/vehicles/A-1"; hasnt "no other car" "B-1"; has "hreflang" 'hreflang="ar"'
check "unknown host's sitemap" 404 $(get nobody.autonexa.test /sitemap.xml)
echo "--- enquiries"
post() { curl -s -o $S/out.html -w "%{http_code}" -H "Host: $A" -H "Content-Type: application/json" ${2:+-H "Origin: $2"} -X POST $B/api/storefront/enquiry -d "$1"; }
GOOD='{"kind":"enquiry","stockNumber":"A-1","firstName":"Sam","lastName":"V","phone":"+971501234567","tenant_id":"00000000-0000-4000-8000-00000000000b"}'
check "no origin" 403 $(post "$GOOD")
check "another site's origin" 403 $(post "$GOOD" "https://evil.test")
check "same origin" 200 $(post "$GOOD" "http://$A")
check "bad phone" 400 $(post '{"kind":"enquiry","firstName":"S","lastName":"V","phone":"123"}' "http://$A")
check "another dealership's car" 409 $(post '{"kind":"enquiry","stockNumber":"B-1","firstName":"S","lastName":"V","phone":"+971501234567"}' "http://$A")
check "bot gets a fake success" 200 $(post '{"kind":"enquiry","firstName":"BOT","lastName":"V","phone":"+971501234567","website":"spam"}' "http://$A")
check "booking on a plan without it" 409 $(curl -s -o /dev/null -w "%{http_code}" -H "Host: $X" -H "Origin: http://$X" -H "Content-Type: application/json" -X POST $B/api/storefront/enquiry -d '{"kind":"booking_request","stockNumber":"B-1","firstName":"S","lastName":"V","phone":"+971501234567"}')
echo "--- billing webhooks"
SECRET=whsec_smoke; CHECK=c0000000-0000-4000-8000-000000000001
stripe() { # event-json [secret] [timestamp offset] [host]
  node -e '
    const { createHmac } = require("crypto");
    const [body, secret, offset] = process.argv.slice(1);
    const t = Math.floor(Date.now() / 1000) + Number(offset);
    process.stdout.write(`t=${t},v1=${createHmac("sha256", secret).update(`${t}.${body}`).digest("hex")}`);
  ' "$1" "${2:-$SECRET}" "${3:-0}"
}
hook() { curl -s -o $S/out.html -w "%{http_code}" -H "Host: ${4:-$APP}" -H "Content-Type: application/json" -H "Stripe-Signature: $2" -X POST $B/api/billing/webhooks/${3:-stripe} -d "$1"; }
PAID='{"id":"evt_paid","livemode":false,"type":"checkout.session.completed","data":{"object":{"id":"cs_paid","client_reference_id":"'$CHECK'","payment_status":"paid"}}}'
UNPAID='{"id":"evt_unpaid","livemode":false,"type":"checkout.session.completed","data":{"object":{"id":"cs_lies","client_reference_id":"'$CHECK'","payment_status":"paid"}}}'
LIVE='{"id":"evt_live","livemode":true,"type":"checkout.session.completed","data":{"object":{"id":"cs_paid","client_reference_id":"'$CHECK'","payment_status":"paid"}}}'
FAILED='{"id":"evt_failed","livemode":false,"type":"payment_intent.payment_failed","data":{"object":{"id":"pi_1","amount":10500,"currency":"aed","metadata":{"checkout_id":"'$CHECK'"},"last_payment_error":{"code":"card_declined","payment_method":{"card":{"last4":"4242"}}}}}}'
OTHER='{"id":"evt_other","livemode":false,"type":"customer.created","data":{"object":{}}}'
check "no signature" 400 $(hook "$PAID" "")
check "another secret" 400 $(hook "$PAID" "$(stripe "$PAID" whsec_attacker)")
check "a signature for a different body" 400 $(hook "$PAID" "$(stripe "$OTHER")")
check "a replay from an hour ago" 400 $(hook "$PAID" "$(stripe "$PAID" $SECRET -3600)")
check "not JSON, correctly signed" 400 $(hook "nope" "$(stripe "nope")")
check "an unknown gateway" 404 $(hook "$PAID" "$(stripe "$PAID")" paypal)
check "on a dealership's host" 404 $(hook "$PAID" "$(stripe "$PAID")" stripe $A)
if grep -q '"applied"' $S/stub.log; then echo "FAIL  a rejected webhook applied a payment"; else echo "ok    nothing above applied a payment"; fi
check "a signed event the gateway doesn't confirm" 500 $(hook "$UNPAID" "$(stripe "$UNPAID")")
if grep -q '"applied"' $S/stub.log; then echo "FAIL  an unconfirmed event applied a payment"; else echo "ok    a signed claim of payment isn't taken at its word"; fi
check "a signed event from the other mode" 200 $(hook "$LIVE" "$(stripe "$LIVE")"); has "says why" "Wrong mode"
if grep -q '"applied"' $S/stub.log; then echo "FAIL  a live event applied in test mode"; else echo "ok    a live event changes nothing in test mode"; fi
check "a real payment" 200 $(hook "$PAID" "$(stripe "$PAID")")
if [ "$(grep -c '"applied"' $S/stub.log)" = "1" ]; then echo "ok    applied once"; else echo "FAIL  applied $(grep -c '"applied"' $S/stub.log) times"; fi
if grep '"applied"' $S/stub.log | grep -q '"p_amount_minor":10500'; then echo "ok    with the amount the gateway reported"; else echo "FAIL  wrong amount"; fi
if grep '"applied"' $S/stub.log | grep -q '"p_is_test":true'; then echo "ok    marked as test money"; else echo "FAIL  not marked as test"; fi
check "the same event again" 200 $(hook "$PAID" "$(stripe "$PAID")"); has "already done" "Already processed"
if [ "$(grep -c '"applied"' $S/stub.log)" = "1" ]; then echo "ok    still applied once"; else echo "FAIL  applied twice"; fi
check "a failed payment" 200 $(hook "$FAILED" "$(stripe "$FAILED")")
if grep '"failure"' $S/stub.log | grep -q 'card_declined'; then echo "ok    recorded with its reason"; else echo "FAIL  not recorded"; fi
if grep -q '4242' $S/stub.log; then echo "FAIL  card details got through"; else echo "ok    no card details got through"; fi
check "an event we don't act on" 200 $(hook "$OTHER" "$(stripe "$OTHER")"); has "ignored" "Ignored"
echo "--- billing, without a session"
for path in /api/billing/quote "/api/billing/invoices/c0000000-0000-4000-8000-000000000001"; do check "GET $path" 401 $(curl -s -o /dev/null -w "%{http_code}" -H "Host: $APP" "$B$path"); done
for path in /api/billing/checkout /api/billing/cancel /api/billing/schedule /api/platform/billing/refunds; do check "POST $path" $( [ "$path" = /api/platform/billing/refunds ] && echo 403 || echo 401 ) $(curl -s -o /dev/null -w "%{http_code}" -H "Host: $APP" -H "Content-Type: application/json" -X POST "$B$path" -d '{"planId":"c0000000-0000-4000-8000-000000000001","cycle":"monthly","amount":1}'); done
check "the billing page sends you to sign in" 307 $(get $APP /billing)
echo "--- first platform owner, on the existing setup page"
setup() { curl -s -o $S/out.html -w "%{http_code}" -H "Host: ${2:-$APP}" -H "Content-Type: application/json" -H "X-Forwarded-For: ${3:-10.0.0.1}" -X POST $B/api/auth/bootstrap -d "$1"; }
form() { echo '{"secret":"'$1'","firstName":"Pat","lastName":"Owner","email":"'${2:-owner@autonexa.test}'","password":"Str0ng-Passw0rd!x","confirmPassword":"Str0ng-Passw0rd!x"'${3:-}'}'; }
PLATFORM=smoke-platform-secret-012345; DEALER=smoke-dealership-secret-0123
check "the page" 200 $(get $APP /setup/super-admin); has "its form" 'name="secret"'
check "not on a dealership's host" 404 $(get $A /setup/super-admin)
check "nor its API" 404 $(setup "$(form $PLATFORM)" $A)
setup "$(form wrong-secret-wrong-secret-0)" $APP 10.0.0.2 >/dev/null; has "a wrong secret is refused" "invalidSecret"
if grep -q '"createdLogin"' $S/stub.log; then echo "FAIL  a wrong secret created a login"; else echo "ok    a wrong secret created no login"; fi
setup "$(form $DEALER dealer@example.test)" $APP 10.0.0.7 >/dev/null
if grep -q '"ownerClaimed"' $S/stub.log; then echo "FAIL  the dealership secret made a platform owner"; else echo "ok    the dealership secret makes no platform owner"; fi
setup '{"secret":"'$PLATFORM'","firstName":"P","lastName":"O","email":"o@autonexa.test","password":"short","confirmPassword":"short"}' $APP 10.0.0.3 >/dev/null; has "a weak password is refused" '"status":"error"'
if grep -q '"ownerClaimed"' $S/stub.log; then echo "FAIL  a weak password made an owner"; else echo "ok    a weak password made no owner"; fi
setup "$(form $PLATFORM taken@example.test)" $APP 10.0.0.4 >/dev/null; has "an email in use is refused" "userExists"
if grep -q '"ownerClaimed"' $S/stub.log; then echo "FAIL  a taken email claimed ownership"; else echo "ok    and nobody became owner"; fi
setup "$(form $PLATFORM owner@autonexa.test ',"role":"support","tenant_id":"x"')" $APP 10.0.0.5 >/dev/null; has "the platform secret works" '"status":"success"'; has "and goes to sign in" '/login'
if grep -q '"ownerClaimed"' $S/stub.log; then echo "ok    ownership claimed"; else echo "FAIL  no ownership claimed"; fi
if grep '"placed"' $S/stub.log | grep -q '"tenant_id":null'; then echo "ok    the login is in no dealership"; else echo "FAIL  login left in a dealership"; fi
if grep '"createdLogin"' $S/stub.log | grep 'owner@' | grep -q '"confirmed":true'; then echo "ok    can sign in straight away"; else echo "FAIL  not confirmed"; fi
setup "$(form $PLATFORM second@autonexa.test)" $APP 10.0.0.6 >/dev/null; has "a second owner is refused" "platformExists"
if grep '"createdLogin"' $S/stub.log | grep -q 'second@'; then echo "FAIL  a second login was made"; else echo "ok    and no second login exists"; fi
