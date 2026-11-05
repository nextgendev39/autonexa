export {
  listVehicles,
  getVehicle,
  createVehicle,
  updateVehicle,
  changeVehicleStatus,
  transferVehicle,
  archiveVehicle,
  getVehicleReadyForSaleEligibility,
  markVehicleReadyForSale,
  getVehicleStatusHistory,
  getVehicleActivity,
  getInventorySummary,
  listBranches,
  listLocations,
  listMakes,
  listModels,
  findDuplicateVehicle,
} from "@/lib/vehicles/service";

export type { VehicleServiceError, ServiceResult } from "@/lib/vehicles/service";
