"use client";

import { useRouter } from "@/lib/i18n/navigation";
import { postAuthJson } from "@/lib/auth/client";
import { disablePush } from "@/lib/notifications/push-client";
import { initialAuthState, type AuthActionState } from "@/types/auth";
import { useCallback, useState } from "react";

export function useAuthSubmit(path: string) {
  const router = useRouter();
  const [state, setState] = useState<AuthActionState>(initialAuthState);
  const [pending, setPending] = useState(false);

  const submit = useCallback(
    async (values: Record<string, unknown>) => {
      setPending(true);
      setState(initialAuthState);
      try {
        const result = await postAuthJson(path, values);
        setState(result);
        if (result.status === "success" && result.redirectTo) {
          router.push(result.redirectTo);
          router.refresh();
        }
        return result;
      } finally {
        setPending(false);
      }
    },
    [path, router],
  );

  return { state, pending, submit };
}

export async function signOutClient() {
  // Stop this browser receiving the signed-out user's push alerts.
  await disablePush().catch(() => undefined);
  const result = await postAuthJson("/api/auth/logout", {});
  if (typeof window !== "undefined") {
    window.location.href = result.redirectTo ?? "/login";
  }
}
