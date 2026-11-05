/**
 * Vehicle photo file validation smoke checks.
 * Run: node scripts/test-vehicle-photo-validation.mjs
 */

const MAX = 10 * 1024 * 1024;
const ALLOWED = new Set(["image/jpeg", "image/png", "image/webp", "image/heic", "image/heif"]);

function validate(mime, size) {
  if (
    !ALLOWED.has(mime) &&
    !mime.startsWith("image/jpeg") &&
    !mime.startsWith("image/png") &&
    !mime.startsWith("image/webp") &&
    !mime.startsWith("image/heic") &&
    !mime.startsWith("image/heif")
  ) {
    return "invalidType";
  }
  if (size > MAX) return "tooLarge";
  return null;
}

let failed = 0;
function assert(cond, msg) {
  if (!cond) {
    console.error("FAIL:", msg);
    failed += 1;
  }
}

assert(validate("image/jpeg", 1000) === null, "jpeg ok");
assert(validate("image/png", 1000) === null, "png ok");
assert(validate("image/webp", 1000) === null, "webp ok");
assert(validate("image/heic", 1000) === null, "heic ok");
assert(validate("image/gif", 1000) === "invalidType", "gif rejected");
assert(validate("image/jpeg", MAX + 1) === "tooLarge", "oversize rejected");

if (failed > 0) {
  console.error(`${failed} assertion(s) failed`);
  process.exit(1);
}
console.log("vehicle photo validation checks passed");
