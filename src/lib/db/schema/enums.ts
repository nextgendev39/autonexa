/** enums domain. PostgreSQL names are preserved; TypeScript fields use camelCase. */
import { pgSequence, pgEnum } from "drizzle-orm/pg-core";

export const acquisitionDocumentStatus = pgEnum("acquisition_document_status", [
  "pending",
  "partial",
  "complete",
]);

export const acquisitionPaymentStatus = pgEnum("acquisition_payment_status", [
  "not_paid",
  "partially_paid",
  "paid",
]);

export const acquisitionRegistrationStatus = pgEnum("acquisition_registration_status", [
  "not_started",
  "in_progress",
  "completed",
  "not_required",
]);

export const acquisitionSourceType = pgEnum("acquisition_source_type", [
  "individual_owner",
  "dealer",
  "auction",
  "trade_in",
  "fleet",
  "importer",
  "company",
  "broker",
  "other",
]);

export const acquisitionStatus = pgEnum("acquisition_status", [
  "draft",
  "sourcing",
  "negotiating",
  "pending_approval",
  "approved",
  "purchased",
  "documents_pending",
  "received",
  "cancelled",
  "rejected",
]);

export const branchLocationType = pgEnum("branch_location_type", [
  "showroom",
  "yard",
  "workshop",
  "storage",
  "delivery",
  "detailing",
  "other",
]);

export const documentStatus = pgEnum("document_status", ["active", "expired", "archived"]);

export const driveType = pgEnum("drive_type", ["fwd", "rwd", "awd", "four_wd", "other"]);

export const fuelType = pgEnum("fuel_type", ["petrol", "diesel", "hybrid", "electric", "other"]);

export const inspectionDamageLocation = pgEnum("inspection_damage_location", [
  "front",
  "rear",
  "left_side",
  "right_side",
  "roof",
  "interior",
  "engine_bay",
  "undercarriage",
  "other",
]);

export const inspectionDamageType = pgEnum("inspection_damage_type", [
  "scratch",
  "dent",
  "paint_damage",
  "crack",
  "rust",
  "panel_damage",
  "glass_damage",
  "mechanical_damage",
  "electrical_damage",
  "accident_damage",
  "wear_and_tear",
  "other",
]);

export const inspectionItemResult = pgEnum("inspection_item_result", [
  "pass",
  "fail",
  "advisory",
  "not_applicable",
  "not_tested",
]);

export const inspectionPhotoCategory = pgEnum("inspection_photo_category", [
  "front",
  "rear",
  "left_side",
  "right_side",
  "interior",
  "dashboard",
  "odometer",
  "vin",
  "engine",
  "tyre",
  "damage",
  "undercarriage",
  "other",
]);

export const inspectionRecommendation = pgEnum("inspection_recommendation", [
  "no_action",
  "monitor",
  "repair_before_sale",
  "repair_urgently",
  "replace",
  "reinspect",
]);

export const inspectionResult = pgEnum("inspection_result", [
  "pass",
  "pass_with_advisories",
  "repair_required",
  "fail",
]);

export const inspectionSeverity = pgEnum("inspection_severity", [
  "info",
  "minor",
  "moderate",
  "major",
  "critical",
]);

export const inspectionStatus = pgEnum("inspection_status", [
  "draft",
  "assigned",
  "in_progress",
  "submitted",
  "under_review",
  "approved",
  "rejected",
  "cancelled",
]);

export const inspectionType = pgEnum("inspection_type", [
  "full_inspection",
  "basic_inspection",
  "pre_purchase_inspection",
  "return_inspection",
  "re_inspection",
]);

export const invoiceStatus = pgEnum("invoice_status", [
  "draft",
  "issued",
  "paid",
  "partially_paid",
  "cancelled",
]);

export const leadActivityType = pgEnum("lead_activity_type", [
  "call",
  "whatsapp",
  "email",
  "note",
  "meeting",
  "test_drive",
  "follow_up",
  "other",
]);

export const leadStatus = pgEnum("lead_status", [
  "new",
  "contacted",
  "interested",
  "test_drive",
  "negotiation",
  "reserved",
  "won",
  "lost",
]);

export const mileageUnit = pgEnum("mileage_unit", ["km", "mi"]);

export const paymentMethod = pgEnum("payment_method", [
  "cash",
  "bank_transfer",
  "card",
  "financing",
  "deposit",
  "installment",
  "other",
]);

export const paymentStatus = pgEnum("payment_status", [
  "pending",
  "partial",
  "paid",
  "failed",
  "refunded",
  "cancelled",
]);

export const preferredLanguage = pgEnum("preferred_language", ["en", "ar"]);

export const pricingChangeReason = pgEnum("pricing_change_reason", [
  "market_adjustment",
  "competitor_pricing",
  "customer_negotiation",
  "clearance",
  "vehicle_condition",
  "management_decision",
  "promotion",
  "initial_pricing",
  "cost_refresh",
  "approval",
  "override",
  "other",
]);

export const pricingStatus = pgEnum("pricing_status", [
  "draft",
  "pending_approval",
  "approved",
  "active",
  "discount_approval_required",
  "below_minimum",
  "sold",
  "cancelled",
]);

export const reservationStatus = pgEnum("reservation_status", [
  "active",
  "expired",
  "cancelled",
  "converted",
]);

export const saleStatus = pgEnum("sale_status", [
  "quotation",
  "negotiation",
  "booked",
  "payment_pending",
  "paid",
  "delivery_pending",
  "delivered",
  "cancelled",
]);

export const transmissionType = pgEnum("transmission_type", [
  "automatic",
  "manual",
  "cvt",
  "other",
]);

export const uaeEmirate = pgEnum("uae_emirate", [
  "abu_dhabi",
  "dubai",
  "sharjah",
  "ajman",
  "umm_al_quwain",
  "ras_al_khaimah",
  "fujairah",
]);

export const userStatus = pgEnum("user_status", ["active", "invited", "suspended", "disabled"]);

export const vehicleCondition = pgEnum("vehicle_condition", ["excellent", "good", "fair", "poor"]);

export const vehicleExpenseCategory = pgEnum("vehicle_expense_category", [
  "purchase",
  "auction",
  "transportation",
  "customs",
  "registration",
  "repair",
  "detailing",
  "inspection",
  "advertising",
  "other",
  "broker_fee",
  "import_duty",
  "clearance",
  "insurance",
]);

export const vehicleMarketType = pgEnum("vehicle_market_type", ["new", "used"]);

export const vehicleOrigin = pgEnum("vehicle_origin", ["gcc", "imported", "unknown"]);

export const vehiclePhotoCategory = pgEnum("vehicle_photo_category", [
  "front",
  "rear",
  "left",
  "right",
  "interior",
  "dashboard",
  "engine",
  "odometer",
  "tyres",
  "damage",
  "vin",
  "other",
]);

export const vehicleSource = pgEnum("vehicle_source", [
  "direct_purchase",
  "auction",
  "trade_in",
  "import",
  "other",
]);

export const vehicleStatus = pgEnum("vehicle_status", [
  "acquired",
  "under_inspection",
  "inspection_failed",
  "under_repair",
  "ready_for_sale",
  "reserved",
  "sold",
  "delivered",
  "returned",
  "archived",
]);

export const workshopItemType = pgEnum("workshop_item_type", ["part", "labor", "other"]);

export const vehicleStockNumberSeq = pgSequence("vehicle_stock_number_seq", {
  startWith: "1",
  increment: "1",
  minValue: "1",
  maxValue: "9223372036854775807",
  cache: "1",
  cycle: false,
});

export const acquisitionNumberSeq = pgSequence("acquisition_number_seq", {
  startWith: "1",
  increment: "1",
  minValue: "1",
  maxValue: "9223372036854775807",
  cache: "1",
  cycle: false,
});

export const inspectionNumberSeq = pgSequence("inspection_number_seq", {
  startWith: "1",
  increment: "1",
  minValue: "1",
  maxValue: "9223372036854775807",
  cache: "1",
  cycle: false,
});
