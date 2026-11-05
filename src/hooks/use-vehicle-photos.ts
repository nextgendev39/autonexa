"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import {
  addVehiclePhotosRequest,
  deleteVehiclePhotoRequest,
  deleteVehiclePhotosRequest,
  fetchVehiclePhotos,
  reorderVehiclePhotosRequest,
  updateVehiclePhotoRequest,
} from "@/lib/vehicles/photo-api-client";
import type {
  AddVehiclePhotoValues,
  ReorderVehiclePhotosValues,
  UpdateVehiclePhotoValues,
} from "@/lib/validation/vehicle-photo";
import { vehicleKeys } from "@/hooks/use-vehicles";

export const vehiclePhotoKeys = {
  all: (vehicleId: string) => ["vehicles", vehicleId, "photos"] as const,
};

export function useVehiclePhotos(vehicleId: string, enabled = true) {
  return useQuery({
    queryKey: vehiclePhotoKeys.all(vehicleId),
    queryFn: async () => {
      const result = await fetchVehiclePhotos(vehicleId);
      if (result.status === "error") throw new Error(result.message);
      return result.data;
    },
    enabled: Boolean(vehicleId) && enabled,
  });
}

export function useVehiclePhotoMutations(vehicleId: string) {
  const queryClient = useQueryClient();

  function invalidate() {
    void queryClient.invalidateQueries({ queryKey: vehiclePhotoKeys.all(vehicleId) });
    void queryClient.invalidateQueries({ queryKey: vehicleKeys.detail(vehicleId) });
    void queryClient.invalidateQueries({ queryKey: vehicleKeys.all });
  }

  const addMany = useMutation({
    mutationFn: async (photos: AddVehiclePhotoValues[]) => {
      const result = await addVehiclePhotosRequest(vehicleId, photos);
      if (result.status === "error") throw new Error(result.message);
      return result.data;
    },
    onSuccess: invalidate,
  });

  const update = useMutation({
    mutationFn: async ({
      photoId,
      body,
    }: {
      photoId: string;
      body: UpdateVehiclePhotoValues;
    }) => {
      const result = await updateVehiclePhotoRequest(vehicleId, photoId, body);
      if (result.status === "error") throw new Error(result.message);
      return result.data;
    },
    onSuccess: invalidate,
  });

  const remove = useMutation({
    mutationFn: async (photoId: string) => {
      const result = await deleteVehiclePhotoRequest(vehicleId, photoId);
      if (result.status === "error") throw new Error(result.message);
      return result.data;
    },
    onSuccess: invalidate,
  });

  const removeMany = useMutation({
    mutationFn: async (photoIds: string[]) => {
      const result = await deleteVehiclePhotosRequest(vehicleId, { photoIds });
      if (result.status === "error") throw new Error(result.message);
      return result.data;
    },
    onSuccess: invalidate,
  });

  const reorder = useMutation({
    mutationFn: async (body: ReorderVehiclePhotosValues) => {
      const result = await reorderVehiclePhotosRequest(vehicleId, body);
      if (result.status === "error") throw new Error(result.message);
      return result.data;
    },
    onSuccess: invalidate,
  });

  return { addMany, update, remove, removeMany, reorder };
}
