export const PRICING_STATUSES = [
  "draft",
  "pending_approval",
  "approved",
  "active",
  "discount_approval_required",
  "below_minimum",
  "sold",
  "cancelled",
] as const;

export type PricingStatus = (typeof PRICING_STATUSES)[number];

export const PRICING_CHANGE_REASONS = [
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
] as const;

export type PricingChangeReason = (typeof PRICING_CHANGE_REASONS)[number];

export type VehicleCostBreakdown = {
  purchaseCost: number;
  acquisitionExpenses: number;
  acquisitionTotal: number;
  workshopCost?: number;
  otherCosts: number;
  totalVehicleCost: number;
  acquisitionLines: { category: string; amount: number }[];
  currency: string;
};

export type VehicleProfitability = {
  vehicleId: string;
  currency: string;
  purchaseCost: number | null;
  acquisitionExpenses: number | null;
  workshopCost?: number | null;
  otherVehicleCosts: number | null;
  totalVehicleCost: number | null;
  minimumSellingPrice: number | null;
  targetSellingPrice: number | null;
  advertisedPrice: number | null;
  currentSellingPrice: number | null;
  maximumDiscountAmount: number | null;
  maximumDiscountPercent: number | null;
  discountAmount: number | null;
  discountPercent: number | null;
  expectedGrossProfit: number | null;
  expectedMarginPercent: number | null;
  pricingStatus: PricingStatus | null;
  pricingNotes: string | null;
  pricingId: string | null;
  belowMinimum: boolean;
  isLoss: boolean;
};

export type VehiclePricing = {
  id: string;
  vehicleId: string;
  minimumSellingPrice: number | null;
  targetSellingPrice: number | null;
  advertisedPrice: number | null;
  currentSellingPrice: number | null;
  maximumDiscountAmount: number | null;
  maximumDiscountPercent: number | null;
  pricingStatus: PricingStatus;
  pricingNotes: string | null;
  changeReason: PricingChangeReason | null;
  changeNotes: string | null;
  overrideMinimum: boolean;
  overrideReason: string | null;
  approvedBy: string | null;
  approvedAt: string | null;
  effectiveFrom: string;
  createdBy: string | null;
  updatedBy: string | null;
  createdAt: string;
  updatedAt: string;
};

export type VehiclePricingHistoryItem = {
  id: string;
  vehicleId: string;
  pricingId: string | null;
  previousMinimumPrice: number | null;
  newMinimumPrice: number | null;
  previousTargetPrice: number | null;
  newTargetPrice: number | null;
  previousAdvertisedPrice: number | null;
  newAdvertisedPrice: number | null;
  previousCurrentPrice: number | null;
  newCurrentPrice: number | null;
  previousDiscount: number | null;
  newDiscount: number | null;
  previousStatus: PricingStatus | null;
  newStatus: PricingStatus | null;
  reason: PricingChangeReason | null;
  notes: string | null;
  overrideMinimum: boolean;
  changedBy: string | null;
  changedByName: string | null;
  changedAt: string;
};

export type PricingListItem = {
  vehicleId: string;
  stockNumber: string;
  make: string;
  model: string;
  year: number;
  vehicleStatus: string;
  branchId: string;
  branchName: string | null;
  totalVehicleCost: number | null;
  minimumSellingPrice: number | null;
  targetSellingPrice: number | null;
  advertisedPrice: number | null;
  currentSellingPrice: number | null;
  expectedGrossProfit: number | null;
  expectedMarginPercent: number | null;
  pricingStatus: PricingStatus | null;
  updatedAt: string;
};

export type PricingListResult = {
  items: PricingListItem[];
  total: number;
  page: number;
  pageSize: number;
};

export type VehiclePricingDetail = {
  pricing: VehiclePricing | null;
  profitability: VehicleProfitability;
  breakdown: VehicleCostBreakdown | null;
  history: VehiclePricingHistoryItem[];
  vehicle: {
    id: string;
    stockNumber: string;
    make: string;
    model: string;
    year: number;
    status: string;
    branchId: string;
    branchName: string | null;
  };
};
