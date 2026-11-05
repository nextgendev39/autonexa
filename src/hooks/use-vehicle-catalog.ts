"use client";

import { useQuery } from "@tanstack/react-query";

import {
  fetchCatalogModels,
  fetchCatalogVariants,
  fetchCatalogYears,
} from "@/lib/vehicles/api-client";

export const catalogKeys = {
  brands: ["vehicle-brands"] as const,
  models: (brandId: string) => ["vehicle-models", brandId] as const,
  years: (modelId: string) => ["vehicle-years", modelId] as const,
  variants: (modelYearId: string) => ["vehicle-variants", modelYearId] as const,
};

export function useCatalogModels(makeId?: string | null) {
  return useQuery({
    queryKey: catalogKeys.models(makeId ?? ""),
    queryFn: async () => {
      const result = await fetchCatalogModels(makeId!);
      if (result.status === "error") throw new Error(result.message);
      return result.data;
    },
    enabled: Boolean(makeId),
  });
}

export function useCatalogYears(modelId?: string | null) {
  return useQuery({
    queryKey: catalogKeys.years(modelId ?? ""),
    queryFn: async () => {
      const result = await fetchCatalogYears(modelId!);
      if (result.status === "error") throw new Error(result.message);
      return result.data;
    },
    enabled: Boolean(modelId),
  });
}

export function useCatalogVariants(modelYearId?: string | null) {
  return useQuery({
    queryKey: catalogKeys.variants(modelYearId ?? ""),
    queryFn: async () => {
      const result = await fetchCatalogVariants(modelYearId!);
      if (result.status === "error") throw new Error(result.message);
      return result.data;
    },
    enabled: Boolean(modelYearId),
  });
}
