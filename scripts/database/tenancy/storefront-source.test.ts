import assert from "node:assert/strict";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, test } from "node:test";
import {
  assetUrl,
  parseStorefrontConfig,
  pick,
  readableOn,
  storefrontConfigSchema,
  visibleSections,
} from "../../../src/lib/storefront/config";
import { isPrivateAddress, verificationRecordName, verificationValue } from "../../../src/lib/storefront/domain-rules";
import {
  hostSettingsFromEnv,
  internalSitePath,
  isInternalSitePath,
  isReservedDomain,
  isStorefrontHost,
  normalizeHost,
  routeStorefrontPath,
  sitePath,
} from "../../../src/lib/storefront/host";
import { sniffImage } from "../../../src/lib/storefront/image";
import {
  NEVER_PUBLIC,
  PUBLIC_VEHICLE_COLUMNS,
  cleanTerm,
  parseListingQuery,
  publicPrice,
  toPublicVehicle,
  type PublicVehicleRow,
} from "../../../src/lib/storefront/public-vehicle";
import { enquirySchema } from "../../../src/lib/validation/storefront";
import { createDealershipSchema } from "../../../src/lib/validation/platform";

/** Pure rules behind public websites, attacked directly, and guards over the code itself. */
const OWNER = "11111111-1111-4111-8111-111111111111";
const OTHER = "22222222-2222-4222-8222-222222222222";
const settings = { baseDomain: "autonexa.app", appHosts: ["localhost", "127.0.0.1", "console.autonexa.app", "*.vercel.app"] };

describe("which site a request is for", () => {
  test("with no base domain, every host stays the staff app, so nothing changes on deploy", () => {
    const off = { baseDomain: null, appHosts: ["localhost"] };
    for (const host of ["anything.example.com", "zohaan.autonexa.app", "localhost:3003"]) {
      assert.equal(isStorefrontHost(host, off), false, host);
    }
  });

  for (const host of ["localhost", "localhost:3003", "127.0.0.1:3003", "console.autonexa.app", "CONSOLE.AUTONEXA.APP", "pr-1.vercel.app", "autonexa.app", "www.autonexa.app"]) {
    test(`${host} is the staff app`, () => assert.equal(isStorefrontHost(host, settings), false));
  }

  for (const host of ["zohaan.autonexa.app", "cars.example.com", "console.autonexa.app.evil.com", "evilautonexa.app"]) {
    test(`${host} is a website, to be checked against verified mappings`, () =>
      assert.equal(isStorefrontHost(host, settings), true));
  }

  test("a malformed host gets no website", () => {
    for (const host of [null, "", "a b.com", "evil.com/path", "evil.com\r\nX: y", "<script>", "a..b.com", "-x.com"]) {
      assert.equal(normalizeHost(host), null, String(host));
      assert.equal(isStorefrontHost(host, settings), false, String(host));
    }
  });

  test("hosts normalise, so a port or a trailing dot isn't a different site", () => {
    assert.equal(normalizeHost("Cars.Example.COM:443"), "cars.example.com");
    assert.equal(normalizeHost("cars.example.com."), "cars.example.com");
  });

  test("reads settings from the environment", () => {
    const parsed = hostSettingsFromEnv({
      NEXT_PUBLIC_STOREFRONT_BASE_DOMAIN: "AutoNexa.app",
      NEXT_PUBLIC_SITE_URL: "https://console.autonexa.app/x",
      APP_HOSTS: "staging.example.com, *.vercel.app",
    });
    assert.equal(parsed.baseDomain, "autonexa.app");
    assert.ok(parsed.appHosts.includes("console.autonexa.app"));
    assert.ok(parsed.appHosts.includes("staging.example.com"));
    assert.ok(parsed.appHosts.includes("*.vercel.app"));
    assert.equal(hostSettingsFromEnv({ NEXT_PUBLIC_SITE_URL: "not a url" }).baseDomain, null);
  });

  test("a dealership can't claim our domains", () => {
    for (const domain of ["autonexa.app", "x.autonexa.app", "console.autonexa.app", "localhost", "pr-1.vercel.app", "not a domain"]) {
      assert.equal(isReservedDomain(domain, settings), true, domain);
    }
    assert.equal(isReservedDomain("cars.example.com", settings), false);
  });

  test("reserved subdomains can't be taken as a dealership's slug", () => {
    const base = {
      name: "x", numberPrefix: "XX", planId: OWNER, status: "active", billingCycle: "monthly",
      periodEnd: null, ownerEmail: "a@example.test", ownerFirstName: "a", ownerLastName: "b",
    };
    for (const slug of ["admin", "www", "api", "app", "platform"]) {
      assert.equal(createDealershipSchema.safeParse({ ...base, slug }).success, false, slug);
    }
    assert.equal(createDealershipSchema.safeParse({ ...base, slug: "acme-motors" }).success, true);
  });
});

describe("what a dealership's host can reach", () => {
  for (const path of [
    "/login", "/dashboard", "/platform", "/platform/tenants", "/users", "/settings", "/share/abc", "/forgot-password",
    "/inventory", "/storefront", "/site", "/site/vehicles", "/en/site", "/ar/dashboard", "/vehicles/a/b", "/vehicles/../login",
  ]) {
    test(`${path} doesn't exist`, () => assert.deepEqual(routeStorefrontPath(path), { kind: "not_found" }));
  }

  for (const path of ["/api/auth/login", "/api/users", "/api/platform/tenants", "/api/vehicles", "/api/dealership-storefront", "/api", "/api/storefrontx"]) {
    test(`${path} doesn't exist`, () => assert.deepEqual(routeStorefrontPath(path), { kind: "not_found" }));
  }

  test("its own pages do, in either language", () => {
    assert.deepEqual(routeStorefrontPath("/"), { kind: "page", locale: "en", explicitLocale: false, path: "/" });
    assert.deepEqual(routeStorefrontPath("/ar/vehicles"), { kind: "page", locale: "ar", explicitLocale: true, path: "/vehicles" });
    assert.deepEqual(routeStorefrontPath("/en/contact"), { kind: "page", locale: "en", explicitLocale: true, path: "/contact" });
    assert.deepEqual(routeStorefrontPath("/vehicles/ZM-000123"), { kind: "page", locale: "en", explicitLocale: false, path: "/vehicles/ZM-000123" });
    assert.deepEqual(routeStorefrontPath("/ar"), { kind: "page", locale: "ar", explicitLocale: true, path: "/" });
  });

  test("robots, sitemap and its public API do", () => {
    assert.deepEqual(routeStorefrontPath("/robots.txt"), { kind: "api", path: "/api/storefront/robots" });
    assert.deepEqual(routeStorefrontPath("/sitemap.xml"), { kind: "api", path: "/api/storefront/sitemap" });
    assert.deepEqual(routeStorefrontPath("/api/storefront/enquiry"), { kind: "api", path: "/api/storefront/enquiry" });
  });

  test("website pages don't exist on the staff app's host", () => {
    for (const path of ["/site", "/site/vehicles", "/en/site", "/ar/site/contact", internalSitePath("en", "/"), internalSitePath("ar", "/vehicles")]) {
      assert.equal(isInternalSitePath(path), true, path);
    }
    for (const path of ["/", "/dashboard", "/sites", "/inventory/site", "/storefront"]) {
      assert.equal(isInternalSitePath(path), false, path);
    }
  });

  test("addresses carry the language", () => {
    assert.equal(sitePath("en", "/"), "/");
    assert.equal(sitePath("en", "/vehicles"), "/vehicles");
    assert.equal(sitePath("ar", "/"), "/ar");
    assert.equal(sitePath("ar", "/vehicles"), "/ar/vehicles");
    assert.equal(sitePath("en", "/vehicles", "ar"), "/en/vehicles", "English needs its prefix on an Arabic-first site");
  });
});

describe("what the public can know about a car", () => {
  const ROW = {
    id: "secret-internal-id",
    stock_number: "ZM-1",
    year: 2024,
    make: "Toyota",
    model: "Camry",
    variant: null,
    custom_variant: "SE",
    mileage: 100,
    mileage_unit: "km",
    market_type: "used",
    condition: "good",
    status: "ready_for_sale",
    body_type: "sedan",
    transmission: "automatic",
    fuel_type: "petrol",
    drive_type: null,
    engine_size: null,
    engine_cylinders: null,
    seats: 5,
    doors: 4,
    exterior_color: "white",
    interior_color: null,
    origin_type: null,
    country_of_origin: null,
    quantity: 1,
    current_selling_price: "9000",
    created_at: "2026-01-01",
    branches: { name: "Dubai", city: "Dubai", emirate: "dubai", phone: "+971" },
    vehicle_pricing: { advertised_price: "8000", target_selling_price: "7000" },
    // What must never get through, even if a query returned it by mistake.
    minimum_selling_price: 5000,
    total_acquisition_cost: 4000,
    profit: 5000,
    notes: "owes us money",
    internal_notes: "secret",
    vin: "1HGCM",
    chassis_number: "CHS",
    created_by: "someone",
  } as unknown as PublicVehicleRow;

  test("the query names nothing private", () => {
    for (const word of NEVER_PUBLIC) {
      assert.ok(!PUBLIC_VEHICLE_COLUMNS.toLowerCase().includes(word.toLowerCase()), word);
    }
  });

  test("the result is rebuilt field by field, so extra columns can't get through", () => {
    const text = JSON.stringify(toPublicVehicle(ROW)).toLowerCase();
    for (const value of ["5000", "4000", "owes us money", "secret", "1hgcm", "chs", "someone"]) {
      assert.ok(!text.includes(value), value);
    }
    for (const word of NEVER_PUBLIC) assert.ok(!text.includes(word.toLowerCase()), word);
  });

  test("the internal ID stays on the server", () => {
    assert.ok(!JSON.stringify(toPublicVehicle(ROW)).includes("secret-internal-id"));
  });

  test("the price is the selling price, then advertised, then target, and never the minimum", () => {
    assert.equal(publicPrice(ROW), 9000);
    assert.equal(publicPrice({ ...ROW, current_selling_price: null }), 8000);
    assert.equal(publicPrice({ ...ROW, current_selling_price: 0, vehicle_pricing: [{ advertised_price: null, target_selling_price: 7000 }] }), 7000);
    assert.equal(publicPrice({ ...ROW, current_selling_price: null, vehicle_pricing: null }), null);
  });

  test("only a car ready for sale counts as available", () => {
    assert.equal(toPublicVehicle(ROW).available, true);
    assert.equal(toPublicVehicle({ ...ROW, status: "reserved" }).available, false);
  });
});

describe("search terms from the URL", () => {
  test("nothing that means anything in a filter expression survives", () => {
    for (const attack of [
      "a,make.eq.x", "a)or(1.eq.1", "%", "x;drop", "a.b", 'a"b', "a*b", "minimum_selling_price.gt.0,", "(a)", "a:b", "\\",
    ]) {
      const clean = cleanTerm(attack);
      assert.doesNotMatch(clean, /[,().;:*%"\\]/, attack);
    }
  });

  test("real searches do, in either language", () => {
    assert.equal(cleanTerm("  Land   Cruiser "), "Land Cruiser");
    assert.equal(cleanTerm("تويوتا كامري"), "تويوتا كامري");
    assert.equal(cleanTerm("CX-5"), "CX-5");
  });

  test("unknown values are dropped rather than passed along", () => {
    const query = parseListingQuery({
      sort: "minimum_selling_price",
      page: "-1",
      priceMax: "abc",
      yearMin: "1e9",
      tenant_id: OTHER,
      q: ["a", "b"],
    });
    assert.equal(query.sort, "newest");
    assert.equal(query.page, 1);
    assert.equal(query.priceMax, null);
    assert.equal(query.yearMin, null);
    assert.equal(query.q, "a");
    assert.ok(!("tenant_id" in query));
  });
});

describe("a dealership's design, as stored", () => {
  const parse = (raw: unknown) => parseStorefrontConfig(raw, OWNER);

  test("junk becomes the default rather than reaching a page", () => {
    for (const raw of [null, "x", 1, [], { primaryColor: "red" }, { sections: "x" }]) {
      assert.equal(parse(raw).primaryColor, "#111827");
    }
  });

  test("a colour can't carry CSS", () => {
    for (const primaryColor of ["red;}body{display:none", "url(https://evil)", "#12345", "#12345g"]) {
      assert.equal(storefrontConfigSchema.safeParse({ primaryColor }).success, false, primaryColor);
    }
  });

  test("social links are https, and nothing else", () => {
    for (const instagram of ["javascript:alert(1)", "http://x.test", "data:text/html,x", 'https://x.test"onclick="y', "https://a b"]) {
      assert.equal(storefrontConfigSchema.safeParse({ social: { instagram } }).success, false, instagram);
    }
    assert.equal(storefrontConfigSchema.safeParse({ social: { instagram: "https://instagram.com/x" } }).success, true);
  });

  test("files must be this dealership's own, even when written straight into the database", () => {
    const own = `${OWNER}/logo-1.png`;
    assert.equal(parse({ logoPath: own }).logoPath, own);
    assert.equal(parse({ logoPath: `${OTHER}/logo-1.png` }).logoPath, null);
    assert.equal(parse({ bannerPath: `${OTHER}/b.png` }).bannerPath, null);
    for (const logoPath of [`../${OTHER}/x.png`, `${OWNER}/../${OTHER}/x.png`, "https://evil.test/x.png"]) {
      assert.equal(parse({ logoPath }).logoPath, null, logoPath);
    }
  });

  test("file addresses point only at the public branding bucket", () => {
    assert.equal(
      assetUrl(`${OWNER}/l.png`, "https://x.supabase.co/"),
      `https://x.supabase.co/storage/v1/object/public/storefront-assets/${OWNER}/l.png`,
    );
    assert.equal(assetUrl(null, "https://x.supabase.co"), null);
  });

  test("sections follow the chosen order, and off or repeated ones don't appear", () => {
    assert.deepEqual(
      visibleSections({
        sections: [
          { key: "contact", enabled: true },
          { key: "hero", enabled: false },
          { key: "about", enabled: true },
          { key: "contact", enabled: true },
        ],
      }),
      ["contact", "about"],
    );
  });

  test("text falls back between languages", () => {
    assert.equal(pick({ en: "Hi", ar: "مرحبا" }, "ar"), "مرحبا");
    assert.equal(pick({ en: "Hi" }, "ar"), "Hi");
    assert.equal(pick({ ar: "مرحبا" }, "en"), "مرحبا");
    assert.equal(pick(undefined, "en"), "");
  });

  test("button text stays readable on a brand colour", () => {
    assert.equal(readableOn("#000000"), "#ffffff");
    assert.equal(readableOn("#ffffff"), "#000000");
    assert.equal(readableOn("#ffd700"), "#000000");
  });
});

describe("uploaded images", () => {
  test("the bytes decide, not the name", () => {
    assert.equal(sniffImage(new Uint8Array([0xff, 0xd8, 0xff, 0xe0]))?.type, "image/jpeg");
    assert.equal(sniffImage(new Uint8Array([0x89, 0x50, 0x4e, 0x47]))?.type, "image/png");
    const webp = new TextEncoder().encode("RIFF0000WEBP");
    assert.equal(sniffImage(webp)?.type, "image/webp");
  });

  test("SVG and HTML are refused, whatever they're called", () => {
    for (const body of ['<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>', "<html><script>", "GIF89a"]) {
      assert.equal(sniffImage(new TextEncoder().encode(body)), null, body);
    }
  });
});

describe("custom domains", () => {
  test("the record to publish", () => {
    assert.equal(verificationRecordName("cars.example.com"), "_autonexa-verify.cars.example.com");
    assert.equal(verificationValue("abc"), "autonexa-verify=abc");
  });

  test("the certificate check never reaches our own network", () => {
    for (const ip of [
      "127.0.0.1", "10.0.0.1", "172.16.0.1", "172.31.255.255", "192.168.1.1", "169.254.169.254", "100.64.0.1", "0.0.0.0",
      "224.0.0.1", "::1", "::", "fc00::1", "fd12::1", "fe80::1", "::ffff:127.0.0.1", "::ffff:169.254.169.254", "not-an-ip",
    ]) {
      assert.equal(isPrivateAddress(ip), true, ip);
    }
    for (const ip of ["8.8.8.8", "1.1.1.1", "172.32.0.1", "2606:4700::1111"]) {
      assert.equal(isPrivateAddress(ip), false, ip);
    }
  });
});

describe("enquiry requests", () => {
  const base = { kind: "enquiry", firstName: "A", lastName: "B", phone: "+971501234567" };

  test("a dealership, price or status can't be sent", () => {
    const parsed = enquirySchema.parse({ ...base, tenant_id: OTHER, price: 1, status: "converted", customerId: OTHER, vehicleId: OTHER });
    for (const key of ["tenant_id", "price", "status", "customerId", "vehicleId"]) assert.ok(!(key in parsed), key);
  });

  test("the phone number must be real, and lengths are bounded", () => {
    assert.equal(enquirySchema.safeParse(base).success, true);
    assert.equal(enquirySchema.safeParse({ ...base, phone: "123" }).success, false);
    assert.equal(enquirySchema.safeParse({ ...base, message: "x".repeat(2001) }).success, false);
    assert.equal(enquirySchema.safeParse({ ...base, kind: "reservation" }).success, false);
    assert.equal(enquirySchema.safeParse({ ...base, firstName: "" }).success, false);
  });
});

describe("the code itself", () => {
  const root = process.cwd();
  const walk = (dir: string): string[] =>
    readdirSync(dir).flatMap((entry) => {
      const path = join(dir, entry);
      return statSync(path).isDirectory() ? walk(path) : [path];
    });
  const read = (file: string) => readFileSync(file, "utf8");
  const relative = (file: string) => file.slice(root.length + 1);

  test("the proxy also covers API routes, so a dealership's host can't reach the staff API", () => {
    assert.match(read(join(root, "src/proxy.ts")), /"\/api\/:path\*"/);
  });

  test("forwarded headers are never used to decide the dealership", () => {
    for (const file of ["src/proxy.ts", "src/lib/storefront/host.ts", "src/lib/server/privileged/storefront.ts"]) {
      assert.doesNotMatch(read(join(root, file)).replace(/\/\*[\s\S]*?\*\/|\/\/.*/g, ""), /x-forwarded-host/i, file);
    }
    assert.doesNotMatch(read(join(root, "src/lib/storefront/site.ts")), /get\("x-forwarded-host"\)/);
  });

  test("every public website route gets its dealership from the host", () => {
    for (const file of walk(join(root, "src/app/api/storefront")).filter((f) => f.endsWith("route.ts"))) {
      assert.match(read(file), /siteFromRequest\(request\)/, relative(file));
    }
  });

  test("every public page gets its dealership from the host", () => {
    for (const file of walk(join(root, "src/app/[locale]/site")).filter((f) => f.endsWith("page.tsx"))) {
      assert.match(read(file), /await requireSite\(\)/, relative(file));
    }
  });

  test("every dealership management route checks permission first", () => {
    const files = walk(join(root, "src/app/api/dealership-storefront")).filter((f) => f.endsWith("route.ts"));
    assert.ok(files.length >= 7);
    for (const file of files) {
      const source = read(file);
      const declared = [...source.matchAll(/export async function (GET|POST|PATCH|PUT|DELETE)\b/g)].length;
      const checked = [...source.matchAll(/const auth = await requireApiUser\("[a-z_.]+"\)/g)].length;
      assert.equal(checked, declared, relative(file));
    }
  });

  test("public code reads cars only through the allowlist", () => {
    const publicCode = [
      ...walk(join(root, "src/app/[locale]/site")),
      ...walk(join(root, "src/app/api/storefront")),
      ...walk(join(root, "src/components/storefront")).filter((f) => !f.endsWith("manager.tsx")),
      join(root, "src/lib/storefront/vehicles.ts"),
    ];
    for (const file of publicCode) {
      const source = read(file);
      for (const word of ["minimum_selling_price", "total_acquisition_cost", "purchase_price", "chassis_number", "acquisitions"]) {
        assert.ok(!source.includes(word), `${relative(file)}: ${word}`);
      }
    }
  });

  test("the website's client code gets the public record only", () => {
    const form = read(join(root, "src/components/storefront/enquiry-form.tsx"));
    assert.doesNotMatch(form, /vehicleId|tenantId|price/i);
  });

  const load = (locale: string) => JSON.parse(read(join(root, `messages/${locale}.json`)));
  const flatten = (value: unknown, prefix = ""): string[] =>
    typeof value === "object" && value !== null
      ? Object.entries(value).flatMap(([k, v]) => flatten(v, prefix ? `${prefix}.${k}` : k))
      : [prefix];

  for (const namespace of ["storefront", "storefrontAdmin"]) {
    test(`${namespace}: English and Arabic have the same keys`, () => {
      assert.deepEqual(flatten(load("ar")[namespace]).sort(), flatten(load("en")[namespace]).sort());
    });

    test(`${namespace}: every key the code uses exists`, () => {
      const known = new Set(flatten(load("en")[namespace]));
      const files = [
        ...walk(join(root, "src/components/storefront")),
        ...walk(join(root, "src/app/[locale]/site")),
        ...walk(join(root, "src/app/[locale]/(dashboard)/storefront")),
      ].filter((file) => new RegExp(`Translations\\("${namespace}"\\)`).test(read(file)));
      assert.ok(files.length > 0);
      const missing = files.flatMap((file) => {
        // A file can use both namespaces only by giving each its own name; these don't.
        return [...read(file).matchAll(/\bt\(\s*"([a-zA-Z_.]+)"/g)]
          .map((m) => m[1])
          .filter((key) => !known.has(key))
          .map((key) => `${relative(file)}: ${key}`);
      });
      assert.deepEqual(missing, []);
    });
  }

  test("Arabic is really there, not English copied", () => {
    const ar = load("ar");
    assert.notEqual(ar.storefront.listing.title, load("en").storefront.listing.title);
    assert.match(ar.storefront.listing.title, /[\u0600-\u06FF]/);
  });
});
