import type { ReactNode } from "react";
import {
  BadgeCheckIcon,
  BanknoteIcon,
  Building2Icon,
  CalendarClockIcon,
  CalendarIcon,
  CalendarPlusIcon,
  CarIcon,
  CheckCircle2Icon,
  CircleDashedIcon,
  CircleDotIcon,
  CircleEllipsisIcon,
  CircleHelpIcon,
  ClipboardCheckIcon,
  ClipboardListIcon,
  FileCheckIcon,
  FileTextIcon,
  FileWarningIcon,
  GavelIcon,
  HandshakeIcon,
  HashIcon,
  IdCardIcon,
  PackageCheckIcon,
  PackageSearchIcon,
  PlaneIcon,
  ReceiptIcon,
  ScaleIcon,
  ShieldCheckIcon,
  ShoppingBagIcon,
  StampIcon,
  StoreIcon,
  TagIcon,
  TruckIcon,
  UserIcon,
  UsersIcon,
  WalletIcon,
  WarehouseIcon,
  XCircleIcon,
} from "lucide-react";

import type { SearchableSelectOption } from "@/components/ui/searchable-select";
import { countryFlag } from "@/lib/vehicles/countries";
import type {
  AcquisitionDocumentStatus,
  AcquisitionExpenseType,
  AcquisitionPaymentStatus,
  AcquisitionRegistrationStatus,
  AcquisitionSortField,
  AcquisitionSourceType,
  AcquisitionStatus,
} from "@/types/acquisition";

export const ACQUISITION_STATUS_ICONS: Record<AcquisitionStatus, ReactNode> = {
  draft: <CircleDashedIcon />,
  sourcing: <PackageSearchIcon />,
  negotiating: <HandshakeIcon />,
  pending_approval: <ClipboardListIcon />,
  approved: <BadgeCheckIcon />,
  purchased: <ShoppingBagIcon />,
  documents_pending: <FileWarningIcon />,
  received: <PackageCheckIcon />,
  cancelled: <XCircleIcon />,
  rejected: <XCircleIcon />,
};

export const ACQUISITION_SOURCE_ICONS: Record<AcquisitionSourceType, ReactNode> = {
  individual_owner: <UserIcon />,
  dealer: <StoreIcon />,
  auction: <GavelIcon />,
  trade_in: <CarIcon />,
  fleet: <WarehouseIcon />,
  importer: <PlaneIcon />,
  company: <Building2Icon />,
  broker: <UsersIcon />,
  other: <CircleEllipsisIcon />,
};

export const ACQUISITION_PAYMENT_ICONS: Record<AcquisitionPaymentStatus, ReactNode> = {
  not_paid: <WalletIcon />,
  partially_paid: <BanknoteIcon />,
  paid: <CheckCircle2Icon />,
};

export const ACQUISITION_DOCUMENT_ICONS: Record<AcquisitionDocumentStatus, ReactNode> = {
  pending: <FileTextIcon />,
  partial: <ClipboardCheckIcon />,
  complete: <FileCheckIcon />,
};

export const ACQUISITION_REGISTRATION_ICONS: Record<
  AcquisitionRegistrationStatus,
  ReactNode
> = {
  not_started: <CircleHelpIcon />,
  in_progress: <IdCardIcon />,
  completed: <StampIcon />,
  not_required: <CircleEllipsisIcon />,
};

export const ACQUISITION_EXPENSE_ICONS: Record<AcquisitionExpenseType, ReactNode> = {
  purchase: <TagIcon />,
  transportation: <TruckIcon />,
  auction: <GavelIcon />,
  broker_fee: <HandshakeIcon />,
  registration: <StampIcon />,
  insurance: <ShieldCheckIcon />,
  import_duty: <ScaleIcon />,
  clearance: <PackageCheckIcon />,
  inspection: <ClipboardCheckIcon />,
  customs: <StampIcon />,
  other: <CircleEllipsisIcon />,
};

export const ACQUISITION_SORT_ICONS: Record<AcquisitionSortField, ReactNode> = {
  created_at: <CalendarPlusIcon />,
  updated_at: <CalendarClockIcon />,
  acquisition_number: <HashIcon />,
  purchase_date: <CalendarIcon />,
  status: <CircleDotIcon />,
  source_type: <StoreIcon />,
};

/** Currencies for acquisition forms. AED is the UAE default; others support later multi-currency. */
export const ACQUISITION_CURRENCIES = [
  { code: "AED", country: "AE", label: "AED — UAE Dirham" },
  { code: "SAR", country: "SA", label: "SAR — Saudi Riyal" },
  { code: "USD", country: "US", label: "USD — US Dollar" },
  { code: "EUR", country: "EU", label: "EUR — Euro" },
  { code: "GBP", country: "GB", label: "GBP — British Pound" },
] as const;

export type AcquisitionCurrencyCode = (typeof ACQUISITION_CURRENCIES)[number]["code"];

export function acquisitionCurrencyOptions(): SearchableSelectOption[] {
  return ACQUISITION_CURRENCIES.map((currency) => ({
    value: currency.code,
    label: currency.label,
    icon: currency.country === "EU" ? "🇪🇺" : countryFlag(currency.country),
  }));
}

export const ACQUISITION_CURRENCY_ICON = <ReceiptIcon />;
export {
  BRANCH_ICON,
  MODEL_ICON,
  ORDER_ICONS,
  ORIGIN_ICONS,
} from "@/components/inventory/vehicle-select-icons";
