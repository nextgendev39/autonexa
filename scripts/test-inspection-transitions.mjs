/**
 * Lightweight unit checks for the inspection status transition map.
 * Run: node scripts/test-inspection-transitions.mjs
 */

const TRANSITIONS = {
  draft: ["assigned", "in_progress", "cancelled"],
  assigned: ["in_progress", "cancelled"],
  in_progress: ["submitted", "cancelled"],
  submitted: ["under_review", "cancelled"],
  under_review: ["approved", "rejected"],
  approved: [],
  rejected: ["in_progress", "cancelled"],
  cancelled: [],
};

function isValid(from, to) {
  if (from === to) return true;
  return TRANSITIONS[from].includes(to);
}

const cases = [
  // Positive
  ["draft", "assigned", true],
  ["draft", "in_progress", true],
  ["draft", "cancelled", true],
  ["assigned", "in_progress", true],
  ["assigned", "cancelled", true],
  ["in_progress", "submitted", true],
  ["in_progress", "cancelled", true],
  ["submitted", "under_review", true],
  ["submitted", "cancelled", true],
  ["under_review", "approved", true],
  ["under_review", "rejected", true],
  ["rejected", "in_progress", true],
  ["rejected", "cancelled", true],
  ["draft", "draft", true],
  // Negative
  ["draft", "submitted", false],
  ["draft", "approved", false],
  ["assigned", "submitted", false],
  ["assigned", "approved", false],
  ["in_progress", "under_review", false],
  ["in_progress", "approved", false],
  ["submitted", "approved", false],
  ["submitted", "in_progress", false],
  ["under_review", "cancelled", false],
  ["under_review", "in_progress", false],
  ["approved", "rejected", false],
  ["approved", "in_progress", false],
  ["cancelled", "draft", false],
  ["cancelled", "in_progress", false],
  ["rejected", "approved", false],
  ["rejected", "under_review", false],
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

console.log("\nAll inspection transition tests passed");
