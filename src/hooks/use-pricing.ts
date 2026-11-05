"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import {
  approvePricingRequest,
  fetchPricingList,
  fetchVehiclePricing,
  upsertPricingRequest,
} from "@/lib/pricing/api-client";
import type {
  ApprovePricingValues,
  UpsertPricingValues,
} from "@/lib/validation/pricing";

export const pricingKeys = {
  all: ["pricing"] as const,
  list: (search: string) => ["pricing", "list", search] as const,
  detail: (vehicleId: string) => ["pricing", "detail", vehicleId] as const,
};

export function usePricingList(search: string, options?: { enabled?: boolean }) {
  return useQuery({
    queryKey: pricingKeys.list(search),
    queryFn: async () => {
      const result = await fetchPricingList(search);
      if (result.status === "error") throw new Error(result.message);
      return result.data;
    },
    enabled: options?.enabled ?? true,
  });
}

export function useVehiclePricing(vehicleId: string, enabled = true) {
  return useQuery({
    queryKey: pricingKeys.detail(vehicleId),
    queryFn: async () => {
      const result = await fetchVehiclePricing(vehicleId);
      if (result.status === "error") throw new Error(result.message);
      return result.data;
    },
    enabled: Boolean(vehicleId) && enabled,
  });
}

export function usePricingMutations(vehicleId: string) {
  const queryClient = useQueryClient();

  const invalidate = async () => {
    await queryClient.invalidateQueries({ queryKey: pricingKeys.all });
    await queryClient.invalidateQueries({ queryKey: pricingKeys.detail(vehicleId) });
    await queryClient.invalidateQueries({ queryKey: ["vehicles"] });
  };

  const upsert = useMutation({
    mutationFn: async (body: UpsertPricingValues) => {
      const result = await upsertPricingRequest(vehicleId, body);
      if (result.status === "error") {
        const error = new Error(result.message) as Error & {
          fieldErrors?: Record<string, string>;
        };
        error.fieldErrors = result.fieldErrors;
        throw error;
      }
      return result.data;
    },
    onSuccess: invalidate,
  });

  const approve = useMutation({
    mutationFn: async (body: ApprovePricingValues) => {
      const result = await approvePricingRequest(vehicleId, body);
      if (result.status === "error") throw new Error(result.message);
      return result.data;
    },
    onSuccess: invalidate,
  });

  return { upsert, approve };
}
