/**
 * Lightweight unit checks for the in-app status transition map.
 * Run: node scripts/test-vehicle-transitions.mjs
 */

const TRANSITIONS = {
  acquired: ["under_inspection", "ready_for_sale"],
  under_inspection: ["ready_for_sale", "under_repair", "inspection_failed"],
  inspection_failed: ["under_repair", "under_inspection", "archived"],
  under_repair: ["under_inspection", "ready_for_sale"],
  ready_for_sale: ["reserved", "sold", "under_repair"],
  reserved: ["sold", "ready_for_sale"],
  sold: ["delivered"],
  delivered: ["returned"],
  returned: ["under_inspection", "archived"],
  archived: [],
};

function canArchive(status) {
  return status !== "sold" && status !== "delivered" && status !== "archived";
}

function isValid(from, to) {
  if (from === to) return true;
  if (TRANSITIONS[from].includes(to)) return true;
  if (to === "archived" && canArchive(from)) return true;
  return false;
}

function getGenericOptions(from) {
  return TRANSITIONS[from].filter((status) => {
    if (status === "ready_for_sale" && from !== "reserved") return false;
    return true;
  });
}

const cases = [
  ["acquired", "under_inspection", true],
  ["acquired", "ready_for_sale", true],
  ["ready_for_sale", "reserved", true],
  ["sold", "ready_for_sale", false],
  ["delivered", "sold", false],
  ["archived", "ready_for_sale", false],
  ["returned", "archived", true],
  ["under_repair", "ready_for_sale", true],
  ["reserved", "ready_for_sale", true],
];

let failed = 0;
for (const [from, to, expected] of cases) {
  const actual = isValid(from, to);
  if (actual !== expected) {
    failed += 1;
    console.error(`FAIL ${from} → ${to}: expected ${expected}, got ${actual}`);
  } else {
    console.log(`ok   ${from} → ${to}`);
  }
}

const genericFromAcquired = getGenericOptions("acquired");
if (genericFromAcquired.includes("ready_for_sale")) {
  failed += 1;
  console.error("FAIL generic Change Status must not offer ready_for_sale from acquired");
} else {
  console.log("ok   generic options hide ready_for_sale from acquired");
}

const genericFromReserved = getGenericOptions("reserved");
if (!genericFromReserved.includes("ready_for_sale")) {
  failed += 1;
  console.error("FAIL generic Change Status must allow un-reserve to ready_for_sale");
} else {
  console.log("ok   generic options allow ready_for_sale from reserved");
}

if (failed > 0) {
  console.error(`\n${failed} transition test(s) failed`);
  process.exit(1);
}

console.log("\nAll transition tests passed");
