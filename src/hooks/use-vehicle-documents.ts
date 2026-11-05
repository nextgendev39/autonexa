"use client";

import { useQuery } from "@tanstack/react-query";

import type { VehicleCostSummary, VehicleDocumentsResult } from "@/types/vehicle-document";

type ApiSuccess<T> = { status: "success"; data: T };
type ApiFailure = { status: "error"; message: string };

async function fetchVehicleDocumentsBundle(vehicleId: string) {
  const response = await fetch(`/api/vehicles/${vehicleId}/documents`, {
    credentials: "same-origin",
    headers: { Accept: "application/json" },
  });
  const json = (await response.json()) as
    | ApiSuccess<{ documents: VehicleDocumentsResult; costs: VehicleCostSummary | null }>
    | ApiFailure;
  if (!json || json.status === "error") {
    throw new Error(json && "message" in json ? json.message : "Failed to load documents");
  }
  return json.data;
}

export function useVehicleDocuments(vehicleId: string) {
  return useQuery({
    queryKey: ["vehicles", vehicleId, "documents"],
    queryFn: () => fetchVehicleDocumentsBundle(vehicleId),
    enabled: Boolean(vehicleId),
  });
}
