import type { ReactNode } from "react";
import {
  ArchiveIcon,
  ArrowDownUpIcon,
  ArrowLeftRightIcon,
  ArrowUpDownIcon,
  BatteryChargingIcon,
  Building2Icon,
  BusIcon,
  CalendarClockIcon,
  CalendarIcon,
  CalendarPlusIcon,
  CarFrontIcon,
  CarIcon,
  CarTaxiFrontIcon,
  CheckCircle2Icon,
  CircleDashedIcon,
  CircleDotIcon,
  CircleEllipsisIcon,
  CircleHelpIcon,
  ClipboardCheckIcon,
  ClipboardXIcon,
  CogIcon,
  DropletsIcon,
  FuelIcon,
  GaugeIcon,
  Globe2Icon,
  HashIcon,
  LeafIcon,
  MapPinIcon,
  MilestoneIcon,
  MountainIcon,
  PackageCheckIcon,
  PlaneIcon,
  RotateCcwIcon,
  RouteIcon,
  Settings2Icon,
  ShoppingBagIcon,
  SlidersHorizontalIcon,
  SunIcon,
  TagIcon,
  TruckIcon,
  WrenchIcon,
} from "lucide-react";

import { bodyTypeKey } from "@/components/inventory/inventory-utils";
import type {
  DriveType,
  FuelType,
  MileageUnit,
  OriginType,
  TransmissionType,
  VehicleSortField,
  VehicleStatus,
} from "@/types/vehicle";

export const ORIGIN_ICONS: Record<OriginType, ReactNode> = {
  gcc: <Globe2Icon />,
  imported: <PlaneIcon />,
  unknown: <CircleHelpIcon />,
};

export const FUEL_ICONS: Record<FuelType, ReactNode> = {
  petrol: <FuelIcon />,
  diesel: <DropletsIcon />,
  hybrid: <LeafIcon />,
  electric: <BatteryChargingIcon />,
  other: <CircleEllipsisIcon />,
};

export const TRANSMISSION_ICONS: Record<TransmissionType, ReactNode> = {
  automatic: <Settings2Icon />,
  manual: <SlidersHorizontalIcon />,
  cvt: <CogIcon />,
  other: <CircleEllipsisIcon />,
};

export const DRIVE_ICONS: Record<DriveType, ReactNode> = {
  fwd: <CarFrontIcon />,
  rwd: <CarIcon />,
  awd: <ArrowUpDownIcon />,
  four_wd: <MountainIcon />,
  other: <CircleEllipsisIcon />,
};

export const MILEAGE_UNIT_ICONS: Record<MileageUnit, ReactNode> = {
  km: <RouteIcon />,
  mi: <MilestoneIcon />,
};

export const BODY_TYPE_ICONS: Record<string, ReactNode> = {
  sedan: <CarIcon />,
  suv: <CarFrontIcon />,
  crossover: <CarTaxiFrontIcon />,
  hatchback: <CarIcon />,
  coupe: <GaugeIcon />,
  convertible: <SunIcon />,
  pickup: <TruckIcon />,
  van: <BusIcon />,
  wagon: <CarTaxiFrontIcon />,
  sports_car: <GaugeIcon />,
  other: <CircleEllipsisIcon />,
};

export function bodyTypeIcon(type: string): ReactNode {
  return BODY_TYPE_ICONS[bodyTypeKey(type)] ?? <CarIcon />;
}

export const STATUS_ICONS: Record<VehicleStatus, ReactNode> = {
  acquired: <PackageCheckIcon />,
  under_inspection: <ClipboardCheckIcon />,
  inspection_failed: <ClipboardXIcon />,
  under_repair: <WrenchIcon />,
  ready_for_sale: <TagIcon />,
  reserved: <CircleDashedIcon />,
  sold: <ShoppingBagIcon />,
  delivered: <CheckCircle2Icon />,
  returned: <RotateCcwIcon />,
  archived: <ArchiveIcon />,
};

export const SORT_ICONS: Record<VehicleSortField, ReactNode> = {
  created_at: <CalendarPlusIcon />,
  updated_at: <CalendarClockIcon />,
  stock_number: <HashIcon />,
  year: <CalendarIcon />,
  mileage: <GaugeIcon />,
  status: <CircleDotIcon />,
  purchase_date: <CalendarIcon />,
  make: <TagIcon />,
  model: <CarIcon />,
};

export const ORDER_ICONS = {
  asc: <ArrowDownUpIcon />,
  desc: <ArrowUpDownIcon />,
} as const;

export const BRANCH_ICON = <Building2Icon />;
export const MODEL_ICON = <CarIcon />;
export const LOCATION_ICON = <MapPinIcon />;
export const TRANSFER_ICON = <ArrowLeftRightIcon />;
