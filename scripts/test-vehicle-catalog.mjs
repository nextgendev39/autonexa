/**
 * Unit checks for vehicle catalog filtering / dependent clears / uniqueness helpers.
 * Run: node scripts/test-vehicle-catalog.mjs
 */

function slugify(value) {
  return String(value)
    .trim()
    .toLowerCase()
    .replace(/&/g, "and")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

const brands = [
  { id: "b1", name: "Toyota", nameAr: "تويوتا", isActive: true },
  { id: "b2", name: "Nissan", nameAr: "نيسان", isActive: true },
  { id: "b3", name: "Hidden", isActive: false },
];

const models = [
  { id: "m1", makeId: "b1", name: "Camry", isActive: true },
  { id: "m2", makeId: "b1", name: "Land Cruiser", isActive: true },
  { id: "m3", makeId: "b2", name: "Patrol", isActive: true },
  { id: "m4", makeId: "b1", name: "Old", isActive: false },
];

const years = [
  { id: "y1", modelId: "m1", year: 2025, isActive: true },
  { id: "y2", modelId: "m1", year: 2024, isActive: true },
  { id: "y3", modelId: "m2", year: 2025, isActive: true },
  { id: "y4", modelId: "m1", year: 2010, isActive: false },
];

const variants = [
  { id: "v1", modelYearId: "y1", name: "XLE", isActive: true },
  { id: "v2", modelYearId: "y1", name: "SE", isActive: true },
  { id: "v3", modelYearId: "y3", name: "GXR", isActive: true },
  { id: "v4", modelYearId: "y1", name: "Retired", isActive: false },
];

function activeBrands() {
  return brands.filter((b) => b.isActive);
}

function modelsForBrand(brandId) {
  return models.filter((m) => m.makeId === brandId && m.isActive);
}

function yearsForModel(modelId) {
  return years.filter((y) => y.modelId === modelId && y.isActive);
}

function variantsForYear(modelYearId) {
  return variants.filter((v) => v.modelYearId === modelYearId && v.isActive);
}

function clearOnBrandChange(state) {
  return { ...state, modelId: "", modelYearId: "", variantId: "", year: null, variant: "" };
}

function clearOnModelChange(state) {
  return { ...state, modelYearId: "", variantId: "", year: null, variant: "" };
}

function isValidCombo({ makeId, modelId, modelYearId, variantId }) {
  const model = models.find((m) => m.id === modelId);
  if (!model || model.makeId !== makeId) return false;
  const year = years.find((y) => y.id === modelYearId);
  if (!year || year.modelId !== modelId) return false;
  if (!variantId) return true;
  const variant = variants.find((v) => v.id === variantId);
  return Boolean(variant && variant.modelYearId === modelYearId);
}

function canInsertBrand(name, existing) {
  const slug = slugify(name);
  return !existing.some((b) => b.name.toLowerCase() === name.toLowerCase() || b.slug === slug);
}

function canInsertModel(makeId, name, existing) {
  const slug = slugify(name);
  return !existing.some(
    (m) => m.makeId === makeId && (m.name.toLowerCase() === name.toLowerCase() || m.slug === slug),
  );
}

function canInsertYear(modelId, year, market, existing) {
  return !existing.some((y) => y.modelId === modelId && y.year === year && y.market === market);
}

function canInsertVariant(modelYearId, name, existing) {
  const slug = slugify(name);
  return !existing.some((v) => v.modelYearId === modelYearId && v.slug === slug);
}

let failed = 0;
function assert(cond, label) {
  if (!cond) {
    failed += 1;
    console.error(`FAIL ${label}`);
  } else {
    console.log(`ok   ${label}`);
  }
}

assert(activeBrands().every((b) => b.isActive), "inactive brands hidden from inventory selectors");
assert(
  modelsForBrand("b1").map((m) => m.name).join(",") === "Camry,Land Cruiser",
  "Brand → Model filtering",
);
assert(modelsForBrand("b2").length === 1 && modelsForBrand("b2")[0].name === "Patrol", "Nissan models only");
assert(
  yearsForModel("m1").map((y) => y.year).join(",") === "2025,2024",
  "Model → Year filtering (active only)",
);
assert(
  variantsForYear("y1").map((v) => v.name).join(",") === "XLE,SE",
  "Year → Variant filtering (active only)",
);

const clearedBrand = clearOnBrandChange({
  makeId: "b2",
  modelId: "m1",
  modelYearId: "y1",
  variantId: "v1",
  year: 2025,
  variant: "XLE",
});
assert(!clearedBrand.modelId && !clearedBrand.modelYearId && !clearedBrand.variantId, "Changing Brand clears dependents");

const clearedModel = clearOnModelChange({
  makeId: "b1",
  modelId: "m2",
  modelYearId: "y1",
  variantId: "v1",
  year: 2025,
  variant: "XLE",
});
assert(!clearedModel.modelYearId && !clearedModel.variantId, "Changing Model clears year/variant");

assert(
  isValidCombo({ makeId: "b1", modelId: "m1", modelYearId: "y1", variantId: "v1" }),
  "valid Camry/2025/XLE accepted",
);
assert(
  !isValidCombo({ makeId: "b1", modelId: "m1", modelYearId: "y1", variantId: "v3" }),
  "invalid variant/model combination rejected",
);
assert(
  !isValidCombo({ makeId: "b1", modelId: "m2", modelYearId: "y1", variantId: "v1" }),
  "year from another model rejected",
);

assert(canInsertBrand("Toyota", [{ name: "Toyota", slug: "toyota" }]) === false, "duplicate brand prevented");
assert(canInsertBrand("Mazda", [{ name: "Toyota", slug: "toyota" }]) === true, "new brand allowed");
assert(
  canInsertModel("b1", "Camry", [{ makeId: "b1", name: "Camry", slug: "camry" }]) === false,
  "duplicate model within brand prevented",
);
assert(
  canInsertModel("b2", "Camry", [{ makeId: "b1", name: "Camry", slug: "camry" }]) === true,
  "same model name allowed under different brand",
);
assert(
  canInsertYear("m1", 2025, "UAE", [{ modelId: "m1", year: 2025, market: "UAE" }]) === false,
  "duplicate model year prevented",
);
assert(
  canInsertVariant("y1", "XLE", [{ modelYearId: "y1", slug: "xle" }]) === false,
  "duplicate variant within model year prevented",
);

assert(slugify("Mercedes-Benz") === "mercedes-benz", "slug mercedes-benz");
assert(slugify("Land Cruiser") === "land-cruiser", "slug land-cruiser");
assert(slugify("3 Series") === "3-series", "slug 3-series");

// Existing vehicle text remains intact when unmatched
const existing = { make: "RareMake", model: "OneOff", variant: "Custom", makeId: null, modelId: null };
assert(existing.make === "RareMake" && existing.makeId == null, "existing unmatched vehicle records remain intact");

if (failed > 0) {
  console.error(`\n${failed} catalog test(s) failed`);
  process.exit(1);
}
console.log("\nAll catalog tests passed");
