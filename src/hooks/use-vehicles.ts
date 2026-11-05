"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import {
  archiveVehicleRequest,
  changeStatusRequest,
  createVehicleRequest,
  fetchInventoryMeta,
  fetchReadyForSaleEligibility,
  fetchVehicle,
  fetchVehicleHistory,
  fetchVehicles,
  markReadyForSaleRequest,
  transferVehicleRequest,
  updateVehicleRequest,
} from "@/lib/vehicles/api-client";
import type {
  ArchiveVehicleValues,
  ChangeVehicleStatusValues,
  CreateVehicleValues,
  MarkReadyForSaleValues,
  TransferVehicleValues,
  UpdateVehicleValues,
} from "@/lib/validation/vehicle";

export const vehicleKeys = {
  all: ["vehicles"] as const,
  list: (search: string) => ["vehicles", "list", search] as const,
  detail: (id: string) => ["vehicles", "detail", id] as const,
  history: (id: string) => ["vehicles", "history", id] as const,
  readyForSale: (id: string) => ["vehicles", "ready-for-sale", id] as const,
  meta: (branchId?: string, makeId?: string) =>
    ["inventory", "meta", branchId ?? "", makeId ?? ""] as const,
};

export function useVehicleList(
  search: string,
  options?: { enabled?: boolean },
) {
  return useQuery({
    queryKey: vehicleKeys.list(search),
    queryFn: async () => {
      const result = await fetchVehicles(search);
      if (result.status === "error") throw new Error(result.message);
      return result.data;
    },
    enabled: options?.enabled ?? true,
  });
}

export function useVehicle(id: string) {
  return useQuery({
    queryKey: vehicleKeys.detail(id),
    queryFn: async () => {
      const result = await fetchVehicle(id);
      if (result.status === "error") throw new Error(result.message);
      return result.data;
    },
    enabled: Boolean(id),
  });
}

export function useVehicleHistory(id: string) {
  return useQuery({
    queryKey: vehicleKeys.history(id),
    queryFn: async () => {
      const result = await fetchVehicleHistory(id);
      if (result.status === "error") throw new Error(result.message);
      return result.data;
    },
    enabled: Boolean(id),
  });
}

export function useReadyForSaleEligibility(id: string, enabled = true) {
  return useQuery({
    queryKey: vehicleKeys.readyForSale(id),
    queryFn: async () => {
      const result = await fetchReadyForSaleEligibility(id);
      if (result.status === "error") throw new Error(result.message);
      return result.data;
    },
    enabled: Boolean(id) && enabled,
  });
}

export function useInventoryMeta(branchId?: string, makeId?: string) {
  return useQuery({
    queryKey: vehicleKeys.meta(branchId, makeId),
    queryFn: async () => {
      const result = await fetchInventoryMeta({ branchId, makeId });
      if (result.status === "error") throw new Error(result.message);
      return result.data;
    },
  });
}

export function useVehicleMutations(vehicleId?: string) {
  const queryClient = useQueryClient();

  const invalidate = async () => {
    await queryClient.invalidateQueries({ queryKey: vehicleKeys.all });
    if (vehicleId) {
      await queryClient.invalidateQueries({ queryKey: vehicleKeys.detail(vehicleId) });
      await queryClient.invalidateQueries({ queryKey: vehicleKeys.history(vehicleId) });
      await queryClient.invalidateQueries({ queryKey: vehicleKeys.readyForSale(vehicleId) });
    }
  };

  const create = useMutation({
    mutationFn: async (body: CreateVehicleValues) => {
      const result = await createVehicleRequest(body);
      if (result.status === "error") {
        const error = new Error(result.message) as Error & {
          fieldErrors?: Record<string, string>;
          code?: string;
          existingVehicleId?: string;
        };
        error.fieldErrors = result.fieldErrors;
        error.code = result.error;
        error.existingVehicleId = result.details?.existingVehicleId;
        throw error;
      }
      return result.data;
    },
    onSuccess: invalidate,
  });

  const update = useMutation({
    mutationFn: async (body: UpdateVehicleValues) => {
      if (!vehicleId) throw new Error("Missing vehicle id");
      const result = await updateVehicleRequest(vehicleId, body);
      if (result.status === "error") {
        const error = new Error(result.message) as Error & {
          fieldErrors?: Record<string, string>;
          code?: string;
          existingVehicleId?: string;
        };
        error.fieldErrors = result.fieldErrors;
        error.code = result.error;
        error.existingVehicleId = result.details?.existingVehicleId;
        throw error;
      }
      return result.data;
    },
    onSuccess: invalidate,
  });

  const changeStatus = useMutation({
    mutationFn: async (body: ChangeVehicleStatusValues) => {
      if (!vehicleId) throw new Error("Missing vehicle id");
      const result = await changeStatusRequest(vehicleId, body);
      if (result.status === "error") throw new Error(result.message);
      return result.data;
    },
    onSuccess: invalidate,
  });

  const transfer = useMutation({
    mutationFn: async (body: TransferVehicleValues) => {
      if (!vehicleId) throw new Error("Missing vehicle id");
      const result = await transferVehicleRequest(vehicleId, body);
      if (result.status === "error") throw new Error(result.message);
      return result.data;
    },
    onSuccess: invalidate,
  });

  const archive = useMutation({
    mutationFn: async (body: ArchiveVehicleValues) => {
      if (!vehicleId) throw new Error("Missing vehicle id");
      const result = await archiveVehicleRequest(vehicleId, body);
      if (result.status === "error") throw new Error(result.message);
      return result.data;
    },
    onSuccess: invalidate,
  });

  const markReadyForSale = useMutation({
    mutationFn: async (body: MarkReadyForSaleValues) => {
      if (!vehicleId) throw new Error("Missing vehicle id");
      const result = await markReadyForSaleRequest(vehicleId, body);
      if (result.status === "error") {
        const error = new Error(result.message) as Error & {
          code?: string;
          blockers?: unknown;
        };
        error.code = result.error;
        error.blockers = result.details && typeof result.details === "object"
          ? (result.details as { blockers?: unknown }).blockers
          : undefined;
        throw error;
      }
      return result.data;
    },
    onSuccess: invalidate,
  });

  return { create, update, changeStatus, transfer, archive, markReadyForSale };
}
