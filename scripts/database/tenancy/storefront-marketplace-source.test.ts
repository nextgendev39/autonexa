import assert from "node:assert/strict";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, test } from "node:test";
import {
  MAX_PROMOS,
  SITE_LINK,
  parseStorefrontConfig,
  storefrontConfigSchema,
} from "../../../src/lib/storefront/config";
import { routeStorefrontPath } from "../../../src/lib/storefront/host";
import {
  LISTING_DETAIL_COLUMNS,
  NEVER_PUBLIC,
  PUBLIC_VEHICLE_COLUMNS,
  activeFilterCount,
  listingSearchParams,
  parseListingQuery,
  toPublicVehicle,
  type PublicVehicleRow,
} from "../../../src/lib/storefront/public-vehicle";
import { vehicleListingSchema } from "../../../src/lib/validation/storefront";

/** The marketplace layer: search, listing text, banners, and what the public code may touch. */
const OWNER = "11111111-1111-4111-8111-111111111111";

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
  engine_size: "2.5L",
  engine_cylinders: 4,
  seats: 5,
  doors: 4,
  exterior_color: "white",
  interior_color: null,
  origin_type: null,
  country_of_origin: null,
  quantity: 1,
  current_selling_price: "9000",
  storefront_description: "  One owner.  ",
  storefront_features: ["Sunroof", "", "  "],
  created_at: "2026-01-01",
  branches: { name: "Dubai", city: "Dubai", emirate: "dubai", phone: "+971" },
  vehicle_pricing: { advertised_price: "8000", target_selling_price: "7000" },
  // Never public, even if a query returned it by mistake.
  description: "Bought cheap at auction, owner wants out",
  minimum_selling_price: 5000,
  total_acquisition_cost: 4000,
  source_name: "Supplier LLC",
  source_phone: "+971500000999",
  customer_id: "cust-1",
} as unknown as PublicVehicleRow;

describe("what a listing says in public", () => {
  test("the public text is its own column, and the internal description is never read", () => {
    const names = (list: string) => list.split(",").map((c) => c.trim().split(/\s/)[0]);
    assert.deepEqual(names(LISTING_DETAIL_COLUMNS), [
      "id",
      "storefront_description",
      "storefront_features",
    ]);
    for (const columns of [PUBLIC_VEHICLE_COLUMNS, LISTING_DETAIL_COLUMNS]) {
      assert.ok(!names(columns).includes("description"), "the internal description stays private");
      for (const word of ["source_", "supplier", "customer", "acquisition"]) {
        assert.ok(!columns.includes(word), word);
      }
      for (const word of NEVER_PUBLIC)
        assert.ok(!columns.toLowerCase().includes(word.toLowerCase()), word);
    }
  });

  test("a database without 00085 still serves listings: the main read never names the new columns", () => {
    assert.ok(!PUBLIC_VEHICLE_COLUMNS.includes("storefront_description"));
    assert.ok(!PUBLIC_VEHICLE_COLUMNS.includes("storefront_features"));
  });

  test("the public record carries the listing text, trimmed, and nothing private", () => {
    const vehicle = toPublicVehicle(ROW);
    assert.equal(vehicle.description, "One owner.");
    assert.deepEqual(vehicle.features, ["Sunroof"]);
    const text = JSON.stringify(vehicle).toLowerCase();
    for (const value of [
      "auction",
      "owner wants out",
      "5000",
      "4000",
      "supplier",
      "+971500000999",
      "cust-1",
      "secret-internal-id",
    ]) {
      assert.ok(!text.includes(value), value);
    }
    for (const word of NEVER_PUBLIC) assert.ok(!text.includes(word.toLowerCase()), word);
  });

  test("a car with no listing text shows none", () => {
    const vehicle = toPublicVehicle({
      ...ROW,
      storefront_description: null,
      storefront_features: null,
    });
    assert.equal(vehicle.description, null);
    assert.deepEqual(vehicle.features, []);
  });
});

describe("search from the URL", () => {
  test("every filter is read", () => {
    const query = parseListingQuery({
      make: "Toyota",
      model: "Land Cruiser",
      body: "suv",
      fuel: "petrol",
      transmission: "automatic",
      engine: "4.0L",
      city: "Dubai",
      condition: "used",
      availability: "available",
      yearMin: "2018",
      yearMax: "2024",
      priceMin: "50000",
      priceMax: "150000",
      mileageMax: "80000",
      sort: "popular",
      page: "2",
    });
    assert.deepEqual(
      { ...query },
      {
        q: "",
        make: "Toyota",
        model: "Land Cruiser",
        body: "suv",
        fuel: "petrol",
        transmission: "automatic",
        engine: "4.0L",
        city: "Dubai",
        condition: "used",
        availability: "available",
        yearMin: 2018,
        yearMax: 2024,
        priceMin: 50000,
        priceMax: 150000,
        mileageMax: 80000,
        sort: "popular",
        page: 2,
      },
    );
    assert.equal(activeFilterCount(query), 14);
  });

  test("closed lists accept only their own values", () => {
    const query = parseListingQuery({ condition: "sold", availability: "archived" });
    assert.equal(query.condition, null);
    assert.equal(query.availability, null, "a visitor can't ask for sold or archived cars");
  });

  test("nothing that means anything in a filter survives, in any field", () => {
    for (const attack of [
      "a,make.eq.x",
      "a)or(1.eq.1",
      "x;drop",
      'a"b',
      "a*b",
      "(a)",
      "a:b",
      "%",
    ]) {
      const query = parseListingQuery({
        make: attack,
        model: attack,
        city: attack,
        engine: attack,
        body: attack,
      });
      for (const value of [query.make, query.model, query.city, query.engine, query.body]) {
        assert.doesNotMatch(value ?? "", /[,();:*%"\\]/, attack);
      }
    }
  });

  test("bounds hold", () => {
    const query = parseListingQuery({ mileageMax: "99999999999", page: "0", priceMin: "-5" });
    assert.equal(query.mileageMax, null);
    assert.equal(query.page, 1);
    assert.equal(query.priceMin, null);
  });

  test("addresses drop defaults, so one search has one address", () => {
    const query = parseListingQuery({ make: "Kia", sort: "newest", page: "1" });
    assert.equal(listingSearchParams(query).toString(), "make=Kia");
    assert.equal(
      listingSearchParams({ ...query, sort: "price_asc", page: 3 }).toString(),
      "make=Kia&sort=price_asc&page=3",
    );
  });
});

describe("banners and links a dealership writes", () => {
  test("banner links stay on the dealership's own site", () => {
    for (const href of [
      "/vehicles",
      "/vehicles?body=suv&condition=used",
      "/contact",
      "/saved",
      "/",
    ]) {
      assert.match(href, SITE_LINK, href);
    }
    for (const href of [
      "https://evil.test",
      "//evil.test",
      "javascript:alert(1)",
      "/vehicles/../login",
      "/login",
      "/vehicles?x=<script>",
      '/vehicles?a=1"onclick',
      "/api/storefront/enquiry",
      " /vehicles",
    ]) {
      const parsed = storefrontConfigSchema.safeParse({ promos: [{ title: { en: "x" }, href }] });
      assert.equal(parsed.success && parsed.data.promos[0].href === href, false, href);
    }
  });

  test(`no more than ${MAX_PROMOS} banners`, () => {
    const promos = Array.from({ length: MAX_PROMOS + 1 }, () => ({ title: { en: "x" } }));
    assert.equal(storefrontConfigSchema.safeParse({ promos }).success, false);
    assert.equal(
      storefrontConfigSchema.safeParse({ promos: promos.slice(0, MAX_PROMOS) }).success,
      true,
    );
  });

  test("the map link is https only", () => {
    for (const mapUrl of ["javascript:alert(1)", "http://maps.test", "data:text/html,x"]) {
      assert.equal(
        storefrontConfigSchema.safeParse({ contact: { mapUrl } }).success,
        false,
        mapUrl,
      );
    }
    assert.equal(
      storefrontConfigSchema.safeParse({ contact: { mapUrl: "https://maps.app.goo.gl/abc" } })
        .success,
      true,
    );
  });

  test("older stored designs, without banners, still read", () => {
    const config = parseStorefrontConfig({ headline: { en: "Hi" } }, OWNER);
    assert.deepEqual(config.promos, []);
    assert.equal(config.headline.en, "Hi");
  });
});

describe("what a dealership's host can reach, now", () => {
  test("the saved-cars page and the two new public endpoints", () => {
    assert.deepEqual(routeStorefrontPath("/saved"), {
      kind: "page",
      locale: "en",
      explicitLocale: false,
      path: "/saved",
    });
    assert.deepEqual(routeStorefrontPath("/ar/saved"), {
      kind: "page",
      locale: "ar",
      explicitLocale: true,
      path: "/saved",
    });
    assert.deepEqual(routeStorefrontPath("/api/storefront/vehicles"), {
      kind: "api",
      path: "/api/storefront/vehicles",
    });
    assert.deepEqual(routeStorefrontPath("/api/storefront/suggest"), {
      kind: "api",
      path: "/api/storefront/suggest",
    });
  });

  test("still nothing of the staff app", () => {
    for (const path of [
      "/saved/x",
      "/inventory",
      "/storefront",
      "/api/dealership-storefront/vehicles/x",
    ]) {
      assert.deepEqual(routeStorefrontPath(path), { kind: "not_found" }, path);
    }
  });
});

describe("managing a listing", () => {
  test("text and features are saved together, so one can't wipe the other", () => {
    assert.equal(vehicleListingSchema.safeParse({ description: "x" }).success, false);
    assert.equal(vehicleListingSchema.safeParse({ features: ["x"] }).success, false);
    assert.equal(vehicleListingSchema.safeParse({ description: "x", features: [] }).success, true);
    assert.equal(vehicleListingSchema.safeParse({ published: true }).success, true);
    assert.equal(vehicleListingSchema.safeParse({}).success, false);
  });

  test("bounds match the database", () => {
    assert.equal(
      vehicleListingSchema.safeParse({ description: "x".repeat(4001), features: [] }).success,
      false,
    );
    assert.equal(
      vehicleListingSchema.safeParse({ description: null, features: Array(41).fill("x") }).success,
      false,
    );
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

  test("public code never names private columns or tables", () => {
    const publicCode = [
      ...walk(join(root, "src/app/[locale]/site")),
      ...walk(join(root, "src/app/api/storefront")),
      ...walk(join(root, "src/components/storefront")).filter((f) => !f.endsWith("manager.tsx")),
      // public-vehicle.ts is left out: it holds the deny-list itself, tested above.
      join(root, "src/lib/storefront/vehicles.ts"),
    ];
    for (const file of publicCode) {
      const source = read(file);
      for (const word of [
        "minimum_selling_price",
        "total_acquisition_cost",
        "purchase_price",
        "chassis_number",
        "acquisitions",
        "vehicle_expenses",
        "source_name",
        "source_phone",
        "suppliers",
        "internal_notes",
        "customers",
      ]) {
        assert.ok(!source.includes(word), `${file.slice(root.length + 1)}: ${word}`);
      }
    }
  });

  test("every public read of cars goes through the listed-cars filter", () => {
    const source = read(join(root, "src/lib/storefront/vehicles.ts"));
    // The only direct read of the vehicles table is inside listed(), which adds the three conditions.
    assert.equal([...source.matchAll(/\.from\("vehicles"\)/g)].length, 1);
    assert.match(
      source,
      /storefront_published[\s\S]{0,80}true[\s\S]{0,120}LISTED_STATUSES[\s\S]{0,80}deleted_at/,
    );
    assert.match(source, /LISTED_STATUSES = \["ready_for_sale", "reserved"\]/);
  });

  test("filter values are passed as values, never spliced into a filter string", () => {
    const source = read(join(root, "src/lib/storefront/vehicles.ts"));
    // .or() strings are built only from cleanTerm'd search text.
    for (const match of source.matchAll(/\.or\(\s*`([^`]*)`/g)) {
      assert.match(match[1], /\$\{like\}/, match[1]);
      assert.doesNotMatch(match[1], /\$\{(?!like\})/, match[1]);
    }
  });

  test("async helpers never hand back a bare query builder", () => {
    // A builder is thenable: returned from an async function it runs and becomes its rows, which
    // once broke every search page with "order is not a function".
    const source = read(join(root, "src/lib/storefront/vehicles.ts"));
    assert.doesNotMatch(source, /Promise<Builder/);
    assert.match(source, /return \{ request \};/);
  });

  test("the preview uses the same screens as the live site", () => {
    for (const screen of ["home", "listing", "vehicle", "contact", "saved"]) {
      const live = read(
        join(
          root,
          `src/app/[locale]/site${screen === "home" ? "" : screen === "listing" ? "/vehicles" : screen === "vehicle" ? "/vehicles/[stock]" : `/${screen}`}/page.tsx`,
        ),
      );
      assert.match(live, /getLiveView\(\)/, screen);
    }
    const preview = walk(join(root, "src/app/[locale]/storefront-preview")).filter((f) =>
      f.endsWith("page.tsx"),
    );
    assert.equal(preview.length, 5);
    for (const file of preview) assert.match(read(file), /getPreviewView\(\)/, file);
  });

  test("saved and recently viewed lists keep stock numbers only", () => {
    const source = read(join(root, "src/components/storefront/device-lists.ts"));
    assert.match(source, /localStorage\.setItem\(key\(list\), JSON\.stringify\(value\.slice/);
    assert.doesNotMatch(source, /phone|email|name|price/i);
  });
});
