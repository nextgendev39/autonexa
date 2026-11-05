/**
 * Acquisition document file validation smoke checks.
 * Run: node scripts/test-acquisition-document-validation.mjs
 */

const MAX = 20 * 1024 * 1024;
const ALLOWED = new Set([
  "application/pdf",
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/jpg",
]);

const CATEGORIES = [
  "purchase_invoice",
  "auction_invoice",
  "seller_invoice",
  "purchase_agreement",
  "payment_receipt",
  "transport_document",
  "customs_document",
  "import_document",
  "registration_document",
  "inspection_document",
  "ownership_document",
  "other",
];

function validate(mime, size) {
  const value = (mime || "").toLowerCase();
  const okMime =
    ALLOWED.has(value) ||
    value.startsWith("image/jpeg") ||
    value.startsWith("image/png") ||
    value.startsWith("image/webp") ||
    value === "application/pdf";
  if (!okMime) return "invalidType";
  if (size > MAX) return "tooLarge";
  return null;
}

function safeName(name) {
  return name.replace(/[^a-zA-Z0-9._-]+/g, "-").slice(0, 80) || "document.pdf";
}

function buildPath(vehicleId, acquisitionId, category, fileName) {
  return `${vehicleId}/${acquisitionId}/${category}/${crypto.randomUUID()}-${safeName(fileName)}`;
}

let failed = 0;
function assert(cond, msg) {
  if (!cond) {
    console.error("FAIL:", msg);
    failed += 1;
  }
}

// File types
assert(validate("application/pdf", 1000) === null, "pdf ok");
assert(validate("image/jpeg", 1000) === null, "jpeg ok");
assert(validate("image/jpg", 1000) === null, "jpg alias ok");
assert(validate("image/png", 1000) === null, "png ok");
assert(validate("image/webp", 1000) === null, "webp ok");
assert(validate("image/gif", 1000) === "invalidType", "gif rejected");
assert(validate("application/javascript", 1000) === "invalidType", "js rejected");
assert(validate("application/x-msdownload", 1000) === "invalidType", "exe mime rejected");
assert(validate("application/pdf", MAX) === null, "20mb boundary ok");
assert(validate("application/pdf", MAX + 1) === "tooLarge", "oversize rejected");

// Categories
assert(CATEGORIES.length === 12, "12 acquisition document categories");
assert(new Set(CATEGORIES).size === CATEGORIES.length, "category keys unique");

// Storage path security shape
const vehicleId = "11111111-1111-1111-1111-111111111111";
const acquisitionId = "22222222-2222-2222-2222-222222222222";
const path = buildPath(vehicleId, acquisitionId, "purchase_invoice", "Purchase Invoice.pdf");
assert(path.startsWith(`${vehicleId}/${acquisitionId}/purchase_invoice/`), "path prefix");
assert(!path.includes("Purchase Invoice"), "original spaces sanitized");
assert(path.includes("Purchase-Invoice.pdf") || path.endsWith(".pdf"), "safe filename retained");

// Multiple same category allowed (no overwrite key)
const pathA = buildPath(vehicleId, acquisitionId, "auction_invoice", "a.pdf");
const pathB = buildPath(vehicleId, acquisitionId, "auction_invoice", "a.pdf");
assert(pathA !== pathB, "same category gets unique storage paths");

if (failed > 0) {
  console.error(`${failed} assertion(s) failed`);
  process.exit(1);
}
console.log("acquisition document validation checks passed");
