"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import {
  addExpenseRequest,
  approveAcquisitionRequest,
  cancelAcquisitionRequest,
  changeAcquisitionStatusRequest,
  createAcquisitionRequest,
  fetchAcquisition,
  fetchAcquisitionActivity,
  fetchAcquisitionHistory,
  fetchAcquisitionMeta,
  fetchAcquisitions,
  receiveAcquisitionRequest,
  rejectAcquisitionRequest,
  removeExpenseRequest,
  updateAcquisitionRequest,
  updateExpenseRequest,
} from "@/lib/acquisitions/api-client";
import type {
  AcquisitionExpenseValues,
  ApproveAcquisitionValues,
  CancelAcquisitionValues,
  ChangeAcquisitionStatusValues,
  CreateAcquisitionValues,
  ReceiveAcquisitionValues,
  RejectAcquisitionValues,
  UpdateAcquisitionValues,
} from "@/lib/validation/acquisition";

export const acquisitionKeys = {
  all: ["acquisitions"] as const,
  list: (search: string) => ["acquisitions", "list", search] as const,
  detail: (id: string) => ["acquisitions", "detail", id] as const,
  history: (id: string) => ["acquisitions", "history", id] as const,
  activity: (id: string) => ["acquisitions", "activity", id] as const,
  meta: (branchId?: string, makeId?: string) =>
    ["acquisitions", "meta", branchId ?? "", makeId ?? ""] as const,
};

export function useAcquisitionList(search: string) {
  return useQuery({
    queryKey: acquisitionKeys.list(search),
    queryFn: async () => {
      const result = await fetchAcquisitions(search);
      if (result.status === "error") throw new Error(result.message);
      return result.data;
    },
  });
}

export function useAcquisition(id: string) {
  return useQuery({
    queryKey: acquisitionKeys.detail(id),
    queryFn: async () => {
      const result = await fetchAcquisition(id);
      if (result.status === "error") throw new Error(result.message);
      return result.data;
    },
    enabled: Boolean(id),
  });
}

export function useAcquisitionHistory(id: string) {
  return useQuery({
    queryKey: acquisitionKeys.history(id),
    queryFn: async () => {
      const result = await fetchAcquisitionHistory(id);
      if (result.status === "error") throw new Error(result.message);
      return result.data;
    },
    enabled: Boolean(id),
  });
}

export function useAcquisitionActivity(id: string) {
  return useQuery({
    queryKey: acquisitionKeys.activity(id),
    queryFn: async () => {
      const result = await fetchAcquisitionActivity(id);
      if (result.status === "error") throw new Error(result.message);
      return result.data;
    },
    enabled: Boolean(id),
  });
}

export function useAcquisitionMeta(branchId?: string, makeId?: string) {
  return useQuery({
    queryKey: acquisitionKeys.meta(branchId, makeId),
    queryFn: async () => {
      const result = await fetchAcquisitionMeta({ branchId, makeId });
      if (result.status === "error") throw new Error(result.message);
      return result.data;
    },
  });
}

export function useAcquisitionMutations(acquisitionId?: string) {
  const queryClient = useQueryClient();

  const invalidate = async () => {
    await queryClient.invalidateQueries({ queryKey: acquisitionKeys.all });
    if (acquisitionId) {
      await queryClient.invalidateQueries({ queryKey: acquisitionKeys.detail(acquisitionId) });
      await queryClient.invalidateQueries({ queryKey: acquisitionKeys.history(acquisitionId) });
      await queryClient.invalidateQueries({ queryKey: acquisitionKeys.activity(acquisitionId) });
    }
  };

  const create = useMutation({
    mutationFn: async (body: CreateAcquisitionValues) => {
      const result = await createAcquisitionRequest(body);
      if (result.status === "error") {
        const error = new Error(result.message) as Error & {
          fieldErrors?: Record<string, string>;
          code?: string;
          existingVehicleId?: string;
          existingAcquisitionId?: string;
        };
        error.fieldErrors = result.fieldErrors;
        error.code = result.error;
        error.existingVehicleId = result.details?.existingVehicleId;
        error.existingAcquisitionId = result.details?.existingAcquisitionId;
        throw error;
      }
      return result.data;
    },
    onSuccess: async () => {
      await invalidate();
      await queryClient.invalidateQueries({ queryKey: ["vehicles"] });
    },
  });

  const update = useMutation({
    mutationFn: async (body: UpdateAcquisitionValues) => {
      if (!acquisitionId) throw new Error("Missing acquisition id");
      const result = await updateAcquisitionRequest(acquisitionId, body);
      if (result.status === "error") {
        const error = new Error(result.message) as Error & {
          fieldErrors?: Record<string, string>;
          code?: string;
          existingVehicleId?: string;
          existingAcquisitionId?: string;
        };
        error.fieldErrors = result.fieldErrors;
        error.code = result.error;
        error.existingVehicleId = result.details?.existingVehicleId;
        error.existingAcquisitionId = result.details?.existingAcquisitionId;
        throw error;
      }
      return result.data;
    },
    onSuccess: invalidate,
  });

  const changeStatus = useMutation({
    mutationFn: async (body: ChangeAcquisitionStatusValues) => {
      if (!acquisitionId) throw new Error("Missing acquisition id");
      const result = await changeAcquisitionStatusRequest(acquisitionId, body);
      if (result.status === "error") throw new Error(result.message);
      return result.data;
    },
    onSuccess: invalidate,
  });

  const approve = useMutation({
    mutationFn: async (body: ApproveAcquisitionValues) => {
      if (!acquisitionId) throw new Error("Missing acquisition id");
      const result = await approveAcquisitionRequest(acquisitionId, body);
      if (result.status === "error") throw new Error(result.message);
      return result.data;
    },
    onSuccess: invalidate,
  });

  const reject = useMutation({
    mutationFn: async (body: RejectAcquisitionValues) => {
      if (!acquisitionId) throw new Error("Missing acquisition id");
      const result = await rejectAcquisitionRequest(acquisitionId, body);
      if (result.status === "error") throw new Error(result.message);
      return result.data;
    },
    onSuccess: invalidate,
  });

  const cancel = useMutation({
    mutationFn: async (body: CancelAcquisitionValues) => {
      if (!acquisitionId) throw new Error("Missing acquisition id");
      const result = await cancelAcquisitionRequest(acquisitionId, body);
      if (result.status === "error") throw new Error(result.message);
      return result.data;
    },
    onSuccess: invalidate,
  });

  const receive = useMutation({
    mutationFn: async (body: ReceiveAcquisitionValues = { reason: null }) => {
      if (!acquisitionId) throw new Error("Missing acquisition id");
      const result = await receiveAcquisitionRequest(acquisitionId, body);
      if (result.status === "error") throw new Error(result.message);
      return result.data;
    },
    onSuccess: invalidate,
  });

  const addExpense = useMutation({
    mutationFn: async (body: AcquisitionExpenseValues) => {
      if (!acquisitionId) throw new Error("Missing acquisition id");
      const result = await addExpenseRequest(acquisitionId, body);
      if (result.status === "error") throw new Error(result.message);
      return result.data;
    },
    onSuccess: invalidate,
  });

  const updateExpense = useMutation({
    mutationFn: async ({
      expenseId,
      body,
    }: {
      expenseId: string;
      body: Partial<AcquisitionExpenseValues>;
    }) => {
      if (!acquisitionId) throw new Error("Missing acquisition id");
      const result = await updateExpenseRequest(acquisitionId, expenseId, body);
      if (result.status === "error") throw new Error(result.message);
      return result.data;
    },
    onSuccess: invalidate,
  });

  const removeExpense = useMutation({
    mutationFn: async (expenseId: string) => {
      if (!acquisitionId) throw new Error("Missing acquisition id");
      const result = await removeExpenseRequest(acquisitionId, expenseId);
      if (result.status === "error") throw new Error(result.message);
      return result.data;
    },
    onSuccess: invalidate,
  });

  return {
    create,
    update,
    changeStatus,
    approve,
    reject,
    cancel,
    receive,
    addExpense,
    updateExpense,
    removeExpense,
  };
}
