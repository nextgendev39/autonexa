// Stands in for Supabase's API: fixtures for two dealerships, with private columns in every car row.
import { createServer } from "node:http";
import { appendFileSync, writeFileSync } from "node:fs";
const LOG = process.argv[2]; writeFileSync(LOG, "");
const T = { a: "00000000-0000-4000-8000-00000000000a", b: "00000000-0000-4000-8000-00000000000b" };
const config = (name, color) => ({ primaryColor: color, accentColor: "#ffcc00", headline: { en: `Welcome to ${name}`, ar: `مرحبا بكم في ${name}` }, tagline: { en: "Fine cars" }, about: { en: `About ${name}` }, featuredStockNumbers: [], contact: { phone: "+97140000000", email: "hi@example.test" }, social: { instagram: "https://instagram.com/x" }, seo: { title: { en: `${name} SEO title` }, description: { en: `${name} SEO description` } } });
const site = (t, name, slug, host, extra = {}) => ({ tenantId: t, name, slug, kind: "subdomain", host, config: config(name, t === T.a ? "#123456" : "#654321"), displayName: name, currency: t === T.a ? "AED" : "SAR", defaultLocale: "en", bookingEnabled: t === T.a, analyticsEnabled: true, ...extra });
const hosts = { "shop-a.autonexa.test": site(T.a, "Shop Alpha", "shop-a", "shop-a.autonexa.test"), "shop-b.autonexa.test": site(T.b, "Shop Beta", "shop-b", "shop-b.autonexa.test") };
const car = (t, stock, make) => ({ tenant_id: t, id: `${t.slice(-1)}1111111-0000-4000-8000-000000000001`, stock_number: stock, year: 2024, make, model: "Camry", variant: null, custom_variant: null, mileage: 1000, mileage_unit: "km", market_type: "used", condition: "good", status: "ready_for_sale", body_type: "sedan", transmission: "automatic", fuel_type: "petrol", drive_type: null, engine_size: null, engine_cylinders: null, seats: 5, doors: 4, exterior_color: "white", interior_color: null, origin_type: null, country_of_origin: null, quantity: 1, current_selling_price: 90000, created_at: "2026-01-01T00:00:00Z", updated_at: "2026-01-01T00:00:00Z", branches: { name: "Main branch", city: "Dubai", emirate: "dubai", phone: "+971" }, vehicle_pricing: null,
  minimum_selling_price: 77777, total_acquisition_cost: 66666, purchase_price: 55555, notes: "PRIVATE-NOTE", vin: "PRIVATEVIN123", chassis_number: "PRIVATECHS", created_by: "PRIVATEUSER" });
const webhookEvents = new Map();
let owner = null;
let userCount = 0;
const cars = [car(T.a, "A-1", "AlphaMake"), car(T.b, "B-1", "BetaMake")];
createServer((req, res) => {
  const chunks = []; req.on("data", (c) => chunks.push(c)); req.on("end", () => {
    const url = new URL(req.url, "http://x"); const body = chunks.length ? Buffer.concat(chunks).toString() : "";
    let args = {}; try { args = JSON.parse(body || "{}"); } catch {}
    const send = (status, data) => { res.writeHead(status, { "content-type": "application/json" }); res.end(data === undefined ? "" : JSON.stringify(data)); };
    const p = url.pathname;
    if (p.startsWith("/rest/v1/rpc/")) {
      const fn = p.slice(13);
      if (fn === "storefront_resolve_host") return send(200, hosts[args.p_host] ?? null);
      if (fn === "storefront_rate_limit") return send(200, !String(args.p_key).includes("LIMIT"));
      if (fn === "platform_claim_first_owner") { if (owner) return send(200, false); owner = args.p_user_id; appendFileSync(LOG, JSON.stringify({ ownerClaimed: owner }) + "\n"); return send(200, true); }
      if (fn === "billing_apply_payment") { appendFileSync(LOG, JSON.stringify({ applied: args }) + "\n"); return send(200, { result: "applied" }); }
      if (fn === "billing_record_failure") { appendFileSync(LOG, JSON.stringify({ failure: args }) + "\n"); return send(200, { result: "recorded" }); }
      if (fn === "billing_expire_checkout") { appendFileSync(LOG, JSON.stringify({ expired: args }) + "\n"); return send(200, null); }
      if (fn === "storefront_submit_enquiry") { appendFileSync(LOG, JSON.stringify({ enquiry: args }) + "\n"); return send(200, "e0000000-0000-4000-8000-000000000001"); }
      return send(200, 0);
    }
    // Billing: a fake Stripe, and just enough of the webhook table for idempotency to be real.
    if (p.startsWith("/v1/checkout/sessions/")) {
      const id = p.split("/").pop();
      appendFileSync(LOG, JSON.stringify({ gateway: "getSession", id }) + "\n");
      const paid = id === "cs_paid";
      return send(200, { id, client_reference_id: "c0000000-0000-4000-8000-000000000001", payment_status: paid ? "paid" : "unpaid", payment_intent: paid ? "pi_paid" : null, amount_total: 10500, currency: "aed", livemode: false, status: "complete" });
    }
    if (p === "/rest/v1/billing_webhook_events") {
      const key = `${url.searchParams.get("gateway")}:${url.searchParams.get("event_id")}`.replaceAll("eq.", "");
      if (req.method === "GET") return send(200, webhookEvents.has(key) ? { status: webhookEvents.get(key), attempts: 1 } : null);
      if (req.method === "POST") { webhookEvents.set(`${args.gateway}:${args.event_id}`, "received"); appendFileSync(LOG, JSON.stringify({ claimed: args.event_id }) + "\n"); return send(201); }
      if (req.method === "PATCH") { webhookEvents.set(key, args.status); appendFileSync(LOG, JSON.stringify({ finished: key, status: args.status }) + "\n"); return send(204); }
    }
    // The first platform owner: logins, profile placement and the atomic claim.
    if (p === "/auth/v1/admin/users" && req.method === "POST") {
      const id = "fa000000-0000-4000-8000-00000000000" + ++userCount;
      if (args.email === "taken@example.test") return send(422, { code: "email_exists", message: "already been registered" });
      appendFileSync(LOG, JSON.stringify({ createdLogin: args.email, confirmed: args.email_confirm, role: args.role }) + "\n");
      return send(200, { id, email: args.email, user_metadata: {}, app_metadata: {}, aud: "authenticated", created_at: "2026-01-01" });
    }
    if (p.startsWith("/auth/v1/admin/users/") && req.method === "DELETE") { appendFileSync(LOG, JSON.stringify({ deletedLogin: p.split("/").pop() }) + "\n"); return send(200, {}); }
    if (p === "/rest/v1/platform_admins") return send(200, owner ? [{ user_id: owner }] : []);
    if (p === "/rest/v1/profiles" && req.method === "PATCH") { appendFileSync(LOG, JSON.stringify({ placed: args }) + "\n"); return send(204); }
    if (p === "/rest/v1/vehicles") {
      const tenant = url.searchParams.get("tenant_id")?.replace("eq.", "");
      appendFileSync(LOG, JSON.stringify({ read: "vehicles", tenant, select: url.searchParams.get("select") }) + "\n");
      let rows = cars.filter((c) => c.tenant_id === tenant);
      const stock = url.searchParams.get("stock_number");
      if (stock?.startsWith("eq.")) rows = rows.filter((c) => c.stock_number === stock.slice(3));
      res.setHeader("content-range", `0-${rows.length}/${rows.length}`);
      if ((req.headers.accept ?? "").includes("vnd.pgrst.object")) return rows[0] ? send(200, rows[0]) : send(406, { code: "PGRST116", message: "none" });
      return send(200, rows);
    }
    if (p === "/rest/v1/storefront_events") { appendFileSync(LOG, JSON.stringify({ event: args }) + "\n"); return send(201); }
    if (p.startsWith("/storage/")) return send(200, []);
    if (p.startsWith("/rest/v1/")) return send(200, []);
    return send(200, {});
  });
}).listen(54399, "127.0.0.1");
