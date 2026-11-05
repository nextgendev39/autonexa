import assert from "node:assert/strict";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, test } from "node:test";
import { featureForPermission, permissionAllowedByPlan } from "../../../src/lib/platform/features";
import { formatBytes, limitShare } from "../../../src/lib/platform/format";
import { planLimitFromError } from "../../../src/lib/platform/limit-errors";
import { canPlatform, platformPermissions, platformRoles } from "../../../src/lib/platform/permissions";
import {
  createDealershipSchema,
  createInvoiceSchema,
  dealershipStatusSchema,
  domainSchema,
  inviteStaffSchema,
  paymentSchema,
  updateDealershipSchema,
} from "../../../src/lib/validation/platform";
import { createDatabase, rows } from "./harness";

/** Guards that fail when new code skips a platform check, and the pure rules behind the console. */
const walk = (dir: string): string[] =>
  readdirSync(dir).flatMap((entry) => {
    const path = join(dir, entry);
    return statSync(path).isDirectory() ? walk(path) : [path];
  });
const root = process.cwd();
const relative = (file: string) => file.slice(root.length + 1);
const read = (file: string) => readFileSync(file, "utf8");

describe("every platform entry point checks for itself", () => {
  const routes = walk(join(root, "src/app/api/platform")).filter((f) => f.endsWith("route.ts"));

  test("found the routes (control)", () => {
    assert.ok(routes.length >= 12, `Found ${routes.length}`);
  });

  for (const file of routes) {
    test(`${relative(file)}: each handler starts with requirePlatformApi`, () => {
      const source = read(file);
      const handlers = [...source.matchAll(/export async function (GET|POST|PATCH|PUT|DELETE)\([^)]*\)[^{]*\{\n\s*const auth = await (\w+)\(/g)];
      const declared = [...source.matchAll(/export async function (GET|POST|PATCH|PUT|DELETE)\b/g)];
      assert.ok(declared.length > 0);
      assert.equal(handlers.length, declared.length, "A handler doesn't check first");
      for (const handler of handlers) assert.equal(handler[2], "requirePlatformApi");
    });
  }

  test("no platform route reaches the service-role client or names a tenant column", () => {
    for (const file of routes) {
      const source = read(file);
      assert.doesNotMatch(source, /privileged|platformClient|createPrivilegedClient/, relative(file));
      assert.doesNotMatch(source, /tenant_id|tenantId/, relative(file));
    }
  });

  const pages = walk(join(root, "src/app/[locale]/platform")).filter((f) => f.endsWith("page.tsx"));
  for (const file of pages) {
    test(`${relative(file)}: checks its permission`, () => {
      assert.match(read(file), /await requirePlatformPage\(/);
    });
  }

  test("the console layout checks too", () => {
    assert.match(read(join(root, "src/app/[locale]/platform/layout.tsx")), /await requirePlatformPage\(\)/);
  });

  test("no console component touches privileged code or decides access itself", () => {
    for (const file of walk(join(root, "src/components/platform"))) {
      assert.doesNotMatch(read(file), /lib\/server\/privileged|platformClient/, relative(file));
    }
  });

  test("the service layer reaches privileged code only through the narrow module", () => {
    const service = read(join(root, "src/lib/platform/service.ts"));
    const imports = [...service.matchAll(/from "(@\/lib\/server\/[^"]+)"/g)].map((m) => m[1]);
    assert.deepEqual(imports, ["@/lib/server/privileged/platform"]);
  });

  test("no request schema can carry a tenant, role claim or permission", () => {
    const parsed = createDealershipSchema.parse({
      name: "New",
      slug: "new-co",
      numberPrefix: "NW",
      planId: "11111111-1111-4111-8111-111111111111",
      status: "active",
      billingCycle: "monthly",
      periodEnd: null,
      ownerEmail: "owner@example.test",
      ownerFirstName: "A",
      ownerLastName: "B",
      tenant_id: "forged",
      is_platform_admin: true,
    });
    assert.ok(!("tenant_id" in parsed));
    assert.ok(!("is_platform_admin" in parsed));
  });
});

describe("the first-owner setup", () => {
  const code = (file: string) => read(join(root, file));
  const service = () => {
    const source = code("src/lib/auth/service.ts");
    return source.slice(source.indexOf("export async function bootstrapAdmin"));
  };

  test("limits guesses, and checks the secret before saying anything about owners or emails", () => {
    const body = service();
    const platform = body.indexOf("secretsMatch(parsed.data.secret, getPlatformBootstrapSecret())");
    assert.ok(platform > 0);
    assert.ok(body.indexOf("hitRateLimit") < platform);
    assert.ok(platform < body.indexOf("createFirstOwner({"));
  });

  test("the dealership secret never makes a platform owner, nor the other way round", () => {
    const body = service();
    const owner = body.indexOf("createFirstOwner({");
    const dealership = body.indexOf("secretsMatch(parsed.data.secret, getBootstrapSecret())");
    assert.ok(owner < dealership, "The owner branch returns before the dealership check");
    assert.match(body.slice(owner, dealership), /return authSuccessState\("\/login"\)/);
  });

  test("the two secrets can't be the same", () => {
    assert.match(code("src/lib/auth/bootstrap-config.ts"), /secret !== getBootstrapSecret\(\)/);
  });

  test("it can only ever create a new login, never promote an existing one", () => {
    const source = code("src/lib/server/privileged/platform.ts");
    const body = source.slice(source.indexOf("export async function createFirstOwner"));
    assert.match(body, /auth\.admin\.createUser/);
    assert.doesNotMatch(body, /listUsers|getUserById|auth_user_for_email/);
  });

  test("there's one setup page", () => {
    assert.deepEqual(readdirSync(join(root, "src/app/[locale]/(auth)/setup")).sort(), ["bootstrap", "super-admin"]);
  });
});

describe("modules a plan can switch off", () => {
  const gated: Record<string, string> = {
    acquisitions: "acquisitions",
    bookings: "bookings",
    pricing: "pricing",
    documents: "staff_documents",
  };
  for (const [folder, feature] of Object.entries(gated)) {
    const files = walk(join(root, "src/app/api", folder)).filter((f) => f.endsWith("route.ts"));
    for (const file of files) {
      test(`${relative(file)}: each handler checks the ${feature} plan feature`, () => {
        const source = read(file);
        const handlers = [...source.matchAll(/export async function (GET|POST|PATCH|PUT|DELETE)\b/g)].length;
        const gates = [...source.matchAll(new RegExp(`planFeatureGate\\(auth\\.context, "${feature}"\\)`, "g"))].length;
        assert.equal(gates, handlers);
      });
    }
  }

  test("the app's map matches the database's", async () => {
    const db = await createDatabase();
    try {
      const features = await rows<{ key: string; permission_modules: string[] }>(
        db,
        `select key, permission_modules from public.platform_features`,
      );
      for (const { key, permission_modules } of features) {
        for (const prefix of permission_modules) {
          assert.equal(featureForPermission(`${prefix}.view`), key, prefix);
        }
      }
    } finally {
      await db.close();
    }
  });

  test("the rule itself", () => {
    assert.equal(permissionAllowedByPlan("acquisition.view", ["acquisitions"]), false);
    assert.equal(permissionAllowedByPlan("acquisition.view", ["pricing"]), true);
    assert.equal(permissionAllowedByPlan("sale.create", ["bookings"]), false);
    assert.equal(permissionAllowedByPlan("vehicle.view", ["acquisitions", "bookings", "pricing"]), true);
  });
});

describe("platform permissions", () => {
  test("the app's lists match the database's", async () => {
    const db = await createDatabase();
    try {
      const held = await rows<{ role: string; permission: string }>(
        db,
        `select role, permission from public.platform_role_permissions`,
      );
      for (const { role, permission } of held) {
        assert.ok((platformRoles as readonly string[]).includes(role), role);
        assert.ok((platformPermissions as readonly string[]).includes(permission), permission);
      }
      assert.deepEqual(
        [...new Set(held.map((row) => row.permission))].sort(),
        [...platformPermissions].sort(),
      );
    } finally {
      await db.close();
    }
  });

  test("canPlatform reads only the server's answer", () => {
    assert.equal(canPlatform({ permissions: ["tenants.view"] }, "tenants.view"), true);
    assert.equal(canPlatform({ permissions: ["tenants.view"] }, "tenants.manage"), false);
  });

  test("the catalog role can't be granted through the console, nor an unknown one", () => {
    const base = { email: "a@example.test", firstName: "A", lastName: "B" };
    assert.equal(inviteStaffSchema.safeParse({ ...base, role: "support" }).success, true);
    assert.equal(inviteStaffSchema.safeParse({ ...base, role: "catalog" }).success, false);
    assert.equal(inviteStaffSchema.safeParse({ ...base, role: "root" }).success, false);
  });
});

describe("request rules", () => {
  const settings = {
    name: "N",
    logoUrl: null,
    primaryColor: null,
    contactEmail: null,
    timezone: "Asia/Dubai",
    defaultLocale: "en",
    currency: "AED",
  };

  test("branding can't carry anything but an https image and a hex colour", () => {
    assert.equal(updateDealershipSchema.safeParse(settings).success, true);
    assert.equal(updateDealershipSchema.safeParse({ ...settings, logoUrl: "javascript:alert(1)" }).success, false);
    assert.equal(updateDealershipSchema.safeParse({ ...settings, logoUrl: "http://x.test/a.png" }).success, false);
    assert.equal(updateDealershipSchema.safeParse({ ...settings, primaryColor: "red;}" }).success, false);
    assert.equal(updateDealershipSchema.safeParse({ ...settings, primaryColor: "#1A2B3C" }).success, true);
  });

  test("a domain is a bare hostname", () => {
    assert.equal(domainSchema.parse({ domain: "Cars.Example.com" }).domain, "cars.example.com");
    for (const domain of ["https://x.com", "x", "x.com/path", "-x.com"]) {
      assert.equal(domainSchema.safeParse({ domain }).success, false, domain);
    }
  });

  test("a status is only active or suspended", () => {
    assert.equal(dealershipStatusSchema.safeParse({ status: "deleted" }).success, false);
  });

  test("an invoice amount can't be negative, and a payment can't be zero", () => {
    const invoice = { amount: 1, currency: "AED", subscriptionId: null, status: "issued", dueAt: null };
    assert.equal(createInvoiceSchema.safeParse(invoice).success, true);
    assert.equal(createInvoiceSchema.safeParse({ ...invoice, amount: -1 }).success, false);
    assert.equal(createInvoiceSchema.safeParse({ ...invoice, status: "paid" }).success, false, "Paid only through a payment");
    assert.equal(paymentSchema.safeParse({ amount: 0, method: "cash" }).success, false);
    assert.equal(paymentSchema.safeParse({ amount: -5, method: "cash" }).success, true, "A reversal");
    assert.equal(paymentSchema.safeParse({ amount: 5, method: "stripe" }).success, false);
  });
});

describe("plan limit answers", () => {
  test("recognises the database's refusals, and nothing else", () => {
    assert.equal(planLimitFromError({ message: "plan_limit_exceeded:vehicles" })?.code, "plan_limit_exceeded");
    assert.equal(planLimitFromError({ message: "subscription_inactive:users" })?.code, "subscription_inactive");
    assert.equal(planLimitFromError({ message: "duplicate key" }), null);
    assert.equal(planLimitFromError(null), null);
  });

  test("usage display", () => {
    assert.equal(limitShare(5, null), null);
    assert.equal(limitShare(5, 10), 50);
    assert.equal(limitShare(50, 10), 100, "Over a lowered limit stays at 100");
    assert.equal(limitShare(1, 0), 100);
    assert.equal(formatBytes(2048), "2 KB");
    assert.equal(formatBytes(5 * 1024 * 1024), "5.0 MB");
    assert.equal(formatBytes(3 * 1024 * 1024 * 1024), "3.0 GB");
  });
});

describe("messages", () => {
  const load = (locale: string) => JSON.parse(read(join(root, `messages/${locale}.json`)));
  const flatten = (value: unknown, prefix = ""): string[] =>
    typeof value === "object" && value !== null
      ? Object.entries(value).flatMap(([k, v]) => flatten(v, prefix ? `${prefix}.${k}` : k))
      : [prefix];

  test("English and Arabic have the same console keys", () => {
    assert.deepEqual(flatten(load("ar").platform).sort(), flatten(load("en").platform).sort());
  });

  test("every console key the code uses exists", () => {
    const known = new Set(flatten(load("en").platform));
    const files = [
      ...walk(join(root, "src/components/platform")),
      ...walk(join(root, "src/app/[locale]/platform")),
      join(root, "src/components/settings/plan-card.tsx"),
    ];
    // Pages reusing another module's text ask for the root namespace, so aren't console keys.
    const consoleFiles = files.filter((file) => /Translations\("platform"\)/.test(read(file)));
    assert.ok(consoleFiles.length > 10, "Found the console's files (control)");
    const missing = consoleFiles.flatMap((file) =>
      [...read(file).matchAll(/\bt\(\s*"([a-zA-Z_.]+)"/g)]
        .map((m) => m[1])
        .filter((key) => !known.has(key))
        .map((key) => `${relative(file)}: ${key}`),
    );
    assert.deepEqual(missing, []);
  });

  test("every status, role, feature and method the code can show has a label", async () => {
    const en = load("en").platform;
    for (const s of ["active", "suspended", "trialing", "past_due", "expired", "cancelled", "draft", "issued", "paid", "void"]) {
      assert.ok(en.status[s], s);
    }
    for (const role of platformRoles) assert.ok(en.roles[role], role);
    for (const m of ["manual", "bank_transfer", "cash", "card", "cheque", "other"]) assert.ok(en.methods[m], m);
    const db = await createDatabase();
    try {
      for (const { key } of await rows<{ key: string }>(db, `select key from public.platform_features`)) {
        assert.ok(en.features[key], key);
      }
    } finally {
      await db.close();
    }
  });

  test("plan-limit errors have messages where forms show them", () => {
    for (const locale of ["en", "ar"]) {
      const { branches, users } = load(locale).modules;
      for (const code of ["plan_limit_exceeded", "subscription_inactive"]) {
        assert.ok(branches.errors[code], `${locale} branches ${code}`);
        assert.ok(users.errors[code], `${locale} users ${code}`);
      }
    }
  });
});
