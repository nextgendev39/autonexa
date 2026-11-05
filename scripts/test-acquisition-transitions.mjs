/**
 * Lightweight unit checks for the acquisition status transition map.
 * Run: node scripts/test-acquisition-transitions.mjs
 */

const TRANSITIONS = {
  draft: ["sourcing", "cancelled"],
  sourcing: ["negotiating", "cancelled"],
  negotiating: ["pending_approval", "cancelled"],
  pending_approval: ["approved", "rejected"],
  approved: ["purchased", "cancelled", "pending_approval"],
  purchased: ["documents_pending", "received"],
  documents_pending: ["received"],
  received: [],
  cancelled: [],
  rejected: ["negotiating", "cancelled"],
};

function isValid(from, to) {
  if (from === to) return true;
  return TRANSITIONS[from].includes(to);
}

const cases = [
  ["draft", "sourcing", true],
  ["draft", "negotiating", false],
  ["sourcing", "negotiating", true],
  ["negotiating", "pending_approval", true],
  ["pending_approval", "approved", true],
  ["pending_approval", "rejected", true],
  ["pending_approval", "cancelled", false],
  ["approved", "purchased", true],
  ["approved", "pending_approval", true],
  ["purchased", "received", true],
  ["purchased", "documents_pending", true],
  ["documents_pending", "received", true],
  ["received", "purchased", false],
  ["cancelled", "draft", false],
  ["rejected", "negotiating", true],
  ["negotiating", "cancelled", true],
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

if (failed > 0) {
  console.error(`\n${failed} transition test(s) failed`);
  process.exit(1);
}

console.log("\nAll acquisition transition tests passed");
