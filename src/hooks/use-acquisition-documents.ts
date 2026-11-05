"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import {
  addAcquisitionDocumentRequest,
  deleteAcquisitionDocumentRequest,
  fetchAcquisitionDocuments,
  replaceAcquisitionDocumentRequest,
  updateAcquisitionDocumentRequest,
} from "@/lib/acquisitions/document-api-client";
import type {
  AddAcquisitionDocumentValues,
  ReplaceAcquisitionDocumentValues,
  UpdateAcquisitionDocumentMetaValues,
} from "@/lib/validation/acquisition-document";
import { acquisitionKeys } from "@/hooks/use-acquisitions";
import { vehicleKeys } from "@/hooks/use-vehicles";

export const acquisitionDocumentKeys = {
  all: (acquisitionId: string) => ["acquisitions", acquisitionId, "documents"] as const,
};

export function useAcquisitionDocuments(acquisitionId: string, enabled = true) {
  return useQuery({
    queryKey: acquisitionDocumentKeys.all(acquisitionId),
    queryFn: async () => {
      const result = await fetchAcquisitionDocuments(acquisitionId);
      if (result.status === "error") throw new Error(result.message);
      return result.data;
    },
    enabled: Boolean(acquisitionId) && enabled,
  });
}

export function useAcquisitionDocumentMutations(acquisitionId: string, vehicleId?: string) {
  const queryClient = useQueryClient();

  function invalidate() {
    void queryClient.invalidateQueries({
      queryKey: acquisitionDocumentKeys.all(acquisitionId),
    });
    void queryClient.invalidateQueries({ queryKey: acquisitionKeys.detail(acquisitionId) });
    void queryClient.invalidateQueries({ queryKey: acquisitionKeys.activity(acquisitionId) });
    if (vehicleId) {
      void queryClient.invalidateQueries({
        queryKey: ["vehicles", vehicleId, "documents"],
      });
      void queryClient.invalidateQueries({ queryKey: vehicleKeys.detail(vehicleId) });
    }
  }

  const add = useMutation({
    mutationFn: async (body: AddAcquisitionDocumentValues) => {
      const result = await addAcquisitionDocumentRequest(acquisitionId, body);
      if (result.status === "error") throw new Error(result.message);
      return result.data;
    },
    onSuccess: invalidate,
  });

  const replace = useMutation({
    mutationFn: async ({
      documentId,
      body,
    }: {
      documentId: string;
      body: ReplaceAcquisitionDocumentValues;
    }) => {
      const result = await replaceAcquisitionDocumentRequest(
        acquisitionId,
        documentId,
        body,
      );
      if (result.status === "error") throw new Error(result.message);
      return result.data;
    },
    onSuccess: invalidate,
  });

  const updateMeta = useMutation({
    mutationFn: async ({
      documentId,
      body,
    }: {
      documentId: string;
      body: UpdateAcquisitionDocumentMetaValues;
    }) => {
      const result = await updateAcquisitionDocumentRequest(
        acquisitionId,
        documentId,
        body,
      );
      if (result.status === "error") throw new Error(result.message);
      return result.data;
    },
    onSuccess: invalidate,
  });

  const remove = useMutation({
    mutationFn: async (documentId: string) => {
      const result = await deleteAcquisitionDocumentRequest(acquisitionId, documentId);
      if (result.status === "error") throw new Error(result.message);
      return result.data;
    },
    onSuccess: invalidate,
  });

  return { add, replace, updateMeta, remove };
}
