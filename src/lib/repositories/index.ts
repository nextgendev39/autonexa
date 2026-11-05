export {
  listVehicles,
  getVehicle,
  createVehicle,
  updateVehicle,
  changeVehicleStatus,
  transferVehicle,
  archiveVehicle,
  getVehicleStatusHistory,
  getVehicleActivity,
  getInventorySummary,
  listBranches,
  listLocations,
  listMakes,
  listModels,
  findDuplicateVehicle,
} from "@/lib/repositories/vehicles";

export {
  listAcquisitions,
  getAcquisition,
  createAcquisition,
  updateAcquisition,
  changeAcquisitionStatus,
  approveAcquisition,
  rejectAcquisition,
  cancelAcquisition,
  receiveAcquisition,
  addAcquisitionExpense,
  updateAcquisitionExpense,
  removeAcquisitionExpense,
  getAcquisitionHistory,
  getAcquisitionActivity,
  getAcquisitionSummary,
  getAcquisitionMeta,
  getAcquisitionForVehicle,
} from "@/lib/repositories/acquisitions";

export type { VehicleServiceError, ServiceResult } from "@/lib/repositories/vehicles";
export type { AcquisitionServiceError } from "@/lib/repositories/acquisitions";
export type { RepositoryResult } from "@/lib/repositories/types";
