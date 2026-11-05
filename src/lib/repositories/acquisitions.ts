export {
  listAcquisitions,
  getAcquisition,
  createAcquisition,
  updateAcquisition,
  changeAcquisitionStatus,
  approveAcquisition,
  rejectAcquisition,
  cancelAcquisition,
  confirmAcquisitionPurchase,
  receiveAcquisition,
  addAcquisitionExpense,
  updateAcquisitionExpense,
  removeAcquisitionExpense,
  getAcquisitionHistory,
  getAcquisitionActivity,
  getAcquisitionSummary,
  getAcquisitionMeta,
  getAcquisitionForVehicle,
} from "@/lib/acquisitions/service";

export type { AcquisitionServiceError, ServiceResult } from "@/lib/acquisitions/service";
